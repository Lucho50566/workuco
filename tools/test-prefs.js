/**
 * Pruebas de las preferencias de la cuenta: localidades, jornada, modalidad, changas
 * y qué avisos llegan por mail (por tipo), para personas y empresas.
 *   node tools/test-prefs.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4615;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-prefs-${Date.now()}`);
const OUTBOX = path.join(DATA, 'outbox.jsonl');
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
    return { status: res.status, data: data || {} };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const outbox = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const mailsTo = (to) => outbox().filter((m) => m.to === to);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

    console.log('— Guardar y leer —');
    const marta = client();
    await marta.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    const r = await marta.patch('/api/account/prefs', { localities: ['Tunuyán', 'Mendoza'], types: ['Medio tiempo', 'Inventado'], modalities: ['Presencial'], gigs: false, mail: { alertas: false, inventado: false } });
    check('se guardan', r.status === 200);
    const me = (await marta.get('/api/me')).data.user.candidate.prefs;
    check('lo inválido se descarta', JSON.stringify(me.localities) === '["Tunuyán"]' && JSON.stringify(me.types) === '["Medio tiempo"]' && JSON.stringify(me.modalities) === '["Presencial"]');
    check('changas y mails por tipo', me.gigs === false && me.mail.alertas === false && me.mail.postulaciones === true && !('inventado' in me.mail));
    check('sin sesión no se puede', (await pub.patch('/api/account/prefs', { gigs: false })).status === 401);

    console.log('— Búsqueda con varias localidades —');
    const all = (await pub.get('/api/jobs?limit=30')).data.jobs;
    check('hay avisos de las tres localidades (precondición)', ['San Carlos', 'Tunuyán', 'Tupungato'].every((l) => all.some((j) => j.locality === l)));
    const two = (await pub.get(`/api/jobs?limit=30&locality=${encodeURIComponent('San Carlos,Tunuyán')}`)).data.jobs;
    check('trae de las dos y ninguna de Tupungato', two.some((j) => j.locality === 'San Carlos') && two.some((j) => j.locality === 'Tunuyán') && !two.some((j) => j.locality === 'Tupungato'));
    check('una localidad inventada no rompe la búsqueda', (await pub.get('/api/jobs?locality=Mendoza')).status === 200);

    console.log('— "Para vos" respeta jornada, modalidad y changas —');
    await marta.patch('/api/account/prefs', { types: [], modalities: [], gigs: true });
    const antes = (await marta.get('/api/candidate/recommended')).data.jobs;
    check('sin preferencias hay de tiempo completo (precondición)', antes.some((j) => j.type === 'Tiempo completo'), JSON.stringify(antes.map((j) => j.type)));
    await marta.patch('/api/account/prefs', { types: ['Medio tiempo', 'Temporal'] });
    const despues = (await marta.get('/api/candidate/recommended')).data.jobs;
    check('con jornada elegida no aparecen otras', despues.every((j) => ['Medio tiempo', 'Temporal'].includes(j.type)), JSON.stringify(despues.map((j) => j.type)));
    await marta.patch('/api/account/prefs', { types: [], gigs: false });
    check('sin changas no aparecen changas', (await marta.get('/api/candidate/recommended')).data.jobs.every((j) => !j.gig));
    await marta.patch('/api/account/prefs', { modalities: ['Remoto'], gigs: true });
    check('con modalidad elegida no aparecen otras', (await marta.get('/api/candidate/recommended')).data.jobs.every((j) => j.modality === 'Remoto'));

    console.log('— Avisos por mail según el tipo —');
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Bodega Prefs', email: 'bodega@prefs.workuco', phone: '2622 401401', password: 'clave12345', acceptTerms: true });
    const j = await emp.post('/api/company/jobs', { title: 'Operario de bodega', description: 'Fraccionamiento y limpieza de tanques en la bodega, turno mañana, con ganas de aprender.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'bodega@prefs.workuco' });
    await emp.patch('/api/account/prefs', { mail: { postulantes: false } });

    console.log('— Alertas con varias localidades —');
    const luz = client();
    await luz.post('/api/auth/register', { role: 'candidate', name: 'Luz Alerta', email: 'luz@prefs.workuco', phone: '2622 404404', password: 'clave12345', acceptTerms: true });
    const al = await luz.post('/api/candidate/alerts', { locality: 'San Carlos,Tunuyán', q: 'bodega' });
    check('la alerta guarda las dos localidades', al.status === 201 && /San Carlos/.test(al.data.alert.label) && /Tunuyán/.test(al.data.alert.label), JSON.stringify(al.data));
    const lejos = await luz.post('/api/candidate/alerts', { locality: 'Tupungato', category: 'Agricultura' });
    check('una sola localidad sigue funcionando', lejos.status === 201);
    await admin.patch(`/api/admin/jobs/${j.data.job.id}`, { status: 'approved' });
    await wait(200);
    const nl = JSON.stringify((await luz.get('/api/notifications')).data);
    check('un aviso en Tunuyán dispara la alerta de "San Carlos o Tunuyán"', /Operario de bodega/.test(nl), nl.slice(0, 200));
    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Prefs', email: 'ana@prefs.workuco', phone: '2622 402402', password: 'clave12345', acceptTerms: true });
    await ana.post(`/api/jobs/${j.data.job.id}/apply`, { message: 'Hola' });
    await wait(200);
    const bm = mailsTo('bodega@prefs.workuco');
    check('la empresa recibe "aviso publicado"', bm.some((m) => /publicado/i.test(m.subject)));
    check('pero no el de postulantes (lo apagó)', !bm.some((m) => /Nueva postulación/.test(m.subject)));
    check('la campanita sí lo tiene', JSON.stringify((await emp.get('/api/notifications')).data).includes('Ana Prefs'));
    await ana.patch('/api/account/prefs', { mail: { postulaciones: false } });
    const app = (await emp.get('/api/company/applications')).data.applications.find((a) => a.email === 'ana@prefs.workuco');
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'entrevista' });
    await wait(200);
    check('la persona no recibe el mail de su postulación (lo apagó)', !mailsTo('ana@prefs.workuco').some((m) => /entrevistar/i.test(m.subject)));
    check('pero la campanita sí', JSON.stringify((await ana.get('/api/notifications')).data).includes('entrevistar'));
    await ana.patch('/api/account/prefs', { mail: { postulaciones: true } });
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'ofrecido' });
    await wait(200);
    check('prendido otra vez, llega', mailsTo('ana@prefs.workuco').some((m) => /oferta/i.test(m.subject)));
    await ana.patch('/api/account/prefs', { mailNotices: false });
    const antesTodo = mailsTo('ana@prefs.workuco').length;
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'contratado' });
    await wait(200);
    check('"mailNotices: false" apaga todos', mailsTo('ana@prefs.workuco').length === antesTodo);
    check('y queda reflejado en las preferencias', Object.values((await ana.get('/api/me')).data.user.candidate.prefs.mail).every((v) => v === false));
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
