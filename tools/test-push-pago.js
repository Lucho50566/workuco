/**
 * "Avisar al celular" pagado con Mercado Pago (fuera del lanzamiento): se cobra el precio del admin,
 * sale al aprobarse el pago, una sola vez, y si ya no hay a quién mandarlo se avisa para devolver el pago.
 * Mercado Pago simulado en un puerto local; avisos al celular en <data>/push-outbox.jsonl.
 *
 *   node tools/test-push-pago.js
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = 4647;
const MP_PORT = 4648;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-push-pago-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const SECRET = 'secreto-de-prueba';

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {} };
  }
  return {
    get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    put: (p, b) => req(p, { method: 'PUT', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }),
    hook: (p, b, dataId) => {
      const ts = String(Date.now());
      const rid = `req-${Math.random().toString(36).slice(2)}`;
      const v1 = crypto.createHmac('sha256', SECRET).update(`id:${dataId};request-id:${rid};ts:${ts};`).digest('hex');
      return req(p, { method: 'POST', body: b, headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid } });
    },
  };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pushes = () => { const f = path.join(DATA, 'push-outbox.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
function fakeSub(name) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${crypto.randomBytes(6).toString('hex')}`,
    keys: { p256dh: e.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}

const mp = { prefs: [], payments: new Map() };
const mpServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/checkout/preferences') {
      const id = `pref-${mp.prefs.length + 1}`;
      mp.prefs.push({ id, body: JSON.parse(raw || '{}') });
      return json(201, { id, init_point: `https://mp.test/checkout?pref=${id}` });
    }
    if (req.method === 'GET' && req.url === '/users/me') return json(200, { id: 123456789, nickname: 'WORKUCO.TEST', email: 'cuenta@prueba.test', first_name: 'Dueño', last_name: 'Prueba', site_id: 'MLA' });
    const m = req.url.match(/^\/v1\/payments\/(\w+)$/);
    if (req.method === 'GET' && m) { const p = mp.payments.get(m[1]); return p ? json(200, p) : json(404, {}); }
    json(404, {});
  });
});

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  await new Promise((r) => mpServer.listen(MP_PORT, '127.0.0.1', r));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', WORKUCO_PUSH_FAKE: '1', WORKUCO_LAUNCH_FREE: '0',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass,
      WORKUCO_MP_TOKEN: 'APP_USR-prueba', WORKUCO_MP_API: `http://127.0.0.1:${MP_PORT}`, WORKUCO_MP_WEBHOOK_SECRET: SECRET },
  });
  let log = '';
  child.stderr.on('data', (d) => { log += d; });
  try {
    await waitServer();
    const pub = client();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const adminSub = fakeSub('admin');
    await admin.post('/api/push/subscribe', { subscription: adminSub });
    const emp = client();
    await emp.post('/api/auth/login', { role: 'company', email: 'bodega@demo.workuco', password: 'demo12345' });
    const jobs = (await emp.get('/api/company/jobs')).data.jobs.filter((j) => j.status === 'approved');
    const [job, job2] = jobs;
    check('la empresa tiene dos avisos publicados (precondición)', !!job && !!job2);

    console.log('— Sin cobro activado no se ofrece —');
    check('fuera del lanzamiento y sin cobro, no se ofrece', (await emp.get(`/api/company/jobs/${job.id}/push`)).data.offered === false);
    await admin.put('/api/admin/payments/settings', { charge: true, prices: { 7: 3000 } });

    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Pago', email: 'ana@test.workuco', phone: '2622 406406', password: 'clave12345', acceptTerms: true });
    const anaSub = fakeSub('ana');
    await ana.post('/api/push/subscribe', { subscription: anaSub });
    await ana.patch('/api/account/prefs', { localities: [job.locality, job2.locality], pushJobs: true });

    console.log('— Pagar y mandar —');
    const st = (await emp.get(`/api/company/jobs/${job.id}/push`)).data;
    check('se ofrece pago, con el precio por defecto ($ 3.500) y el alcance real', st.offered && !st.free && st.price === 3500 && st.reach === 1, JSON.stringify(st));
    const co = await emp.post(`/api/company/jobs/${job.id}/push`);
    check('abre Mercado Pago por $ 3.500', co.status === 200 && /mp\.test/.test(co.data.url) && mp.prefs[0].body.items[0].unit_price === 3500, JSON.stringify(co.data));
    check('antes de pagar no sale nada', !pushes().some((m) => m.endpoint === anaSub.endpoint && /Empleo nuevo/.test(m.message.title)));
    mp.payments.set('901', { id: 901, status: 'approved', external_reference: co.data.reference, currency_id: 'ARS', transaction_amount: 3500 });
    await pub.hook('/api/mp/webhook?type=payment&data.id=901', { type: 'payment', data: { id: '901' } }, '901');
    await sleep(400);
    check('con el pago aprobado, le llega a la persona', pushes().some((m) => m.endpoint === anaSub.endpoint && /Empleo nuevo/.test(m.message.title)));
    await pub.hook('/api/mp/webhook?type=payment&data.id=901', { type: 'payment', data: { id: '901' } }, '901');
    await sleep(300);
    check('el mismo pago avisado dos veces no lo manda dos veces', pushes().filter((m) => m.endpoint === anaSub.endpoint && /Empleo nuevo/.test(m.message.title)).length === 1);
    check('después ya no se puede volver a mandar ese aviso', (await emp.post(`/api/company/jobs/${job.id}/push`)).status === 400);

    console.log('— Pagó, pero no queda nadie —');
    /* Ana ya recibió uno hoy: a una compra nueva no se le ofrece (alcance 0) */
    const co2 = await emp.post(`/api/company/jobs/${job2.id}/push`);
    check('con el tope de hoy cumplido no se ofrece de entrada', co2.status === 400);
    /* se simula un pago abierto antes y la persona que se da de baja de los avisos mientras tanto */
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    const ref = `wk${crypto.randomBytes(9).toString('hex')}`;
    db.prepare("INSERT INTO payments(id, company_id, job_id, job_title, days, amount, status, created_at, kind) VALUES(?,?,?,?,0,3500,'created',?,'push')").run(ref, job2.companyId, job2.id, job2.title, Date.now());
    db.close();
    await ana.patch('/api/account/prefs', { pushJobs: false });
    mp.payments.set('902', { id: 902, status: 'approved', external_reference: ref, currency_id: 'ARS', transaction_amount: 3500 });
    await pub.hook('/api/mp/webhook?type=payment&data.id=902', { type: 'payment', data: { id: '902' } }, '902');
    await sleep(400);
    check('sin nadie a quien mandarlo, al admin le llega "devolver el pago"', pushes().some((m) => m.endpoint === adminSub.endpoint && /Devolver un pago/.test(m.message.title)));
    check('y el aviso no queda gastado', (await emp.get(`/api/company/jobs/${job2.id}/push`)).data.sentAt === null);

    console.log('— Cuenta conectada y pago de prueba —');
    const acc = (await admin.get('/api/admin/payments/account')).data;
    check('el admin ve a qué cuenta de Mercado Pago entra la plata', acc.connected && acc.account && acc.account.nickname === 'WORKUCO.TEST' && acc.account.email === 'cuenta@prueba.test' && acc.account.id === 123456789, JSON.stringify(acc));
    check('la clave nunca aparece', !JSON.stringify(acc).includes('APP_USR'));
    check('una empresa no la ve', (await emp.get('/api/admin/payments/account')).status === 401);
    const totals0 = (await admin.get('/api/admin/payments')).data.totals;
    const t = await admin.post('/api/admin/payments/test');
    const lastPref = mp.prefs[mp.prefs.length - 1].body;
    check('el pago de prueba abre Mercado Pago por $ 100 y vuelve al admin', t.status === 200 && /mp\.test/.test(t.data.url) && lastPref.items[0].unit_price === 100 && /\/admin\?pago=ok/.test(lastPref.back_urls.success), JSON.stringify(t.data));
    check('una empresa no puede crear pagos de prueba', (await emp.post('/api/admin/payments/test')).status === 401);
    mp.payments.set('903', { id: 903, status: 'approved', external_reference: lastPref.external_reference, currency_id: 'ARS', transaction_amount: 100 });
    await pub.hook('/api/mp/webhook?type=payment&data.id=903', { type: 'payment', data: { id: '903' } }, '903');
    await sleep(400);
    check('al aprobarse, al celular del admin le llega "Llegó el pago de prueba"', pushes().some((m) => m.endpoint === adminSub.endpoint && /Llegó el pago de prueba/.test(m.message.title)));
    const acc2 = (await admin.get('/api/admin/payments/account')).data;
    check('queda registrado el último pago de prueba aprobado', acc2.lastTest && acc2.lastTest.status === 'approved' && acc2.lastTest.mpPaymentId === '903', JSON.stringify(acc2.lastTest));
    const totals1 = (await admin.get('/api/admin/payments')).data.totals;
    check('el pago de prueba no cuenta en lo cobrado', totals1.approved === totals0.approved && totals1.count === totals0.count, JSON.stringify([totals0, totals1]));
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill();
    mpServer.close();
    await sleep(300);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\npush pago: ${ok} ok · ${fail} fail`);
  if (fail) console.log(log.slice(-1500));
  process.exit(fail ? 1 : 0);
}
main();
