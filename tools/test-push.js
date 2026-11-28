/**
 * Pruebas de punta a punta de los avisos en el celular (Web Push):
 * activar y desactivar, avisos al admin de cosas para revisar, avisos importantes a personas y empresas,
 * texto seguro en la pantalla bloqueada y limpieza al borrar la cuenta.
 * Usa WORKUCO_PUSH_FAKE=1: nada sale a internet, cada aviso queda en <data>/push-outbox.jsonl.
 *
 *   node tools/test-push.js
 */
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4637;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-push-${Date.now()}`);
const OUTBOX = path.join(DATA, 'push-outbox.jsonl');
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
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), cookie: () => cookie };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pushes = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const to = (endpoint) => pushes().filter((m) => m.endpoint === endpoint).map((m) => m.message);
/* una suscripción como la que arma el navegador */
function fakeSub(name) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${crypto.randomBytes(6).toString('hex')}`,
    keys: { p256dh: e.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_MAIL_FAKE: '1', WORKUCO_PUSH_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  let log = '';
  child.stderr.on('data', (d) => { log += d; });
  try {
    await waitServer();
    const pub = client();
    console.log('— Activar —');
    const key = await pub.get('/api/push/key');
    check('la clave pública del servidor está disponible', key.status === 200 && Buffer.from(key.data.publicKey, 'base64url').length === 65);
    check('las claves quedan guardadas en la carpeta de datos (no en el repo)', fs.existsSync(path.join(DATA, 'vapid.json')));
    check('sin cuenta no se puede activar', (await pub.post('/api/push/subscribe', { subscription: fakeSub('x') })).status === 401);

    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const adminSub = fakeSub('admin');
    check('el admin activa los avisos en su celular', (await admin.post('/api/push/subscribe', { subscription: adminSub })).status === 200);
    await wait(100);
    check('le llega uno de prueba al activarlos', to(adminSub.endpoint).some((m) => /Listo/.test(m.title) && m.url === '/admin'));
    check('el estado dice que está activo', (await admin.post('/api/push/status', { endpoint: adminSub.endpoint })).data.on === true);
    const bad = await admin.post('/api/push/subscribe', { subscription: { ...adminSub, endpoint: 'https://evil.example/x' } });
    check('una dirección que no es de un servicio de push se rechaza', bad.status === 400);

    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Finca Push', email: 'finca@test.workuco', phone: '2622 405405', password: 'clave12345', acceptTerms: true });
    await wait(100);
    check('al admin le avisa que hay una empresa nueva', to(adminSub.endpoint).some((m) => /Empresa nueva/.test(m.title) && /Finca Push/.test(m.body)));
    const empSub = fakeSub('empresa');
    await emp.post('/api/push/subscribe', { subscription: empSub });

    console.log('— Avisos al admin —');
    const job = (await emp.post('/api/company/jobs', { title: 'Tractorista para finca', description: 'Manejo de tractor y tareas generales de la finca, con experiencia, turno mañana.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'finca@test.workuco' })).data.job;
    await wait(100);
    check('aviso nuevo para aprobar → al celular del admin', to(adminSub.endpoint).some((m) => /Aviso nuevo para aprobar/.test(m.title) && /Tractorista/.test(m.body)));
    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Push', email: 'ana@test.workuco', phone: '2622 406406', password: 'clave12345', acceptTerms: true });
    await ana.post('/api/vecinos', { title: 'Cortar el pasto del fondo', description: 'Patio de 10 x 15, tengo la máquina.', category: 'jardin', locality: 'Tunuyán', area: 'Barrio Centro', whenNote: 'Este sábado', pay: '15000', payUnit: 'trabajo' });
    await wait(100);
    check('pedido de vecinos para revisar → al celular del admin', to(adminSub.endpoint).some((m) => /vecinos/.test(m.title) && /pasto/.test(m.body)));

    console.log('— Avisos a personas y empresas —');
    const anaSub = fakeSub('ana');
    await ana.post('/api/push/subscribe', { subscription: anaSub });
    await admin.patch(`/api/admin/jobs/${job.id}`, { status: 'approved' });
    await wait(100);
    check('a la empresa le llega "tu aviso ya está publicado"', to(empSub.endpoint).some((m) => /publicado/.test(m.title) && m.url.startsWith('/oferta/')));
    await ana.post(`/api/jobs/${job.id}/apply`, { name: 'Ana Push', email: 'ana@test.workuco', phone: '2622 406406', message: 'Hola, tengo experiencia.' });
    await wait(150);
    const post = to(empSub.endpoint).find((m) => /Nueva postulación/.test(m.title));
    check('a la empresa le llega la postulación nueva', !!post);
    check('sin el nombre de quien se postuló (se ve en la pantalla bloqueada)', post && !/Ana/.test(post.title + post.body), JSON.stringify(post));
    check('los avisos sólo llevan links internos', pushes().every((m) => /^\/(?!\/)/.test(m.message.url)));

    console.log('— Extra "Avisar al celular" —');
    const caro = client();
    await caro.post('/api/auth/register', { role: 'candidate', name: 'Caro Push', email: 'caro@test.workuco', phone: '2622 408408', password: 'clave12345', acceptTerms: true });
    const caroSub = fakeSub('caro');
    await caro.post('/api/push/subscribe', { subscription: caroSub });
    await caro.patch('/api/account/prefs', { localities: ['San Carlos'], pushJobs: true });
    const sinOk = await emp.get(`/api/company/jobs/${job.id}/push`);
    check('sin nadie de la zona que lo pidió, el alcance es 0 y no se puede mandar', sinOk.data.reach === 0 && sinOk.data.canSend === false, JSON.stringify(sinOk.data));
    const pr = await ana.patch('/api/account/prefs', { localities: ['Tunuyán'], pushJobs: true });
    check('la persona elige recibir avisos de empleos nuevos', pr.data.prefs && pr.data.prefs.pushJobs === true);
    const st = (await emp.get(`/api/company/jobs/${job.id}/push`)).data;
    check('la empresa ve el alcance real (sólo Tunuyán, sólo quien lo pidió)', st.reach === 1 && st.free === true && st.canSend === true, JSON.stringify(st));
    const sent = await emp.post(`/api/company/jobs/${job.id}/push`);
    await wait(150);
    check('en lanzamiento se manda gratis y enseguida', sent.status === 200 && sent.data.sent === 1, JSON.stringify(sent.data));
    check('a la persona de la zona le llega el aviso con link a la oferta', to(anaSub.endpoint).some((m) => /Empleo nuevo en Tunuyán/.test(m.title) && m.url === `/oferta/${job.id}`));
    check('a la de otra zona no le llega', !to(caroSub.endpoint).some((m) => /Empleo nuevo/.test(m.title)));
    check('la empresa recibe a cuántas personas les llegó', to(empSub.endpoint).some((m) => /le llegó al celular a 1 persona/.test(m.title)));
    check('se manda una sola vez por aviso', (await emp.post(`/api/company/jobs/${job.id}/push`)).status === 400);
    const job2 = (await emp.post('/api/company/jobs', { title: 'Encargado de riego', description: 'Manejo de riego por goteo y mantenimiento general de la finca, turno mañana.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'finca@test.workuco' })).data.job;
    await admin.patch(`/api/admin/jobs/${job2.id}`, { status: 'approved' });
    check('como mucho uno por día por persona', (await emp.get(`/api/company/jobs/${job2.id}/push`)).data.reach === 0);
    const put = await (await fetch(`${BASE}/api/admin/payments/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie() }, body: JSON.stringify({ pushPrice: 4200 }) })).json();
    check('el admin cambia el precio', put.settings && put.settings.pushPrice === 4200, JSON.stringify(put));
    check('un precio inválido se rechaza', (await fetch(`${BASE}/api/admin/payments/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie() }, body: JSON.stringify({ pushPrice: 50 }) })).status === 400);
    check('la empresa ve el precio nuevo', (await emp.get(`/api/company/jobs/${job2.id}/push`)).data.price === 4200);

    console.log('— Desactivar y borrar —');
    await ana.post('/api/push/unsubscribe', { endpoint: anaSub.endpoint });
    check('al desactivar, el estado dice que no', (await ana.post('/api/push/status', { endpoint: anaSub.endpoint })).data.on === false);
    const other = client();
    await other.post('/api/auth/register', { role: 'candidate', name: 'Leo Push', email: 'leo@test.workuco', phone: '2622 407407', password: 'clave12345', acceptTerms: true });
    await other.post('/api/push/unsubscribe', { endpoint: empSub.endpoint });
    check('nadie puede desactivar el celular de otra cuenta', (await emp.post('/api/push/status', { endpoint: empSub.endpoint })).data.on === true);
    const del = await emp.post('/api/account/delete', { password: 'clave12345' });
    check('la empresa se da de baja', del.status === 200, JSON.stringify(del.data));
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    check('al borrar la cuenta se borra su celular', db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE endpoint=?').get(empSub.endpoint).n === 0);
    db.close();
  } finally {
    child.kill();
    await wait(200);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\npush: ${ok} ok, ${fail} fallas`);
  if (fail) { console.log(log.slice(-2000)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
