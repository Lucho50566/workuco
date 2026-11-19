/**
 * Pruebas del "Rendimiento" de cada aviso en el panel de empresa:
 * vistas y postulaciones por día, porcentaje que se postula y destacado contra sin destacar.
 *
 *   node tools/test-rendimiento.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const PORT = 4641;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-rendimiento-${Date.now()}`);
const DAY = 86400000;
const dayAR = (offset = 0) => new Date(Date.now() - 3 * 3600e3 + offset * DAY).toISOString().slice(0, 10);

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
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }) };
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
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', WORKUCO_ADMIN_EMAIL: 'admin@workuco.com.ar', WORKUCO_ADMIN_PASS: 'workuco2026' },
  });
  try {
    await waitServer();
    const emp = client();
    await emp.post('/api/auth/login', { email: 'bodega@demo.workuco', password: 'demo12345' });
    const job = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.status === 'approved');
    check('la empresa demo tiene un aviso publicado (precondición)', !!job);
    const url = `/api/company/jobs/${job.id}/stats`;

    console.log('— Permisos —');
    check('sin sesión no se ve', (await client().get(url)).status === 401);
    const otra = client();
    await otra.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    check('otra empresa no ve el rendimiento de un aviso ajeno', (await otra.get(url)).status === 404);
    check('un aviso que no existe da 404', (await emp.get('/api/company/jobs/noexiste/stats')).status === 404);

    console.log('— Vistas y postulaciones por día —');
    const r0 = (await emp.get(url)).data;
    check('trae 14 días, del más viejo a hoy', r0.series.length === 14 && r0.series[13].day === dayAR(0) && r0.series[0].day === dayAR(-13), JSON.stringify(r0.series.map((s) => s.day)));
    for (let i = 0; i < 6; i++) await client().get(`/api/jobs/${job.id}`);
    const r1 = (await emp.get(url)).data;
    check('las vistas de hoy suben con cada visita', r1.series[13].views === r0.series[13].views + 6 && r1.views === r0.views + 6, `${r0.series[13].views} → ${r1.series[13].views}`);
    check('con menos de 20 vistas no muestra porcentaje (engañaría)', r1.views >= 20 || r1.conversion === null);
    const ap = await client().post(`/api/jobs/${job.id}/apply`, { name: 'Prueba Rendimiento', email: 'rendimiento@test.com', phone: '2622555555' });
    check('postularse funciona (precondición)', ap.status === 201 || ap.status === 200, `${ap.status} ${JSON.stringify(ap.data).slice(0, 120)}`);
    const r2 = (await emp.get(url)).data;
    check('la postulación cuenta en el día de hoy', r2.series[13].applications === r1.series[13].applications + 1 && r2.applications === r1.applications + 1);
    for (let i = 0; i < 20; i++) await client().get(`/api/jobs/${job.id}`);
    const r3 = (await emp.get(url)).data;
    check('con 20 vistas o más calcula qué porcentaje se postula', r3.conversion === Math.round((r3.applications / r3.views) * 1000) / 10, JSON.stringify({ v: r3.views, a: r3.applications, c: r3.conversion }));

    console.log('— Días anteriores —');
    let db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    db.prepare('INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,0,?) ON CONFLICT(job_id, day, featured) DO UPDATE SET views=excluded.views').run(job.id, dayAR(-5), 9);
    db.prepare('INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,0,?) ON CONFLICT(job_id, day, featured) DO UPDATE SET views=excluded.views').run(job.id, dayAR(-20), 50);
    db.close();
    const r4 = (await emp.get(url)).data;
    check('una vista de hace 5 días aparece en su día', r4.series[8].day === dayAR(-5) && r4.series[8].views >= 9);
    check('lo de hace más de 14 días no entra en el gráfico', r4.views === r3.views + 9, `${r3.views} → ${r4.views}`);

    console.log('— Destacado contra sin destacar —');
    check('un aviso que nunca se destacó no compara', r4.compare === null);
    db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    const t = Date.now();
    /* publicado hace 10 días; destacado los últimos 4 (6 días sin destacar) */
    db.prepare('UPDATE jobs SET published_at=?, featured=1, featured_from=?, featured_until=? WHERE id=?').run(t - 10 * DAY, t - 4 * DAY, t + 3 * DAY, job.id);
    db.prepare('DELETE FROM job_views WHERE job_id=?').run(job.id);
    db.prepare('INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,1,?)').run(job.id, dayAR(-1), 120);
    db.prepare('INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,0,?)').run(job.id, dayAR(-7), 60);
    db.close();
    const r5 = (await emp.get(url)).data;
    check('compara vistas por día destacado contra sin destacar', !!r5.compare && Math.abs(r5.compare.featuredPerDay - 30) < 0.2 && Math.abs(r5.compare.normalPerDay - 10) < 0.2, JSON.stringify(r5.compare));
    check('y calcula cuántas veces más', r5.compare && Math.abs(r5.compare.ratio - 3) < 0.05, JSON.stringify(r5.compare));
    check('las vistas destacadas se marcan en su día', r5.series[12].featuredViews === 120);
    db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    /* vistas de un destacado anterior (hace 8 días): no se suman al período destacado actual */
    db.prepare('INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,1,?)').run(job.id, dayAR(-8), 500);
    db.close();
    const r6 = (await emp.get(url)).data;
    check('un destacado anterior no infla el período destacado actual', r6.compare && Math.abs(r6.compare.featuredPerDay - 30) < 0.2, JSON.stringify(r6.compare));
    db = new DatabaseSync(path.join(DATA, 'workuco.sqlite'));
    /* destacado que se quitó antes de tiempo: featured_until queda en el momento en que se quitó */
    db.prepare('UPDATE jobs SET featured=0, featured_until=? WHERE id=?').run(t - 2 * DAY, job.id);
    db.close();
    const r7 = (await emp.get(url)).data;
    check('si se quitó antes, el período destacado termina ahí (2 días: 60 por día)', r7.compare && Math.abs(r7.compare.featuredPerDay - 60) < 0.5, JSON.stringify(r7.compare));
    const admin = client();
    await admin.post('/api/admin/login', { email: 'admin@workuco.com.ar', password: 'workuco2026' });
    const site = (await admin.get('/api/admin/featured-stats')).data;
    const now8 = (await emp.get(url)).data;
    const enough = site.ratio > 1 && site.featured.jobs >= 3 && site.normal.jobs >= 3;
    check('el promedio de toda la página sólo aparece con datos suficientes, y es el mismo que ve el admin',
      enough ? now8.siteRatio === site.ratio : now8.siteRatio === null, JSON.stringify({ site, siteRatio: now8.siteRatio }).slice(0, 300));
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
