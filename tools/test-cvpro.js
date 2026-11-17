/**
 * Pruebas del CV Pro por API: análisis, versiones, vista previa recortada, cobro con Mercado Pago (simulado),
 * reescrituras, precios del admin y borrado de cuenta. IA simulada (WORKUCO_IMPORT_AI_FAKE=1).
 *   node tools/test-cvpro.js
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = 4646;
const MP_PORT = 4647;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-cvpro-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const SECRET = 'secreto-cv';

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
    return { status: res.status, data: data || {}, text };
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

/* PDF de texto mínimo, como los que exporta Word */
function pdfOf(lines) {
  const content = `BT /F1 11 Tf 72 760 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const z = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z,
    Buffer.from('\nendstream\nendobj\ntrailer << >>\n%%EOF')]).toString('base64');
}
const CV_LINES = ['Juan Perez', 'Finca Los Nogales - Podador 2021-2024', 'Bodega Altamira - Operario de cosecha 2019-2021',
  'Escuela Tecnica Agraria de Tunuyan', 'juan.perez@mail.com 2622 555111', 'Tareas de poda, riego por goteo y mantenimiento de alambrados.'];
const BLANK_PDF = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Length 4 >>\nstream\nq Q\n\nendstream\nendobj\ntrailer << >>\n%%EOF')]).toString('base64');

/* ---- Mercado Pago simulado ---- */
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
    const m = req.url.match(/^\/v1\/payments\/(\w+)$/);
    if (req.method === 'GET' && m) { const p = mp.payments.get(m[1]); return p ? json(200, p) : json(404, { message: 'not found' }); }
    json(404, {});
  });
});

function start(env) {
  return spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass,
      WORKUCO_MP_TOKEN: 'APP_USR-prueba', WORKUCO_MP_API: `http://127.0.0.1:${MP_PORT}`, WORKUCO_MP_WEBHOOK_SECRET: SECRET, ...env },
  });
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  await new Promise((r) => mpServer.listen(MP_PORT, '127.0.0.1', r));

  /* ---------- sin IA: el servicio no se ofrece ---------- */
  let child = start({ WORKUCO_IMPORT_AI_FAKE: '0', WORKUCO_IMPORT_AI_PROVIDER: '', WORKUCO_IMPORT_AI_KEY: '' });
  try {
    await waitServer();
    console.log('— Sin IA configurada —');
    check('/api/meta: CV Pro apagado', (await client().get('/api/meta')).data.cvPro.enabled === false);
    const p = client();
    await p.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    check('analizar: 503', (await p.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).status === 503);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }

  /* ---------- con IA simulada ---------- */
  child = start({ WORKUCO_IMPORT_AI_FAKE: '1' });
  try {
    await waitServer();
    const pub = client();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const ana = client();
    await ana.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    const otra = client();
    await otra.post('/api/auth/register', { role: 'candidate', name: 'Otra Persona', email: 'otra@test.workuco', phone: '2622 401401', password: 'clave12345', acceptTerms: true });
    const emp = client();
    await emp.post('/api/auth/login', { role: 'company', email: 'bodega@demo.workuco', password: 'demo12345' });

    console.log('— Meta y permisos —');
    let meta = (await pub.get('/api/meta')).data.cvPro;
    check('meta: activo, precio 5000 y sin cobro hasta que el admin lo activa', meta.enabled === true && meta.price === 5000 && meta.canPay === false, JSON.stringify(meta));
    check('sin sesión: 401', (await pub.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).status === 401);
    check('una empresa: 401', (await emp.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).status === 401);
    check('sin aceptar el uso de IA: 400', (await ana.post('/api/cvpro/analyze', { source: 'perfil' })).status === 400);
    check('más de 3 fotos: 400', (await ana.post('/api/cvpro/analyze', { source: 'fotos', photos: ['a', 'b', 'c', 'd'], consent: true })).status === 400);
    const blank = await ana.post('/api/cvpro/analyze', { source: 'pdf', pdf: { name: 'cv.pdf', data: BLANK_PDF }, consent: true });
    check('PDF sin texto: 400 pidiendo fotos', blank.status === 400 && /foto/i.test(blank.data.error || ''), JSON.stringify(blank.data));

    console.log('— Análisis —');
    const an = await ana.post('/api/cvpro/analyze', { source: 'pdf', pdf: { name: 'cv.pdf', data: pdfOf(CV_LINES) }, consent: true });
    const order = an.data.order || {};
    check('analiza el PDF: 201 con 15 controles y puntaje', an.status === 201 && order.analysis && order.analysis.checks.length === 15 && typeof order.analysis.score === 'number', JSON.stringify(an.data).slice(0, 300));
    check('la orden no expone el texto original', !('sourceText' in order) && !an.text.includes('riego por goteo'));
    check('estado "analizado" y precio guardado', order.status === 'analizado' && order.price === 5000);

    console.log('— Versiones y vista previa —');
    const g1 = await ana.post(`/api/cvpro/${order.id}/generate`, { inputs: { idiomas: 'Inglés básico' } });
    const cv1 = g1.data.order && g1.data.order.cv;
    check('genera un CV con diseño de la lista', g1.status === 200 && cv1 && ['clasico', 'moderno', 'campo', 'servicio', 'creativo', 'primer-empleo'].includes(cv1.design), JSON.stringify(g1.data).slice(0, 300));
    check('la vista previa viene recortada', cv1 && cv1.locked === true && g1.data.order.status === 'generado');
    check('no trae empresas inventadas', cv1 && cv1.experience.every((x) => /Nogales|Altamira/.test(x.company)));
    check('la segunda experiencia no trae sus tareas completas', cv1 && (cv1.experience[1] ? cv1.experience[1].bullets.length <= 2 : true));
    check('otra persona no ve la orden: 404', (await otra.get(`/api/cvpro/${order.id}`)).status === 404);
    check('ni la genera: 404', (await otra.post(`/api/cvpro/${order.id}/generate`, {})).status === 404);
    check('versión 2: ok', (await ana.post(`/api/cvpro/${order.id}/generate`, { request: 'más corto' })).status === 200);
    check('versión 3: ok', (await ana.post(`/api/cvpro/${order.id}/generate`, {})).status === 200);
    check('versión 4 antes de pagar: 400', (await ana.post(`/api/cvpro/${order.id}/generate`, {})).status === 400);
    const st = await ana.patch(`/api/cvpro/${order.id}/style`, { design: 'servicio', accent: 'malbec' });
    check('cambiar diseño y color', st.status === 200 && st.data.order.cv.design === 'servicio' && st.data.order.cv.accent === 'malbec');
    check('diseño inválido: 400', (await ana.patch(`/api/cvpro/${order.id}/style`, { design: 'hackeo' })).status === 400);
    check('reescribir antes de pagar: 400', (await ana.post(`/api/cvpro/${order.id}/rewrite`, { request: 'x' })).status === 400);
    check('lista "Mis CV"', (await ana.get('/api/cvpro')).data.orders.some((o) => o.id === order.id));
    check('pagar con el cobro apagado: 400', (await ana.post(`/api/cvpro/${order.id}/checkout`)).status === 400);

    console.log('— Admin: precio y cobro —');
    check('una persona no cambia el precio', (await ana.put('/api/admin/payments/settings', { sellCv: true, cvPrice: 1 })).status === 401);
    check('precio inválido: 400', (await admin.put('/api/admin/payments/settings', { sellCv: true, cvPrice: 50 })).status === 400);
    const s1 = await admin.put('/api/admin/payments/settings', { sellCv: true });
    check('activar la venta sin tocar otros ajustes', s1.status === 200 && s1.data.settings.sellCv === true && s1.data.settings.cvPrice === 5000, JSON.stringify(s1.data));
    meta = (await pub.get('/api/meta')).data.cvPro;
    check('meta: ahora se puede pagar', meta.canPay === true);

    console.log('— Pagar —');
    const co = await ana.post(`/api/cvpro/${order.id}/checkout`);
    const pref = mp.prefs[0] && mp.prefs[0].body;
    check('devuelve el link de Mercado Pago', co.status === 200 && /^https:\/\/mp\.test/.test(co.data.url || ''), JSON.stringify(co.data));
    check('cobra 5000 y vuelve al CV', pref && pref.items[0].unit_price === 5000 && pref.back_urls.success === `https://workuco.com.ar/cv-pro/${order.id}?pago=ok`, JSON.stringify(pref && pref.back_urls));
    const featBefore = (await emp.get('/api/company/jobs')).data.jobs.map((j) => `${j.id}:${j.featured}`).join();
    mp.payments.set('7001', { id: 7001, status: 'approved', external_reference: pref.external_reference, transaction_amount: 5000, currency_id: 'ARS' });
    await pub.hook('/api/mp/webhook?type=payment&data.id=7001', { type: 'payment', data: { id: '7001' } }, '7001');
    await sleep(300);
    const paid = (await ana.get(`/api/cvpro/${order.id}`)).data.order;
    check('pago aprobado: la orden queda pagada', paid.status === 'pagado' && paid.paidAt > 0, JSON.stringify(paid).slice(0, 200));
    check('y trae el CV completo', paid.cv && !paid.cv.locked);
    check('ningún aviso cambió', (await emp.get('/api/company/jobs')).data.jobs.map((j) => `${j.id}:${j.featured}`).join() === featBefore);
    await pub.hook('/api/mp/webhook?type=payment&data.id=7001', { type: 'payment', data: { id: '7001' } }, '7001');
    await sleep(200);
    check('el aviso repetido no duplica', (await admin.get('/api/admin/payments')).data.payments.filter((x) => x.kind === 'cv' && x.status === 'approved').length === 1);
    check('pagar de nuevo: 409', (await ana.post(`/api/cvpro/${order.id}/checkout`)).status === 409);
    const notis = (await ana.get('/api/notifications')).data.items || [];
    check('la persona recibe el aviso', notis.some((n) => /CV/.test(n.title)), JSON.stringify(notis.slice(0, 2)));
    const lista = (await admin.get('/api/admin/payments')).data;
    check('el admin ve el pago como CV Pro', lista.payments.some((x) => x.kind === 'cv' && x.amount === 5000 && x.status === 'approved'));

    console.log('— Después de pagar —');
    const rw = await ana.post(`/api/cvpro/${order.id}/rewrite`, { request: 'orientalo a gastronomía' });
    check('reescribir: 3 → 2', rw.status === 200 && rw.data.order.rewritesLeft === 2 && !rw.data.order.cv.locked, JSON.stringify(rw.data).slice(0, 200));
    await ana.post(`/api/cvpro/${order.id}/rewrite`, {});
    await ana.post(`/api/cvpro/${order.id}/rewrite`, {});
    check('sin reescrituras: 400', (await ana.post(`/api/cvpro/${order.id}/rewrite`, {})).status === 400);

    console.log('— Vuelta desde Mercado Pago —');
    await admin.put('/api/admin/payments/settings', { cvPrice: 6000 });
    const o2 = (await ana.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).data.order;
    check('orden nueva con el precio nuevo', o2 && o2.price === 6000);
    await ana.post(`/api/cvpro/${o2.id}/generate`, {});
    await ana.post(`/api/cvpro/${o2.id}/checkout`);
    const ref2 = mp.prefs[1].body.external_reference;
    check('cobra 6000', mp.prefs[1].body.items[0].unit_price === 6000);
    mp.payments.set('7002', { id: 7002, status: 'approved', external_reference: ref2, transaction_amount: 6000, currency_id: 'ARS' });
    check('otra persona no confirma ese pago: 404', (await otra.post('/api/cvpro/payments/confirm', { paymentId: '7002' })).status === 404);
    const cf = await ana.post('/api/cvpro/payments/confirm', { paymentId: '7002' });
    check('al volver se confirma', cf.status === 200 && cf.data.status === 'approved' && cf.data.orderId === o2.id, JSON.stringify(cf.data));
    check('una empresa no confirma pagos de CV con su ruta', (await emp.post('/api/company/payments/confirm', { paymentId: '7002' })).status === 404);

    console.log('— Límite diario —');
    check('el cuarto análisis del día: 429', (await ana.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).status === 200 ? false
      : (await ana.post('/api/cvpro/analyze', { source: 'perfil', consent: true })).status === 429);

    console.log('— Datos y borrado —');
    const exp = await ana.get('/api/account/export');
    check('"descargar mis datos" incluye sus CV sin el texto original', exp.text.includes(order.id) && !exp.text.includes('riego por goteo'));
    await otra.post('/api/cvpro/analyze', { source: 'perfil', consent: true });
    const oid = (await otra.get('/api/cvpro')).data.orders[0].id;
    const del = await otra.post('/api/account/delete', { password: 'clave12345', confirm: true });
    check('borrar la cuenta (precondición)', del.status === 200, JSON.stringify(del.data));
    check('sus CV desaparecen', !(await admin.get('/api/admin/payments')).text.includes(oid) && (await ana.get(`/api/cvpro/${oid}`)).status === 404);
  } catch (e) { fail++; console.error('ERROR en las pruebas:', e); } finally {
    child.kill(); mpServer.close(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
