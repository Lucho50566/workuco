/**
 * Pruebas del Pack Cosecha: estado del pack en la base, API, cobro, admin y página /cosecha.
 *
 *   node tools/test-cosecha.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Store } = require('../lib/store');

const ROOT = path.join(__dirname, '..');
const DAY = 86400000;
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const near = (a, b, tol = 60000) => Math.abs(a - b) < tol;

function testBase() {
  console.log('— Base —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-cosecha-'));
  const s = new Store(path.join(dir, 'db.sqlite'));
  try {
    s.insertCompany({ id: 'cbod', name: 'Bodega Prueba', email: 'b@test.com', password: 'x' });
    const base = { companyId: 'cbod', locality: 'Tunuyán', type: 'Temporal', modality: 'Presencial', description: 'Tareas de temporada en finca.', status: 'approved' };
    const t0 = Date.now();
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const id = `jagr${i}`; ids.push(id);
      s.insertJob({ ...base, id, title: `Cosecha ${i}`, category: i === 6 ? 'Otros' : 'Agricultura', gig: i === 6, createdAt: t0 - (7 - i) * 1000, publishedAt: t0 - (7 - i) * 1000 });
    }
    s.insertJob({ ...base, id: 'jgas', title: 'Mozo', category: 'Gastronomía', createdAt: t0, publishedAt: t0 });
    /* uno ya destacado por más tiempo y otro sin vencimiento: no se tocan */
    s.setJobFeatured('jagr5', t0 + 60 * DAY);
    s.run('UPDATE jobs SET featured=1, featured_until=NULL WHERE id=?', 'jagr4');

    check('sin pack no está activo', s.cosechaActive('cbod') === false);
    const a = s.activateCosecha('cbod');
    check('activar dura 30 días', near(a.until, Date.now() + 30 * DAY), String(a.until - Date.now()));
    check('activo después de activar', s.cosechaActive('cbod') === true);
    const feat = ids.filter((id) => s.job(id).featured);
    check('quedan destacados como mucho 5 avisos de cosecha', s.cosechaFeaturedCount('cbod') === 5, String(s.cosechaFeaturedCount('cbod')));
    check('los más nuevos primero (el más viejo no entra)', !s.job('jagr0').featured && s.job('jagr6').featured, JSON.stringify(feat));
    check('la changa de otro rubro cuenta como de cosecha', s.job('jagr6').featured === true);
    check('un aviso de Gastronomía no se destaca', s.job('jgas').featured === false);
    check('un destacado más largo conserva su fecha', near(s.job('jagr5').featuredUntil, t0 + 60 * DAY));
    check('un destacado sin vencimiento sigue sin vencimiento', s.job('jagr4').featured === true && s.job('jagr4').featuredUntil == null);
    check('los demás vencen con el pack', near(s.job('jagr3').featuredUntil, a.until));
    check('los avisos de cosecha llevan el sello', s.job('jagr3').cosecha === true && s.job('jgas').cosecha === false);

    const b = s.activateCosecha('cbod');
    check('activar de nuevo suma 30 días al pack vigente', near(b.until, a.until + 30 * DAY));

    s.setCosechaRequest('cbod', true);
    check('se guarda el pedido', s.company('cbod').cosecha_req_at > 0);
    s.activateCosecha('cbod');
    check('activar atiende el pedido', s.company('cbod').cosecha_req_at == null);

    const r = s.searchJobs({ cosecha: '1', limit: 30 });
    check('la búsqueda de cosecha trae sólo Agricultura o changas', r.jobs.length === 7 && r.jobs.every((j) => j.category === 'Agricultura' || j.gig), JSON.stringify(r.jobs.map((j) => j.id)));

    const before = s.job('jagr3').featuredUntil;
    s.endCosecha('cbod');
    check('al quitar el pack deja de estar activo', s.cosechaActive('cbod') === false);
    check('y los avisos conservan su fecha de destacado', s.job('jagr3').featuredUntil === before);
    check('sin pack no hay sello', s.job('jagr3').cosecha === false);
    s.run('UPDATE companies SET cosecha_until=? WHERE id=?', Date.now() - 1000, 'cbod');
    check('un pack vencido no está activo', s.cosechaActive('cbod') === false);
  } finally {
    s.db.close && s.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------------- API (servidor de demo + Mercado Pago simulado) ---------------- */
const PORT = 4652;
const MP_PORT = 4653;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'secreto-cosecha';
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
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
    get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }),
    patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }),
    hook: (dataId) => {
      const ts = String(Date.now()); const rid = `req-${Math.random().toString(36).slice(2)}`;
      const v1 = require('crypto').createHmac('sha256', SECRET).update(`id:${dataId};request-id:${rid};ts:${ts};`).digest('hex');
      return req(`/api/mp/webhook?type=payment&data.id=${dataId}`, { method: 'POST', body: { type: 'payment', data: { id: dataId } }, headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid } });
    },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mp = { prefs: [], payments: new Map() };
