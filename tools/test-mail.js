/**
 * Pruebas de mails (Resend), recuperar y cambiar contraseña y avisos por mail.
 * Usa WORKUCO_MAIL_FAKE=1: nada sale a internet, cada mail queda en <data>/outbox.jsonl.
 *
 *   node tools/test-mail.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createMailer } = require('../lib/mail');

const ROOT = path.join(__dirname, '..');
const PORT = 4613;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-mail-${Date.now()}`);
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
    return { status: res.status, data: data || {}, text };
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
const tokenIn = (m) => ((m && m.text) || '').match(/\/restablecer#t=([a-f0-9]{64})/);

async function main() {
  console.log('— Cliente de Resend —');
  let sent = null;
  const fakeFetch = async (url, opts) => { sent = { url, opts }; return { ok: true, json: async () => ({ id: 'abc123' }) }; };
  const m = createMailer({ apiKey: 're_test', from: 'WorkUco <avisos@workuco.com.ar>', replyTo: 'hola@workuco.com.ar', fetchImpl: fakeFetch });
  const r = await m.send({ to: 'ana@x.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' });
  const body = JSON.parse(sent.opts.body);
  check('llama a la API de Resend con la clave', sent.url === 'https://api.resend.com/emails' && sent.opts.headers.Authorization === 'Bearer re_test');
  check('manda remitente, destinatario, asunto, HTML, texto y respuesta', body.from === 'WorkUco <avisos@workuco.com.ar>' && body.to[0] === 'ana@x.com' && body.subject === 'Hola' && body.html && body.text && body.reply_to === 'hola@workuco.com.ar');
  check('devuelve el id', r.ok && r.id === 'abc123');
  const bad = createMailer({ apiKey: 're_test', fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ message: 'dominio sin verificar' }) }) });
  const origWarn = console.warn; console.warn = () => {};
  const br = await bad.send({ to: 'a@b.com', subject: 'x', html: 'x', text: 'x' });
  console.warn = origWarn;
  check('si Resend falla, no rompe: devuelve el error', !br.ok && /dominio/.test(br.error));
  check('sin clave queda desactivado', createMailer({}).mode === 'off');

  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    await waitServer();
    const pub = client();

    console.log('— Olvidé mi contraseña —');
    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Mail', email: 'ana@test.workuco', phone: '2622 402402', password: 'vieja12345', acceptTerms: true });
    const otroEquipo = client();
    await otroEquipo.post('/api/auth/login', { role: 'candidate', email: 'ana@test.workuco', password: 'vieja12345' });
    const r1 = await pub.post('/api/auth/forgot', { role: 'candidate', email: 'ana@test.workuco' });
    const r2 = await pub.post('/api/auth/forgot', { role: 'candidate', email: 'nadie@test.workuco' });
    check('responde igual exista o no la cuenta', r1.status === 200 && r2.status === 200 && r1.data.message === r2.data.message);
    await wait(150);
    const mails = mailsTo('ana@test.workuco');
    const tok = tokenIn(mails[mails.length - 1]);
    check('le llega el mail con el link', !!tok && /Creá una contraseña nueva/.test(mails[mails.length - 1].subject));
    check('el link usa el dominio público y lleva el código después del #', /https:\/\/workuco\.com\.ar\/restablecer#t=/.test(mails[mails.length - 1].text));
    check('a una cuenta que no existe no se le manda nada', mailsTo('nadie@test.workuco').length === 0);
    check('el mail tiene versión HTML con botón', /Crear contraseña nueva/.test(mails[mails.length - 1].html));

    check('código inventado: no sirve', (await pub.post('/api/auth/reset', { token: 'a'.repeat(64), password: 'nueva12345' })).status === 400);
    check('contraseña corta: no sirve', (await pub.post('/api/auth/reset', { token: tok[1], password: '123' })).status === 400);
    const ok1 = await pub.post('/api/auth/reset', { token: tok[1], password: 'nueva12345' });
    check('con el código se crea la contraseña nueva', ok1.status === 200 && ok1.data.role === 'candidate');
    check('el código sirve una sola vez', (await pub.post('/api/auth/reset', { token: tok[1], password: 'otra12345' })).status === 400);
    check('entra con la nueva', (await client().post('/api/auth/login', { role: 'candidate', email: 'ana@test.workuco', password: 'nueva12345' })).status === 200);
    check('la vieja ya no sirve', (await client().post('/api/auth/login', { role: 'candidate', email: 'ana@test.workuco', password: 'vieja12345' })).status === 401);
    check('se cerraron las sesiones de otros equipos', (await otroEquipo.get('/api/candidate/profile')).status === 401);
    await wait(150);
    check('le avisamos que la contraseña cambió', mailsTo('ana@test.workuco').some((x) => /Tu contraseña cambió/.test(x.subject)));

    console.log('— Límites —');
    for (let i = 0; i < 4; i++) await pub.post('/api/auth/forgot', { role: 'candidate', email: 'ana@test.workuco' });
    await wait(150);
    const pedidos = mailsTo('ana@test.workuco').filter((x) => /Creá una contraseña nueva/.test(x.subject)).length;
    check('máximo 3 links por hora por cuenta', pedidos === 3, `(${pedidos})`);
    check('una ficha importada sin reclamar no puede pedir link', (await pub.post('/api/auth/forgot', { role: 'company', email: 'x@import.workuco' })).status === 200);
    const lim = client();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await lim.post('/api/auth/forgot', { role: 'candidate', email: `x${i}@test.workuco` })).status;
    check('más de 10 pedidos por hora desde la misma conexión: se frena', last === 429);

    console.log('— Cambiar contraseña desde el perfil —');
    const ana2 = client();
    await ana2.post('/api/auth/login', { role: 'candidate', email: 'ana@test.workuco', password: 'nueva12345' });
    const otro2 = client();
    await otro2.post('/api/auth/login', { role: 'candidate', email: 'ana@test.workuco', password: 'nueva12345' });
    check('con la actual equivocada no cambia', (await ana2.post('/api/account/password', { current: 'mal', next: 'otra12345' })).status === 401);
    check('con la actual correcta cambia', (await ana2.post('/api/account/password', { current: 'nueva12345', next: 'tercera12345' })).status === 200);
    check('este equipo sigue adentro', (await ana2.get('/api/candidate/profile')).status === 200);
    check('el otro equipo quedó afuera', (await otro2.get('/api/candidate/profile')).status === 401);

    console.log('— Avisos por mail —');
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Bodega Mail', email: 'bodega@test.workuco', phone: '2622 403403', password: 'clave12345', acceptTerms: true });
    const j = await emp.post('/api/company/jobs', { title: 'Operario de bodega', description: 'Fraccionamiento y limpieza de tanques en la bodega, turno mañana, con ganas de aprender.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'bodega@test.workuco' });
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    await admin.patch(`/api/admin/jobs/${j.data.job.id}`, { status: 'approved' });
    await wait(150);
    check('a la empresa le llega "aviso publicado"', mailsTo('bodega@test.workuco').some((x) => /publicado/i.test(x.subject)));
    await ana2.post(`/api/jobs/${j.data.job.id}/apply`, { message: 'Hola' });
    await wait(150);
    const nuevo = mailsTo('bodega@test.workuco').find((x) => /Nueva postulación/.test(x.subject));
    check('a la empresa le llega "nueva postulación" con link al panel', !!nuevo && /https:\/\/workuco\.com\.ar\/panel#postulantes/.test(nuevo.text));
    check('el mail no lleva el nombre de quien se postuló', !!nuevo && !/Ana Mail/.test(nuevo.subject + nuevo.text + nuevo.html));
    check('el mail dice cómo apagar los avisos', !!nuevo && /apagar estos avisos/.test(nuevo.text));
    check('el perfil dice que los avisos están prendidos', (await emp.get('/api/me')).data.user.company.mailNotices === true);
    await emp.patch('/api/account/prefs', { mailNotices: false });
    check('se pueden apagar', (await emp.get('/api/me')).data.user.company.mailNotices === false);
    const antes = mailsTo('bodega@test.workuco').length;
    const pepe = client();
    await pepe.post('/api/auth/register', { role: 'candidate', name: 'Pepe Mail', email: 'pepe@test.workuco', phone: '2622 404404', password: 'clave12345', acceptTerms: true });
    await pepe.post(`/api/jobs/${j.data.job.id}/apply`, { message: 'Hola' });
    await wait(150);
    check('apagados, no llegan más', mailsTo('bodega@test.workuco').length === antes);
    check('pero la campanita sigue funcionando', JSON.stringify((await emp.get('/api/notifications')).data).includes('Pepe Mail'));
    check('a las cuentas de ejemplo (@demo.workuco) no se les escribe', outbox().every((x) => !/@demo\.workuco$/.test(x.to)));
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
