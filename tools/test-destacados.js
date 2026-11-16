/**
 * Pruebas de avisos destacados (con vencimiento y pedido de la empresa) y de las estadísticas por aviso.
 *   node tools/test-destacados.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const PORT = 4635;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-destacados-${Date.now()}`);
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
    patch: (p, b) => req(p, { method: 'PATCH', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }), del: (p) => req(p, { method: 'DELETE' }),
  };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}

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
    const emp = client();
    await emp.post('/api/auth/login', { email: 'bodega@demo.workuco', password: 'demo12345' });
    const mine = (await emp.get('/api/company/jobs')).data.jobs.filter((j) => j.status === 'approved');
    check('la empresa demo tiene avisos publicados (precondición)', mine.length >= 1);
    const job = mine[mine.length - 1];

    console.log('— Lanzamiento —');
    check('/api/meta dice que destacar es gratis en el lanzamiento', (await pub.get('/api/meta')).data.launchFree === true);

    console.log('— Pedido de destacado —');
    const otra = client();
    await otra.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    check('otra empresa no puede pedirlo por un aviso ajeno', (await otra.post(`/api/company/jobs/${job.id}/feature-request`)).status === 404);
    check('sin sesión de empresa no se puede', (await pub.post(`/api/company/jobs/${job.id}/feature-request`)).status === 401);
    const nuevo = await emp.post('/api/company/jobs', { title: 'Peón rural de prueba', description: 'Tareas generales de finca: riego, limpieza y apoyo en cosecha. Turno mañana.', locality: 'San Carlos', category: 'Agricultura', type: 'Temporal', modality: 'Presencial', contactEmail: 'bodega@demo.workuco' });
    const pend = await emp.post(`/api/company/jobs/${nuevo.data.job.id}/feature-request`);
    check('no se puede pedir destacar un aviso que todavía no está publicado', pend.status === 400, `${nuevo.status} ${pend.status} ${JSON.stringify(pend.data)}`);
    const pedido = await emp.post(`/api/company/jobs/${job.id}/feature-request`);
    check('la empresa pide destacar su aviso', pedido.status === 200 && pedido.data.job && pedido.data.job.featureRequested === true, JSON.stringify(pedido.data).slice(0, 200));
    const enAdmin = (await admin.get('/api/admin/jobs')).data.jobs.find((j) => j.id === job.id);
    check('el admin ve el pedido', !!enAdmin && enAdmin.featureRequested === true && enAdmin.featureRequestedAt > 0, JSON.stringify(enAdmin || {}).slice(0, 160));
    check('se puede cancelar', (await emp.del(`/api/company/jobs/${job.id}/feature-request`)).data.job.featureRequested === false);
    await emp.post(`/api/company/jobs/${job.id}/feature-request`);

    console.log('— Destacar con vencimiento —');
    const antes = (await pub.get('/api/jobs?limit=50')).data.jobs;
    check('antes no sale primero (precondición)', antes[0].id !== job.id);
    const d = await admin.patch(`/api/admin/jobs/${job.id}`, { featuredDays: 7 });
    const until = d.data.job && d.data.job.featuredUntil;
    check('el admin lo destaca por 7 días', d.status === 200 && d.data.job.featured === true && Math.abs(until - (Date.now() + 7 * DAY)) < 60000, JSON.stringify(d.data).slice(0, 200));
    check('destacarlo atiende el pedido', d.data.job.featureRequested === false);
    const lista = (await pub.get('/api/jobs?limit=50')).data.jobs;
    const arriba = (l) => { const i = l.findIndex((x) => x.id === job.id); const n = l.findIndex((x) => !x.featured); return i >= 0 && (n < 0 || i < n) && l[i].featured === true; };
    check('sale arriba en Buscar, con los destacados y antes que el resto', arriba(lista), JSON.stringify(lista.slice(0, 4).map((x) => [x.id, x.featured])));
    check('y arriba en Wik Works', arriba((await pub.get('/api/jobs?sort=flyer&limit=50')).data.jobs));
    check('días inválidos no se aceptan', (await admin.patch(`/api/admin/jobs/${job.id}`, { featuredDays: 99 })).status === 400);
    check('una empresa no puede destacarse sola', (await emp.patch(`/api/admin/jobs/${job.id}`, { featuredDays: 30 })).status === 401);

    console.log('— Editar no le quita el destacado —');
    const det = (await emp.get(`/api/jobs/${job.id}`)).data.job;
    const ed = await emp.put(`/api/company/jobs/${job.id}`, { ...det, description: `${det.description} Se suma turno tarde.` });
    check('se puede editar', ed.status === 200, JSON.stringify(ed.data).slice(0, 200));
    const tras = (await admin.get('/api/admin/jobs')).data.jobs.find((j) => j.id === job.id);
    check('sigue destacado después de editar', tras.featured === true && tras.featuredUntil === until, JSON.stringify({ f: tras.featured, u: tras.featuredUntil, until }));
    await admin.patch(`/api/admin/jobs/${job.id}`, { status: 'approved' });

    console.log('— Vence solo —');
    const db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    db.prepare('UPDATE jobs SET featured_until=? WHERE id=?').run(Date.now() - 1000, job.id);
    db.close();
    const vencido = (await pub.get('/api/jobs?limit=50')).data.jobs.find((j) => j.id === job.id);
    check('vencido deja de estar destacado', vencido && vencido.featured === false);
    check('y ya no sale con los destacados', !arriba((await pub.get('/api/jobs?limit=50')).data.jobs));
    await admin.patch(`/api/admin/jobs/${job.id}`, { featuredDays: 15 });
    check('se puede quitar', (await admin.patch(`/api/admin/jobs/${job.id}`, { featuredDays: null })).data.job.featured === false);
    await admin.patch(`/api/admin/jobs/${job.id}`, { featuredDays: 30 });

    console.log('— Estadísticas por aviso —');
    const base = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id);
    for (let i = 0; i < 3; i++) await client().get(`/api/jobs/${job.id}`);
    await emp.get(`/api/jobs/${job.id}`);
    await admin.get(`/api/jobs/${job.id}`);
    const post = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.id === job.id);
    check('cuenta las visitas de la gente', post.views === base.views + 3, `${base.views} → ${post.views}`);
    check('no cuenta a la propia empresa ni al admin', post.views === base.views + 3);
    check('muestra las vistas de los últimos 7 días', post.viewsWeek >= 3, JSON.stringify(post).slice(0, 120));
    check('y las postulaciones', typeof post.applications === 'number');
    check('y hasta cuándo está destacado', post.featured === true && post.featuredUntil > Date.now());
    const fs7 = await admin.get('/api/admin/featured-stats');
    check('el admin compara vistas de destacados contra el resto', fs7.status === 200 && fs7.data.featured && fs7.data.normal
      && typeof fs7.data.featured.viewsPerJobDay === 'number' && fs7.data.featured.jobs >= 1, JSON.stringify(fs7.data));
    check('sin ser admin no se ve', (await emp.get('/api/admin/featured-stats')).status === 401);

    console.log('— Cada visita cuenta según si el aviso estaba destacado ese día —');
    const job2 = mine.find((j) => j.id !== job.id && !j.featured) || (await pub.get('/api/jobs?limit=50')).data.jobs.find((j) => !j.featured && j.id !== job.id);
    const st = async () => (await admin.get('/api/admin/featured-stats')).data;
    const s0 = await st();
    for (let i = 0; i < 2; i++) await client().get(`/api/jobs/${job2.id}`);
    const s1 = await st();
    check('las visitas de un aviso normal suman al grupo normal', s1.normal.views === s0.normal.views + 2 && s1.featured.views === s0.featured.views, JSON.stringify([s0, s1]));
    await admin.patch(`/api/admin/jobs/${job2.id}`, { featuredDays: 7 });
    const s2 = await st();
    check('destacarlo no pasa sus visitas anteriores al grupo de destacados', s2.featured.views === s1.featured.views && s2.normal.views === s1.normal.views, JSON.stringify([s1, s2]));
    await client().get(`/api/jobs/${job2.id}`);
    const s3 = await st();
    check('las visitas mientras está destacado suman a los destacados', s3.featured.views === s2.featured.views + 1 && s3.normal.views === s2.normal.views, JSON.stringify([s2, s3]));
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
