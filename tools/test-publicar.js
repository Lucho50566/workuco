/**
 * Pruebas del formulario de publicar: sueldo de referencia del rubro (sólo con avisos aprobados y al menos 3),
 * borrador sin cuenta, errores al lado de cada campo, próximos pasos y que "next" no saque a otro sitio.
 *
 *   node tools/test-publicar.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4664;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-publicar-${Date.now()}`);

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const h = { Origin: BASE };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    let data = {}; try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }) };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}

async function main() {
  console.log('— Archivos —');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'publicar.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  check('la descripción tiene su lugar para el error', /data-error="description"/.test(html));
  check('el sueldo tiene lugar para la referencia del rubro', /id="salary-hint"/.test(html));
  check('el sueldo "hasta" y la fecha de inicio se pueden marcar en rojo', /id="j-salary-max" name="salaryMax"/.test(html) && /id="j-start" name="startDate"/.test(html));
  check('sin cuenta se arma el aviso (no hay muro)', /const guest = !user/.test(app) && /Crear cuenta y enviar/.test(app));
  check('el borrador vence a los 7 días y se borra al enviar', /DRAFT_DAYS = 7/.test(app) && /clearDraft\(\)/.test(app));
  check('después de publicar se muestran próximos pasos', /Mientras lo revisamos/.test(app));
  const nextRe = /const next = \/(.+?)\/\.test/.exec(app);
  check('"next" sólo acepta rutas de este sitio', !!nextRe);
  if (nextRe) {
    const re = new RegExp(nextRe[1].replace(/\\\//g, '/'));
    check('  /publicar?borrador=1 pasa', re.test('/publicar?borrador=1'));
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)']) check(`  ${bad} no pasa`, !re.test(bad));
  }

  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '' },
  });
  try {
    await waitServer();
    console.log('— Sueldo de referencia —');
    const anon = client();
    check('sin sesión no se puede pedir', (await anon.get('/api/company/salary-hint?category=Agricultura&period=día')).status === 401);
    const emp = client();
    const lg = await emp.post('/api/auth/login', { role: 'company', email: 'bodega@demo.workuco', password: 'demo12345' });
    check('la empresa de la demo entra', lg.status === 200, JSON.stringify(lg.data));
    check('rubro inventado: 400', (await emp.get('/api/company/salary-hint?category=Inventado&period=mes')).status === 400);
    check('período inventado: 400', (await emp.get('/api/company/salary-hint?category=Agricultura&period=semana')).status === 400);
    const h = (await emp.get(`/api/company/salary-hint?category=Agricultura&period=${encodeURIComponent('día')}`)).data.hint;
    check('Agricultura por día: hay referencia con 3 o más avisos', !!h && h.count >= 3 && h.min > 0 && h.max >= h.min, JSON.stringify(h));
    const few = (await emp.get('/api/company/salary-hint?category=Construcci%C3%B3n&period=hora')).data;
    check('con menos de 3 avisos no se sugiere nada', few.hint === null, JSON.stringify(few));

    /* un aviso pendiente con un sueldo enorme no cambia la referencia: sólo cuentan los aprobados */
    const r = await emp.post('/api/company/jobs', {
      title: 'Cosechadores de prueba', locality: 'Tunuyán', category: 'Agricultura', type: 'Temporal', modality: 'Presencial',
      description: 'Aviso de prueba para ver que un pendiente no cambia el sueldo de referencia del rubro.',
      contactEmail: 'bodega@demo.workuco', salaryMin: 9999999, salaryMax: 9999999, salaryPeriod: 'día', gig: true, startDate: '2027-02-10',
    });
    check('se publica un aviso (queda pendiente)', r.status === 201, JSON.stringify(r.data).slice(0, 200));
    const h2 = (await emp.get(`/api/company/salary-hint?category=Agricultura&period=${encodeURIComponent('día')}`)).data.hint;
    check('el pendiente no cuenta para la referencia', !!h2 && h2.count === h.count && h2.max === h.max, JSON.stringify(h2));
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
