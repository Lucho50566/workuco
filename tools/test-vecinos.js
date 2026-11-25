/**
 * Changas de vecinos: publicar un pedido, revisión del admin, "Me interesa", privacidad de teléfonos,
 * elegir, resolver, vencimiento y baja de la cuenta.
 *   node tools/test-vecinos.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../lib/vecinos');

const ROOT = path.join(__dirname, '..');
const PORT = 4752;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASTO = { title: 'Cortar el pasto del fondo', description: 'Patio de 10 x 15, tengo la máquina.', category: 'jardin', locality: 'Tunuyán', area: 'Barrio Centro', whenNote: 'Este sábado', pay: '15000', payUnit: 'trabajo' };

function testLib() {
  console.log('— Reglas —');
  const okv = V.validateRequest(PASTO);
  check('un pedido completo es válido', okv.value && okv.value.pay === 15000 && okv.value.category === 'jardin', JSON.stringify(okv));
  check('sin monto: a convenir', V.validateRequest({ ...PASTO, pay: '' }).value.pay === 0 && V.payLabel({ pay: 0 }) === 'A convenir');
  check('monto con puntos y signo', V.validateRequest({ ...PASTO, pay: '$ 20.000' }).value.pay === 20000);
  const bad = V.validateRequest({ title: 'pasto', category: 'x', locality: 'Mendoza' });
  check('título corto, rubro y localidad inválidos', bad.errors && bad.errors.title && bad.errors.category && bad.errors.locality);
  check('teléfono en el texto: no', V.validateRequest({ ...PASTO, description: 'llamame al 2622 15 456789' }).errors.description);
  check('mail en el texto: no', V.validateRequest({ ...PASTO, description: 'escribime a juan@mail.com' }).errors.description);
  check('link en el texto: no', V.validateRequest({ ...PASTO, title: 'Pasto, ver www.algo.com' }).errors.title);
  check('medidas no son teléfono', !V.hasContactData('Patio de 10x15, unas 3 horas'));
  check('fecha pasada: no', V.validateRequest({ ...PASTO, whenDate: '2020-01-01' }).errors.whenDate);
  check('pago por hora', V.payLabel({ pay: 5000, payUnit: 'hora' }) === '$ 5.000 por hora');
  check('fecha que no existe: no', V.validateRequest({ ...PASTO, whenDate: '2026-02-30' }).errors.whenDate && V.validateRequest({ ...PASTO, whenDate: '2026-99-99' }).errors.whenDate);
}

function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const h = { Origin: BASE };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    let data = {}; let text = '';
    try { text = await res.text(); data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data, text };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), del: (p) => req(p, { method: 'DELETE' }) };
}
const person = async (c, name, email, phone) => c.post('/api/auth/register', { role: 'candidate', name, email, phone, password: 'clave12345', acceptTerms: true, locality: 'Tunuyán' });

async function testApi() {
  console.log('— API —');
  const DATA = path.join(os.tmpdir(), `workuco-vecinos-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: 'https://workuco.com.ar',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass, WORKUCO_VECINOS_DAYS: '14' },
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const pub = client(); const ana = client(); const beto = client(); const caro = client(); const admin = client();
    await person(ana, 'Ana Gómez', 'ana@prueba.test', '2622 401111');
    await person(beto, 'Beto Ruiz', 'beto@prueba.test', '2622 15 402222');
    await person(caro, 'Caro Díaz', 'caro@prueba.test', '2622403333');
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });

    check('sin cuenta no se puede publicar', (await pub.post('/api/vecinos', PASTO)).status === 401);
    const badPost = await ana.post('/api/vecinos', { ...PASTO, description: 'mi cel 2622401111' });
    check('con teléfono en el texto: 400 con el campo marcado', badPost.status === 400 && badPost.data.fields && badPost.data.fields.description, JSON.stringify(badPost.data));
    const made = await ana.post('/api/vecinos', PASTO);
    check('publicar: queda para revisar', made.status === 201 && made.data.request.status === 'pending', JSON.stringify(made.data));
    const id = made.data.request.id;

    check('pendiente: no aparece en la lista', (await pub.get('/api/vecinos')).data.requests.length === 0);
    check('pendiente: nadie más lo ve', (await beto.get(`/api/vecinos/${id}`)).status === 404);
    check('pendiente: la dueña sí lo ve', (await ana.get(`/api/vecinos/${id}`)).data.isOwner === true);
    check('pendiente: no se puede ofrecer', (await beto.post(`/api/vecinos/${id}/interes`, {})).status === 409);
    const inbox = (await admin.get('/api/admin/inbox')).data;
    check('el admin lo ve en "Para revisar"', inbox.counts.requests === 1 && inbox.requests[0].id === id, JSON.stringify(inbox.counts));
    check('sólo el admin ve la lista de revisión', (await beto.get('/api/admin/vecinos')).status === 401 && (await admin.get('/api/admin/vecinos?status=pending')).data.requests.length === 1);

    const ap = await admin.post(`/api/admin/vecinos/${id}/aprobar`);
    check('aprobar: queda publicado con vencimiento', ap.status === 200 && ap.data.request.status === 'approved' && ap.data.request.expiresAt > Date.now() + 13 * 86400000);
    const list = await pub.get('/api/vecinos');
    check('aparece en la lista pública', list.data.requests.length === 1 && list.data.requests[0].payLabel === '$ 15.000 por el trabajo');
    check('la lista no tiene datos de contacto ni apellido', !/2622|ana@|Gómez/.test(list.text) && list.data.requests[0].ownerFirstName === 'Ana', list.text.slice(0, 300));
    check('filtro por localidad', (await pub.get('/api/vecinos?locality=Tupungato')).data.requests.length === 0 && (await pub.get('/api/vecinos?locality=Tunuyán')).data.requests.length === 1);
    check('filtro por rubro', (await pub.get('/api/vecinos?category=pintura')).data.requests.length === 0);
    const detailPub = await pub.get(`/api/vecinos/${id}`);
    check('el detalle público no muestra interesados ni contacto', detailPub.status === 200 && !detailPub.data.interested && !/2622|ana@/.test(detailPub.text));
    check('la dueña recibió aviso de publicado', (await ana.get('/api/notifications')).text.includes('ya está publicado'));

    check('no se puede ofrecer en el pedido propio', (await ana.post(`/api/vecinos/${id}/interes`, {})).status === 400);
    check('sin cuenta no se puede ofrecer', (await pub.post(`/api/vecinos/${id}/interes`, {})).status === 401);
    check('mensaje con teléfono: no', (await beto.post(`/api/vecinos/${id}/interes`, { message: 'llamame 2622402222' })).status === 400);
    const i1 = await beto.post(`/api/vecinos/${id}/interes`, { message: 'Tengo bordeadora, puedo el sábado a la mañana.' });
    check('Beto se ofrece', i1.status === 201 && i1.data.myInterest && i1.data.myInterest.chosen === false);
    check('ofrecerse dos veces no duplica', (await beto.post(`/api/vecinos/${id}/interes`, {})).status === 200);
    await caro.post(`/api/vecinos/${id}/interes`, { message: 'Puedo el domingo.' });
    check('la dueña recibe el aviso (sin el nombre de quien se ofrece)', (await ana.get('/api/notifications')).text.includes('Alguien quiere hacer tu pedido') && !(await ana.get('/api/notifications')).text.includes('Beto'));

    const own = await ana.get(`/api/vecinos/${id}`);
    const b = (own.data.interested || []).find((x) => x.name === 'Beto Ruiz');
    check('la dueña ve a los interesados con su WhatsApp', own.data.interested.length === 2 && b && /^https:\/\/wa\.me\/5492622402222\?text=/.test(b.waUrl), JSON.stringify(own.data.interested));
    check('el mensaje de WhatsApp nombra el pedido', b && decodeURIComponent(b.waUrl).includes('Cortar el pasto del fondo'));
    const other = await caro.get(`/api/vecinos/${id}`);
    check('otra interesada no ve a los demás ni sus teléfonos', !other.data.interested && !/2622402222|Beto/.test(other.text) && other.data.myInterest);
    check('el contador muestra 2 interesados', (await pub.get('/api/vecinos')).data.requests[0].interestCount === 2);

    check('sólo la dueña elige', (await caro.post(`/api/vecinos/${id}/elegir`, { candidateId: 'x' })).status === 403);
    const bId = b.candidateId;
    check('elegir a alguien que no se ofreció: 404', (await ana.post(`/api/vecinos/${id}/elegir`, { candidateId: 'cdesconocido1' })).status === 404);
    check('la dueña elige a Beto', (await ana.post(`/api/vecinos/${id}/elegir`, { candidateId: bId })).status === 200);
    check('Beto recibe "te eligieron"', (await beto.get('/api/notifications')).text.includes('Te eligieron'));
    await ana.post(`/api/vecinos/${id}/elegir`, { candidateId: bId });
    check('elegirlo dos veces no repite el aviso', (await beto.get('/api/notifications')).data.items.filter((n) => /Te eligieron/.test(n.title)).length === 1);
    check('Beto ve que lo eligieron', (await beto.get(`/api/vecinos/${id}`)).data.myInterest.chosen === true);
    check('elegido: no se puede bajar solo', (await beto.del(`/api/vecinos/${id}/interes`)).status === 409);
    check('Caro se puede bajar', (await caro.del(`/api/vecinos/${id}/interes`)).status === 200);
    const mios = await beto.get('/api/vecinos/mios');
    check('"mis pedidos" de Beto muestra su ofrecimiento', mios.data.interests.length === 1 && mios.data.interests[0].chosen === true);

    check('sólo la dueña lo cierra', (await beto.post(`/api/vecinos/${id}/resuelto`)).status === 403);
    const res1 = await ana.post(`/api/vecinos/${id}/resuelto`);
    check('resuelto: sale de la lista', res1.data.request.status === 'resolved' && (await pub.get('/api/vecinos')).data.requests.length === 0);
    check('resuelto: ya no recibe interesados', (await caro.post(`/api/vecinos/${id}/interes`, {})).status === 409);
    check('el admin no puede volver a publicar uno resuelto', (await admin.post(`/api/admin/vecinos/${id}/aprobar`)).status === 409);
    check('el admin no puede rechazar uno resuelto', (await admin.post(`/api/admin/vecinos/${id}/rechazar`, { reason: 'x' })).status === 409);

    /* tope de pedidos abiertos */
    for (let k = 0; k < 3; k++) await caro.post('/api/vecinos', { ...PASTO, title: `Ordenar el patio número ${k + 1}` });
    check('máximo 3 pedidos abiertos por persona', (await caro.post('/api/vecinos', { ...PASTO, title: 'Uno más para el patio' })).status === 429);

    /* rechazo */
    const r2 = (await caro.get('/api/vecinos/mios')).data.requests[0];
    const rej = await admin.post(`/api/admin/vecinos/${r2.id}/rechazar`, { reason: 'Falta información' });
    check('rechazar: avisa el motivo', rej.data.request.status === 'rejected' && (await caro.get('/api/notifications')).text.includes('Falta información'));

    /* baja de la cuenta: se van sus pedidos y sus ofrecimientos */
    const r3 = (await caro.get('/api/vecinos/mios')).data.requests[1];
    await admin.post(`/api/admin/vecinos/${r3.id}/aprobar`);
    await beto.post(`/api/vecinos/${r3.id}/interes`, { message: 'Puedo' });
    const baja = await caro.post('/api/account/delete', { confirm: true, password: 'clave12345' });
    check('baja de la cuenta', baja.status === 200, JSON.stringify(baja.data));
    check('sus pedidos ya no existen', (await pub.get(`/api/vecinos/${r3.id}`)).status === 404 && (await pub.get('/api/vecinos')).data.requests.length === 0);
    check('Beto ya no tiene ese ofrecimiento', (await beto.get('/api/vecinos/mios')).data.interests.length === 1);
    check('las páginas existen', (await fetch(`${BASE}/vecinos`)).status === 200 && (await fetch(`${BASE}/vecinos/${id}`)).status === 200);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }
}

