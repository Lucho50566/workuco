/**
 * Pruebas de la base para ofrecer servicios a empresas: interés por servicio, permiso de contacto,
 * cantidad de empleados y la lista del admin.
 *   node tools/test-services.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4625;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-services-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const h = {};
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {}, text };
  }
  return {
    get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    put: (p, b) => req(p, { method: 'PUT', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }),
  };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    await waitServer();
    const pub = client();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Bodega Servicios', email: 'bodega@servicios.workuco', phone: '2622 405405', password: 'clave12345', acceptTerms: true });

    console.log('— Lista de servicios —');
    const g = await emp.get('/api/company/services');
    check('la empresa ve los servicios', g.status === 200 && ['ia', 'web', 'sistemas'].every((id) => g.data.services.some((s) => s.id === id && s.label && s.description)), JSON.stringify(g.data).slice(0, 200));
    check('arranca sin interés y sin permiso', g.data.interest && g.data.interest.services.length === 0 && g.data.interest.marketingOk === false);
    check('sin sesión de empresa no se puede', (await pub.get('/api/company/services')).status === 401);
    const per = client();
    await per.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    check('una persona tampoco', (await per.put('/api/company/services', { services: ['web'], marketingOk: true })).status === 401);

    console.log('— Me interesa —');
    const sinPermiso = await emp.put('/api/company/services', { services: ['web'], note: 'Quiero una web', marketingOk: false });
    check('sin permiso de contacto no se guarda', sinPermiso.status === 400 && sinPermiso.data.fields && sinPermiso.data.fields.marketingOk, JSON.stringify(sinPermiso.data));
    check('y no quedó nada', (await emp.get('/api/company/services')).data.interest.services.length === 0);
    const r = await emp.put('/api/company/services', { services: ['web', 'ia', 'inventado', 'web'], note: '  Necesito <b>una web</b>   y respuestas automáticas  ', marketingOk: true });
    check('con permiso se guarda', r.status === 200, JSON.stringify(r.data));
    check('lo inválido y repetido se descarta', JSON.stringify(r.data.interest.services) === '["web","ia"]', JSON.stringify(r.data.interest));
    check('la nota se limpia', r.data.interest.note === 'Necesito <b>una web</b> y respuestas automáticas' || r.data.interest.note === 'Necesito una web y respuestas automáticas', r.data.interest.note);
    check('queda la fecha y el permiso', r.data.interest.marketingOk === true && r.data.interest.at > 0);
    const largo = await emp.put('/api/company/services', { services: ['sistemas'], note: 'x'.repeat(900), marketingOk: true });
    check('la nota se corta en 600', largo.status === 200 && largo.data.interest.note.length === 600);

    console.log('— Cantidad de empleados —');
    const e1 = await emp.patch('/api/company/profile', { employees: '6 a 20' });
    check('se guarda la cantidad de empleados', e1.status === 200 && e1.data.company.employees === '6 a 20', JSON.stringify(e1.data.company || e1.data).slice(0, 200));
    const e2 = await emp.patch('/api/company/profile', { employees: 'muchísimos' });
    check('un valor inventado queda vacío', e2.data.company.employees === '');
    await emp.patch('/api/company/profile', { employees: '21 a 50', website: 'https://bodega.example.com' });

    console.log('— El admin ve a los interesados —');
    const otra = client();
    await otra.post('/api/auth/register', { role: 'company', name: 'Finca Sin Interés', email: 'finca@servicios.workuco', phone: '2622 406406', password: 'clave12345', acceptTerms: true });
    const a = await admin.get('/api/admin/services');
    check('el admin entra', a.status === 200, JSON.stringify(a.data).slice(0, 200));
    const fila = (a.data.interested || []).find((x) => x.email === 'bodega@servicios.workuco');
    check('aparece la empresa interesada con sus datos', !!fila && fila.name === 'Bodega Servicios' && fila.phone === '2622 405405' && fila.employees === '21 a 50' && fila.website === 'https://bodega.example.com' && JSON.stringify(fila.services) === '["sistemas"]' && fila.at > 0, JSON.stringify(fila));
    check('no aparece la que no pidió nada', !(a.data.interested || []).some((x) => x.email === 'finca@servicios.workuco'));
    check('trae la lista de servicios para mostrar nombres', Array.isArray(a.data.services) && a.data.services.length >= 3);
    check('sin ser admin no se puede', (await emp.get('/api/admin/services')).status === 401 && (await pub.get('/api/admin/services')).status === 401);

    console.log('— Retirar el interés —');
    const off = await emp.put('/api/company/services', { services: [], note: '', marketingOk: false });
    check('se puede retirar', off.status === 200 && off.data.interest.services.length === 0 && off.data.interest.marketingOk === false);
    check('y deja de aparecerle al admin', !((await admin.get('/api/admin/services')).data.interested || []).some((x) => x.email === 'bodega@servicios.workuco'));

    console.log('— Datos personales —');
    await emp.put('/api/company/services', { services: ['ia'], note: 'Bot de WhatsApp', marketingOk: true });
    const ex = await emp.get('/api/account/export');
    check('"Descargar mis datos" incluye el interés y el permiso', ex.status === 200 && /Bot de WhatsApp/.test(ex.text) && /"marketing_ok":\s*1/.test(ex.text), ex.text.slice(0, 120));
    const info = await pub.get('/app.js');
    check('la política de privacidad explica esta finalidad', info.status === 200 && /Propuestas de servicios para empresas/.test(info.text) && /se puede retirar/.test(info.text));
    const del = await emp.post('/api/account/delete', { password: 'clave12345' });
    check('al borrar la cuenta', del.status === 200, JSON.stringify(del.data));
    check('desaparece de la lista del admin', !((await admin.get('/api/admin/services')).data.interested || []).some((x) => x.email === 'bodega@servicios.workuco'));
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill();
    await new Promise((res) => setTimeout(res, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
