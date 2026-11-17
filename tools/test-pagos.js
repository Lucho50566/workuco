/**
 * Pruebas del cobro de destacados con Mercado Pago, contra un Mercado Pago simulado (no toca el real).
 *   node tools/test-pagos.js
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4643;
const MP_PORT = 4644;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-pagos-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const DAY = 86400000;

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
  return {
    get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    put: (p, b) => req(p, { method: 'PUT', body: b }),
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

/* ---- Mercado Pago simulado ---- */
const mp = { prefs: [], payments: new Map(), auth: [] };
const mpServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    mp.auth.push(req.headers.authorization || '');
    const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/checkout/preferences') {
      const body = JSON.parse(raw || '{}');
      const id = `pref-${mp.prefs.length + 1}`;
      mp.prefs.push({ id, body });
      return json(201, { id, init_point: `https://mp.test/checkout?pref=${id}` });
    }
    const m = req.url.match(/^\/v1\/payments\/(\w+)$/);
    if (req.method === 'GET' && m) {
      const p = mp.payments.get(m[1]);
      return p ? json(200, p) : json(404, { message: 'not found' });
    }
    json(404, {});
  });
});

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  await new Promise((r) => mpServer.listen(MP_PORT, '127.0.0.1', r));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass,
      WORKUCO_MP_TOKEN: 'APP_USR-prueba', WORKUCO_MP_API: `http://127.0.0.1:${MP_PORT}` },
  });
  try {
    await waitServer();
    const pub = client();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client();
    await emp.post('/api/auth/login', { role: 'company', email: 'bodega@demo.workuco', password: 'demo12345' });
    const otra = client();
    await otra.post('/api/auth/login', { role: 'company', email: 'cafe@demo.workuco', password: 'demo12345' });
    const job = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.status === 'approved' && !j.featured);
    check('la empresa tiene un aviso publicado sin destacar (precondición)', !!job);

    console.log('— Configuración desde el admin —');
    let cfg = (await admin.get('/api/admin/payments')).data;
    check('el admin ve que Mercado Pago está conectado (sin mostrar la clave)', cfg.mp && cfg.mp.connected === true && !JSON.stringify(cfg).includes('APP_USR-prueba'), JSON.stringify(cfg).slice(0, 200));
    check('sin precios ni cobro activado, no se cobra', (await pub.get('/api/meta')).data.payments.enabled === false);
    check('una empresa no puede tocar los precios', (await emp.put('/api/admin/payments/settings', { charge: true, prices: { 7: 3000 } })).status === 401);
    check('precio inválido: 400', (await admin.put('/api/admin/payments/settings', { charge: true, prices: { 7: -5 } })).status === 400);
    const set = await admin.put('/api/admin/payments/settings', { charge: true, prices: { 7: 3000, 15: 5000, 30: 9000 } });
    check('el admin activa el cobro y pone precios', set.status === 200, JSON.stringify(set.data));
    const meta = (await pub.get('/api/meta')).data.payments;
    check('/api/meta ofrece las opciones con su precio', meta.enabled === true && meta.options.length === 3 && meta.options.find((o) => o.days === 15).price === 5000, JSON.stringify(meta));

    console.log('— Pagar un destacado —');
    check('sin sesión: 401', (await pub.post(`/api/company/jobs/${job.id}/checkout`, { days: 7 })).status === 401);
    check('aviso de otra empresa: 404', (await otra.post(`/api/company/jobs/${job.id}/checkout`, { days: 7 })).status === 404);
    check('días que no están a la venta: 400', (await emp.post(`/api/company/jobs/${job.id}/checkout`, { days: 9 })).status === 400);
    const co = await emp.post(`/api/company/jobs/${job.id}/checkout`, { days: 15 });
    check('se crea el pago y devuelve el link de Mercado Pago', co.status === 200 && co.data.url === 'https://mp.test/checkout?pref=pref-1', JSON.stringify(co.data));
    const pref = mp.prefs[0] && mp.prefs[0].body;
    check('la preferencia lleva precio, moneda y referencia', pref && pref.items[0].unit_price === 5000 && pref.items[0].currency_id === 'ARS' && pref.items[0].quantity === 1 && pref.external_reference, JSON.stringify(pref));
    check('avisa a WorkUco y vuelve al panel', pref && pref.notification_url === 'https://workuco.com.ar/api/mp/webhook' && /\/panel/.test(pref.back_urls.success));
    check('usa la clave del servidor', mp.auth.includes('Bearer APP_USR-prueba'));
    const ref = pref.external_reference;

    console.log('— Aviso de pago (webhook) —');
    mp.payments.set('111', { id: 111, status: 'pending', external_reference: ref, transaction_amount: 5000, currency_id: 'ARS' });
    let w = await pub.post('/api/mp/webhook?type=payment&data.id=111', { type: 'payment', data: { id: '111' } });
    await sleep(300);
    check('el webhook responde 200', w.status === 200);
    check('pago pendiente: todavía no se destaca', !(await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id).featured);
    mp.payments.set('222', { id: 222, status: 'approved', external_reference: ref, transaction_amount: 10, currency_id: 'ARS' });
    await pub.post('/api/mp/webhook?type=payment&data.id=222', { type: 'payment', data: { id: '222' } });
    await sleep(300);
    check('monto menor al precio: no se destaca', !(await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id).featured);
    mp.payments.set('333', { id: 333, status: 'approved', external_reference: 'otra-cosa', transaction_amount: 5000, currency_id: 'ARS' });
    await pub.post('/api/mp/webhook', { type: 'payment', data: { id: '333' } });
    await sleep(300);
    check('pago de otra referencia: se ignora', !(await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id).featured);
    mp.payments.set('444', { id: 444, status: 'approved', external_reference: ref, transaction_amount: 5000, currency_id: 'ARS' });
    w = await pub.post('/api/mp/webhook?type=payment&data.id=444', { type: 'payment', data: { id: '444' } });
    await sleep(300);
    const j1 = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id);
    check('pago aprobado: el aviso queda destacado 15 días', j1.featured && Math.abs(j1.featuredUntil - (Date.now() + 15 * DAY)) < 120000, JSON.stringify({ f: j1.featured, u: j1.featuredUntil }));
    await pub.post('/api/mp/webhook?topic=payment&id=444', {});
    await sleep(300);
    const j2 = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id);
    check('el mismo aviso repetido no suma días de nuevo', j2.featuredUntil === j1.featuredUntil);
    const notis = (await emp.get('/api/notifications')).data.items || [];
    check('la empresa recibe la confirmación', notis.some((n) => /destacad/i.test(n.title)), JSON.stringify(notis.slice(0, 2)));
    const lista = (await admin.get('/api/admin/payments')).data;
    const fila = lista.payments.find((x) => x.reference === ref);
    check('el admin ve el pago aprobado con empresa, aviso y monto', fila && fila.status === 'approved' && fila.amount === 5000 && fila.companyName && fila.jobTitle === job.title && fila.mpPaymentId === '444', JSON.stringify(fila));
    check('y el total cobrado', lista.totals && lista.totals.approved === 5000, JSON.stringify(lista.totals));

    console.log('— Vuelta desde Mercado Pago (sin esperar el webhook) —');
    const co2 = await emp.post(`/api/company/jobs/${job.id}/checkout`, { days: 7 });
    const ref2 = mp.prefs[1].body.external_reference;
    check('se puede comprar más días para un aviso ya destacado', co2.status === 200);
    mp.payments.set('555', { id: 555, status: 'approved', external_reference: ref2, transaction_amount: 3000, currency_id: 'ARS' });
    check('otra empresa no puede confirmar ese pago', (await otra.post('/api/company/payments/confirm', { paymentId: '555' })).status === 404);
    const conf = await emp.post('/api/company/payments/confirm', { paymentId: '555' });
    const j3 = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id);
    check('al volver se confirma y suma 7 días a los que quedaban', conf.status === 200 && conf.data.status === 'approved' && Math.abs(j3.featuredUntil - (j1.featuredUntil + 7 * DAY)) < 120000, JSON.stringify(conf.data));
    check('pago desconocido: 404', (await emp.post('/api/company/payments/confirm', { paymentId: '999' })).status === 404);

    console.log('— Apagar el cobro —');
    await admin.put('/api/admin/payments/settings', { charge: false, prices: { 7: 3000, 15: 5000, 30: 9000 } });
    check('con el cobro apagado no se puede pagar', (await emp.post(`/api/company/jobs/${job.id}/checkout`, { days: 7 })).status === 400);
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill();
    mpServer.close();
    await sleep(300);
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