const mpServer = require('http').createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/checkout/preferences') {
      const id = `pref-${mp.prefs.length + 1}`; mp.prefs.push({ id, body: JSON.parse(raw || '{}') });
      return json(201, { id, init_point: `https://mp.test/checkout?pref=${id}` });
    }
    const m = req.url.match(/^\/v1\/payments\/(\w+)$/);
    if (req.method === 'GET' && m) { const p = mp.payments.get(m[1]); return p ? json(200, p) : json(404, {}); }
    json(404, {});
  });
});

async function testApi() {
  const DATA = path.join(os.tmpdir(), `workuco-cosecha-${Date.now()}`);
  fs.rmSync(DATA, { recursive: true, force: true });
  await new Promise((r) => mpServer.listen(MP_PORT, '127.0.0.1', r));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass,
      WORKUCO_MP_TOKEN: 'APP_USR-prueba', WORKUCO_MP_API: `http://127.0.0.1:${MP_PORT}`, WORKUCO_MP_WEBHOOK_SECRET: SECRET },
  });
  const sql = (fn) => { const db = new DatabaseSync(path.join(DATA, 'workuco.sqlite')); try { return fn(db); } finally { db.close(); } };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const pub = client();
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client(); await emp.post('/api/auth/login', { email: 'bodega@demo.workuco', password: 'demo12345' });
    const otra = client(); await otra.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    const empId = (await emp.get('/api/me')).data.user.company.id;
    const otraId = (await otra.get('/api/me')).data.user.company.id;

    console.log('— API: estado y pedido —');
    check('sin sesión: 401', (await pub.get('/api/company/cosecha')).status === 401);
    let st = (await emp.get('/api/company/cosecha')).data;
    check('sin pack: inactivo y 20 invitaciones', st.active === false && st.inviteLimit === 20, JSON.stringify(st));
    check('con la venta apagada no se puede pagar', (await emp.post('/api/company/cosecha/checkout')).status === 400);
    check('pedirlo gratis (lanzamiento)', (await emp.post('/api/company/cosecha/request')).data.requested === true);
    let adm = (await admin.get('/api/admin/companies')).data.companies.find((c) => c.id === empId);
    check('el admin ve el pedido', adm && adm.cosechaRequestedAt > 0, JSON.stringify(adm || {}).slice(0, 200));
    check('la otra empresa no queda con pedido', !(await admin.get('/api/admin/companies')).data.companies.find((c) => c.id === otraId).cosechaRequestedAt);
    check('se puede cancelar el pedido', (await emp.del('/api/company/cosecha/request')).data.requested === false);
    await emp.post('/api/company/cosecha/request');

    console.log('— API: activar desde el admin —');
    check('una empresa no puede activarse sola', (await emp.patch(`/api/admin/companies/${empId}`, { cosechaDays: 30 })).status === 401);
    check('días inválidos: 400', (await admin.patch(`/api/admin/companies/${empId}`, { cosechaDays: 12 })).status === 400);
    const act = await admin.patch(`/api/admin/companies/${empId}`, { cosechaDays: 30 });
    check('el admin activa el pack', act.status === 200, JSON.stringify(act.data).slice(0, 200));
    st = (await emp.get('/api/company/cosecha')).data;
    check('activo, 100 invitaciones y sin pedido pendiente', st.active === true && st.inviteLimit === 100 && st.requested === false && Math.abs(st.until - (Date.now() + 30 * DAY)) < 60000, JSON.stringify(st));
    check('la base de talento cuenta sobre 100', (await emp.get('/api/company/talent')).data.invitesLeft > 20);
    const list = (await pub.get('/api/jobs?cosecha=1&limit=30')).data.jobs;
    check('/api/jobs?cosecha=1 trae sólo Agricultura o changas', list.length > 0 && list.every((j) => j.category === 'Agricultura' || j.gig), JSON.stringify(list.map((j) => [j.category, j.gig])));
    const mine = list.filter((j) => j.companyId === empId);
    check('los avisos de cosecha de la empresa salen destacados y con sello', mine.length > 0 && mine.every((j) => j.cosecha === true) && mine.some((j) => j.featured), JSON.stringify(mine.map((j) => [j.id, j.featured, j.cosecha])));
    check('los de otras empresas no llevan sello', list.filter((j) => j.companyId !== empId).every((j) => !j.cosecha));
    check('la otra empresa sigue sin pack', (await otra.get('/api/company/cosecha')).data.active === false);

    console.log('— API: avisos aprobados durante el pack —');
    const nuevos = [];
    for (let i = 0; i < 6; i++) {
      const r = await emp.post('/api/company/jobs', { title: `Cosechador temporada ${i}`, description: 'Cosecha de uva en finca de Tupungato, turno mañana de 7 a 13, pago por jornada y traslado.', locality: 'Tupungato', category: 'Agricultura', type: 'Temporal', modality: 'Presencial', contactEmail: 'bodega@demo.workuco' });
      if (!r.data.job) throw new Error(`no se pudo crear el aviso ${i}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      nuevos.push(r.data.job.id);
      await admin.patch(`/api/admin/jobs/${r.data.job.id}`, { status: 'approved' });
    }
    const cu = (await emp.get('/api/company/cosecha')).data.until;
    const jobsNow = (await emp.get('/api/company/jobs')).data.jobs;
    const featNew = nuevos.filter((id) => jobsNow.find((j) => j.id === id).featured);
    check('un aviso de cosecha aprobado durante el pack se destaca hasta el fin del pack', featNew.length >= 1 && jobsNow.find((j) => j.id === featNew[0]).featuredUntil === cu, JSON.stringify(featNew));
    check('nunca más de 5 avisos de cosecha destacados', (await emp.get('/api/company/cosecha')).data.featured <= 5);
    check('el sexto ya no se destaca', !jobsNow.find((j) => j.id === nuevos[5]).featured);

    console.log('— API: quitar y vencer —');
    const antes = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === featNew[0]).featuredUntil;
    await admin.patch(`/api/admin/companies/${empId}`, { cosechaDays: null });
    st = (await emp.get('/api/company/cosecha')).data;
    check('quitado: inactivo y vuelve a 20 invitaciones', st.active === false && st.inviteLimit === 20);
    check('los avisos conservan su fecha de destacado', (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === featNew[0]).featuredUntil === antes);
    await admin.patch(`/api/admin/companies/${empId}`, { cosechaDays: 30 });
    sql((db) => db.prepare('UPDATE companies SET cosecha_until=? WHERE id=?').run(Date.now() - 1000, empId));
    check('pack vencido: sin sello', (await pub.get('/api/jobs?cosecha=1&limit=30')).data.jobs.every((j) => !j.cosecha));
    check('pack vencido: inactivo', (await emp.get('/api/company/cosecha')).data.active === false);

    console.log('— Cobro —');
    check('precio inválido: 400', (await admin.put('/api/admin/payments/settings', { cosechaPrice: 50 })).status === 400);
    const set = await admin.put('/api/admin/payments/settings', { cosechaPrice: 90000, sellCosecha: true });
    check('el admin pone precio y activa la venta', set.status === 200 && set.data.settings.cosechaPrice === 90000 && set.data.settings.sellCosecha === true, JSON.stringify(set.data).slice(0, 300));
    st = (await otra.get('/api/company/cosecha')).data;
    check('la empresa ve el precio y que se puede pagar', st.price === 90000 && st.payEnabled === true, JSON.stringify(st));
    check('con la venta activa no se pide gratis', (await otra.post('/api/company/cosecha/request')).status === 400);
    check('/api/meta informa el pack', (await pub.get('/api/meta')).data.cosecha.price === 90000);
    check('sin sesión no se paga', (await pub.post('/api/company/cosecha/checkout')).status === 401);
    const co = await otra.post('/api/company/cosecha/checkout');
    check('abre Mercado Pago', co.status === 200 && /^https:\/\/mp\.test\/checkout/.test(co.data.url), JSON.stringify(co.data));
    const pref = mp.prefs[mp.prefs.length - 1].body;
    check('la preferencia lleva el precio del pack y vuelve al panel', pref.items[0].unit_price === 90000 && /\/panel/.test(pref.back_urls.success), JSON.stringify(pref).slice(0, 300));
    mp.payments.set('771', { id: 771, status: 'approved', external_reference: pref.external_reference, transaction_amount: 10, currency_id: 'ARS' });
    await otra.hook('771'); await sleep(300);
    check('monto menor: no se activa', (await otra.get('/api/company/cosecha')).data.active === false);
    mp.payments.set('772', { id: 772, status: 'approved', external_reference: pref.external_reference, transaction_amount: 90000, currency_id: 'ARS' });
    await otra.hook('772'); await sleep(300);
    const paid = (await otra.get('/api/company/cosecha')).data;
    check('pago aprobado: se activa por 30 días', paid.active === true && Math.abs(paid.until - (Date.now() + 30 * DAY)) < 60000, JSON.stringify(paid));
    await otra.hook('772'); await sleep(300);
    check('el mismo pago avisado dos veces no suma días', (await otra.get('/api/company/cosecha')).data.until === paid.until);
    check('pagar no le activa el pack a otra empresa', (await emp.get('/api/company/cosecha')).data.active === false);
  } finally {
    child.kill(); mpServer.close();
    await sleep(300);
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}

async function main() {
  try { testBase(); } catch (e) { fail++; console.error('ERROR en las pruebas:', e); }
  try { await testApi(); } catch (e) { fail++; console.error('ERROR en las pruebas:', e); }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