async function testExpiry() {
  console.log('— Vencimiento —');
  const DATA = path.join(os.tmpdir(), `workuco-vecinos-exp-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT + 1), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_MAIL_FAKE: '1',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass, WORKUCO_VECINOS_DAYS: '0.00002' },
  });
  const base = `http://127.0.0.1:${PORT + 1}`;
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    let cookieA = ''; let cookieAdm = '';
    const call = async (p, body, cookie, method = body ? 'POST' : 'GET') => {
      const r = await fetch(base + p, { method, headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
      const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith('wk_sess='));
      return { r, data: await r.json().catch(() => ({})), set };
    };
    cookieA = (await call('/api/auth/register', { role: 'candidate', name: 'Dora Paz', email: 'dora@prueba.test', phone: '2622404444', password: 'clave12345', acceptTerms: true }, '')).set;
    cookieAdm = (await call('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass }, '')).set;
    const id = (await call('/api/vecinos', PASTO, cookieA)).data.request.id;
    await call(`/api/admin/vecinos/${id}/aprobar`, {}, cookieAdm);
    await sleep(2200);
    check('vencido: sale de la lista', (await call('/api/vecinos', null, '')).data.requests.length === 0);
    check('vencido: la dueña lo ve como vencido', (await call(`/api/vecinos/${id}`, null, cookieA)).data.request.status === 'expired');
    check('vencido: no cuenta para el tope', (await call('/api/vecinos', { ...PASTO, title: 'Pintar la reja del frente' }, cookieA)).r.status === 201);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }
}

(async () => {
  try { testLib(); } catch (e) { fail++; console.error('ERROR lib:', e); }
  await testApi();
  await testExpiry();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
