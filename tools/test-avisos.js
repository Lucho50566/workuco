/**
 * Pruebas de punta a punta de los avisos a personas: campanita + mail.
 * Alertas de empleo, invitaciones, cambios de etapa, marcar leído y apagar mails por tipo.
 * Usa WORKUCO_MAIL_FAKE=1: nada sale a internet, cada mail queda en <data>/outbox.jsonl.
 *
 *   node tools/test-avisos.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4631;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-avisos-${Date.now()}`);
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
const bell = async (c) => (await c.get('/api/notifications')).data;

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  let log = '';
  child.stderr.on('data', (d) => { log += d; });
  try {
    await waitServer();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });

    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Finca Avisos', email: 'finca@test.workuco', phone: '2622 405405', password: 'clave12345', acceptTerms: true });
    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Avisos', email: 'ana@test.workuco', phone: '2622 406406', password: 'clave12345', acceptTerms: true });
    const leo = client();
    await leo.post('/api/auth/register', { role: 'candidate', name: 'Leo Avisos', email: 'leo@test.workuco', phone: '2622 407407', password: 'clave12345', acceptTerms: true });

    console.log('— Alerta de empleo —');
    const al = await ana.post('/api/candidate/alerts', { q: 'tractorista' });
    check('se crea la alerta', al.status === 201 || al.status === 200, String(al.status));
    const job = (await emp.post('/api/company/jobs', { title: 'Tractorista para finca', description: 'Manejo de tractor y tareas generales de la finca, con experiencia, turno mañana.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'finca@test.workuco' })).data.job;
    await admin.patch(`/api/admin/jobs/${job.id}`, { status: 'approved' });
    await wait(150);
    const nAna = await bell(ana);
    check('a Ana le llega a la campanita', nAna.items.some((n) => /Nueva oferta para tu alerta/.test(n.title)) && nAna.unread >= 1);
    const mAlerta = mailsTo('ana@test.workuco').find((m) => /Nueva oferta para tu alerta/.test(m.subject));
    check('y por mail, con link a la oferta en el dominio público', !!mAlerta && mAlerta.text.includes(`https://workuco.com.ar/oferta/${job.id}`));
    check('a Leo (sin alerta) no le llega', !mailsTo('leo@test.workuco').some((m) => /alerta/.test(m.subject)));
    await admin.patch(`/api/admin/jobs/${job.id}`, { status: 'pending' });
    await admin.patch(`/api/admin/jobs/${job.id}`, { status: 'approved' });
    await wait(150);
    check('al reaprobar no se repite la alerta', mailsTo('ana@test.workuco').filter((m) => /Nueva oferta para tu alerta/.test(m.subject)).length === 1);

    console.log('— Invitación —');
    await leo.patch('/api/candidate/profile', { openToWork: true });
    const inv = await emp.post('/api/company/invitations', { jobId: job.id, candidateId: (await leo.get('/api/me')).data.user.candidate.id, message: 'Te esperamos' });
    check('la empresa puede invitar', inv.status === 201, `${inv.status} ${inv.text}`);
    await wait(150);
    check('a Leo le llega la invitación a la campanita', (await bell(leo)).items.some((n) => /te invitó a postularte/.test(n.title)));
    check('y por mail', mailsTo('leo@test.workuco').some((m) => /te invitó a postularte/.test(m.subject)));

    console.log('— Etapas de la postulación —');
    await ana.post(`/api/jobs/${job.id}/apply`, { message: 'Hola, tengo experiencia' });
    await wait(150);
    check('a la empresa le llega la postulación', (await bell(emp)).items.length >= 1 && mailsTo('finca@test.workuco').some((m) => /Nueva postulación/.test(m.subject)));
    const app = (await emp.get('/api/company/applications')).data.applications.find((a) => a.jobId === job.id);
    const titulos = { revisado: 'Tu postulación está en revisión', entrevista: '¡Te quieren entrevistar!', ofrecido: '¡Recibiste una oferta!', contratado: '¡Felicitaciones, quedaste!' };
    for (const [stage, title] of Object.entries(titulos)) {
      await emp.patch(`/api/company/applications/${app.id}`, { stage });
      await wait(120);
      check(`etapa "${stage}": campanita y mail`, (await bell(ana)).items.some((n) => n.title === title) && mailsTo('ana@test.workuco').some((m) => m.subject === title));
    }
    const antes = mailsTo('ana@test.workuco').length;
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'contratado' });
    await wait(120);
    check('si la etapa no cambia, no se repite el aviso', mailsTo('ana@test.workuco').length === antes);

    console.log('— Leído y preferencias —');
    const items = (await bell(ana)).items;
    const r = await ana.post('/api/notifications/read', { id: items[0].id });
    check('marcar uno como leído baja el contador', r.status === 200 && r.data.unread === items.filter((n) => !n.read).length - (items[0].read ? 0 : 1), JSON.stringify(r.data));
    await ana.patch('/api/account/prefs', { mail: { postulaciones: false } });
    const antes2 = mailsTo('ana@test.workuco').length;
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'descartado' });
    await wait(120);
    check('con "postulaciones" apagado no llega el mail', mailsTo('ana@test.workuco').length === antes2);
    check('pero sí a la campanita', (await bell(ana)).items.some((n) => n.title === 'Novedades de tu postulación'));
    check('ningún mail sale con link a localhost', outbox().every((m) => !/localhost|127\.0\.0\.1/.test(m.text + m.html)));
    check('el servidor no tiró errores de avisos', !/Notificación:|Aviso por mail:/.test(log), log.slice(0, 300));
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
