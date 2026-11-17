/**
 * Pruebas de la gestión del admin: info de un aviso, eliminar con motivo, bandeja "para revisar" y buscador.
 *   node tools/test-admin-gestion.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4641;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-gestion-${Date.now()}`);
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
    return { status: res.status, data: data || {} };
  }
  return {
    req, get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p, b) => req(p, { method: 'DELETE', body: b }),
  };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const ficha = (o = {}) => ({
  name: 'Estudio Jurídico Prueba', section: 'servicios', category: 'Profesionales', localities: ['San Carlos'],
  description: 'Asesoramiento legal laboral, familia y sucesiones. Primera consulta sin cargo.', whatsapp: '2622 555777',
  hours: { mode: '24h' }, ...o,
});

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
    const persona = client();
    await persona.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    const job = (await emp.get('/api/company/jobs')).data.jobs.find((j) => j.status === 'approved');
    check('la empresa demo tiene un aviso publicado (precondición)', !!job);

    console.log('— Info de un aviso —');
    check('sin ser admin no se ve la info', (await pub.get(`/api/admin/jobs/${job.id}/info`)).status === 401);
    check('una empresa tampoco', (await emp.get(`/api/admin/jobs/${job.id}/info`)).status === 401);
    await pub.get(`/api/jobs/${job.id}`);
    const info = await admin.get(`/api/admin/jobs/${job.id}/info`);
    const d = info.data;
    check('el admin ve el aviso, la empresa y los números', info.status === 200 && d.job && d.job.id === job.id
      && d.company && d.company.name && d.company.email === 'bodega@demo.workuco'
      && d.stats && typeof d.stats.views === 'number' && d.stats.viewsWeek >= 1 && typeof d.stats.applications === 'number'
      && Array.isArray(d.warnings), JSON.stringify(d).slice(0, 300));
    check('aviso inexistente: 404', (await admin.get('/api/admin/jobs/nada123/info')).status === 404);

    console.log('— Eliminar con motivo —');
    const ap = await persona.post(`/api/jobs/${job.id}/apply`, {});
    check('Martina se postula (precondición)', [200, 201, 409].includes(ap.status), `${ap.status} ${JSON.stringify(ap.data).slice(0, 120)}`);
    const del = await admin.del(`/api/admin/jobs/${job.id}`, { reason: 'Contenido no permitido' });
    check('el admin lo elimina', del.status === 200);
    check('ya no existe', (await admin.get(`/api/admin/jobs/${job.id}/info`)).status === 404);
    const notiE = (await emp.get('/api/notifications')).data.items || [];
    check('la empresa recibe el aviso con el motivo', notiE.some((n) => /eliminamos/i.test(n.title) && /Contenido no permitido/.test(n.body)), JSON.stringify(notiE.slice(0, 2)));
    const notiP = (await persona.get('/api/notifications')).data.items || [];
    check('a quien se postuló se le avisa', notiP.some((n) => n.title.includes(job.title)), JSON.stringify(notiP.slice(0, 2)));

    console.log('— Bandeja "para revisar" —');
    check('sin ser admin: 401', (await pub.get('/api/admin/inbox')).status === 401);
    const nuevo = await emp.post('/api/company/jobs', { title: 'Encargado de depósito', description: 'Control de stock, recepción de mercadería y despacho. Lunes a viernes.', locality: 'Tunuyán', category: 'Otros', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'bodega@demo.workuco' });
    check('la empresa carga un aviso nuevo (precondición)', nuevo.status === 201, JSON.stringify(nuevo.data).slice(0, 200));
    const nueva = client();
    const reg = await nueva.post('/api/auth/register', { role: 'company', name: 'Ferretería Nueva', email: 'ferreteria@test.workuco', phone: '2622 402402', password: 'clave12345', acceptTerms: true });
    check('se registra una empresa nueva (precondición)', reg.status === 200 || reg.status === 201, JSON.stringify(reg.data).slice(0, 160));
    const abogado = client();
    await abogado.post('/api/auth/register', { role: 'candidate', name: 'Abogado Prueba', email: 'abogado@test.workuco', phone: '2622 401401', password: 'clave12345', acceptTerms: true });
    const f = await abogado.post('/api/my/places', ficha());
    check('se puede cargar en el rubro Profesionales', f.status === 201, JSON.stringify(f.data).slice(0, 200));
    const otra = await abogado.post('/api/my/places', ficha({ name: 'Estudio Ya Publicado', whatsapp: '2622 555778' }));
    await admin.patch(`/api/admin/places/${otra.data.place.id}`, { status: 'approved' });
    const inbox = (await admin.get('/api/admin/inbox')).data;
    check('trae el aviso pendiente', inbox.jobs && inbox.jobs.some((j) => j.id === nuevo.data.job.id), JSON.stringify(inbox).slice(0, 300));
    check('trae la ficha pendiente', inbox.places && inbox.places.some((p) => p.id === f.data.place.id && p.status === 'pending'));
    check('trae también la ficha nueva ya publicada', inbox.places.some((p) => p.id === otra.data.place.id && p.status === 'approved'));
    check('trae empresas nuevas', Array.isArray(inbox.companies) && inbox.companies.some((c) => c.email === 'ferreteria@test.workuco'), JSON.stringify(inbox.companies));
    check('trae pedidos de destacado', Array.isArray(inbox.featureRequests));
    check('cuenta lo pendiente por pestaña', inbox.counts && inbox.counts.jobs >= 1 && inbox.counts.places >= 1 && typeof inbox.counts.total === 'number', JSON.stringify(inbox.counts));
    const seen = await admin.post('/api/admin/inbox/seen', {});
    const inbox2 = (await admin.get('/api/admin/inbox')).data;
    check('"ya lo vi" saca lo publicado de la bandeja pero deja lo pendiente', seen.status === 200
      && !inbox2.places.some((p) => p.id === otra.data.place.id) && inbox2.places.some((p) => p.id === f.data.place.id)
      && inbox2.jobs.some((j) => j.id === nuevo.data.job.id) && inbox2.companies.length === 0, JSON.stringify(inbox2.places.map((p) => p.name)));
    check('"ya lo vi" sin ser admin: 401', (await pub.post('/api/admin/inbox/seen', {})).status === 401);
    const enBandeja = inbox.places.find((p) => p.id === f.data.place.id);
    check('se ve quién cargó la ficha', enBandeja && enBandeja.owner && enBandeja.owner.email === 'abogado@test.workuco' && enBandeja.owner.name === 'Abogado Prueba', JSON.stringify(enBandeja && enBandeja.owner));
    const det = (await admin.get(`/api/places/${otra.data.place.slug}`)).data.place;
    check('en el detalle de la ficha el admin también ve al dueño', det && det.owner && det.owner.email === 'abogado@test.workuco');
    check('el público no ve al dueño', !(await pub.get(`/api/places/${otra.data.place.slug}`)).data.place.owner);

    console.log('— Borrar una ficha con motivo —');
    const bf = await admin.del(`/api/admin/places/${otra.data.place.id}`, { reason: 'Datos falsos' });
    const notiA = (await abogado.get('/api/notifications')).data.items || [];
    check('el dueño recibe el aviso con el motivo', bf.status === 200 && notiA.some((n) => /borramos/i.test(n.title) && /Datos falsos/.test(n.body)), JSON.stringify(notiA.slice(0, 2)));

    console.log('— Personas —');
    check('sin ser admin: 401', (await pub.get('/api/admin/candidates')).status === 401);
    check('una empresa tampoco', (await emp.get('/api/admin/candidates')).status === 401);
    const todas = (await admin.get('/api/admin/candidates')).data;
    const mar = todas.people && todas.people.find((c) => c.email === 'martina@demo.workuco');
    check('el admin ve a las personas con contacto y datos', mar && mar.name && mar.phone && mar.locality && Array.isArray(mar.skills)
      && typeof mar.applications === 'number' && typeof mar.openToWork === 'boolean', JSON.stringify(mar).slice(0, 300));
    check('incluye a quien no marcó "disponible"', todas.people.some((c) => c.email === 'abogado@test.workuco' && c.openToWork === false));
    const disp = (await admin.get('/api/admin/candidates?available=1')).data.people;
    check('filtro "disponibles": sólo quienes marcaron estoy disponible', disp.length >= 1 && disp.every((c) => c.openToWork === true));
    const loc = (await admin.get(`/api/admin/candidates?locality=${encodeURIComponent('San Carlos')}`)).data.people;
    check('filtro por localidad', loc.length >= 1 && loc.every((c) => c.locality === 'San Carlos'));
    const bq = (await admin.get('/api/admin/candidates?q=martina')).data.people;
    check('búsqueda por nombre', bq.length >= 1 && bq.every((c) => /martina/i.test(c.name + c.email)));
    check('cuenta disponibles y total', typeof todas.counts.total === 'number' && todas.counts.available >= 1 && todas.counts.total >= todas.counts.available, JSON.stringify(todas.counts));

    console.log('— Buscador del admin —');
    check('sin ser admin: 401', (await pub.get('/api/admin/search?q=estudio')).status === 401);
    const s = (await admin.get('/api/admin/search?q=estudio')).data;
    check('encuentra fichas de la Guía por nombre', s.places && s.places.some((p) => p.id === f.data.place.id), JSON.stringify(s).slice(0, 300));
    const s2 = (await admin.get(`/api/admin/search?q=${encodeURIComponent('depósito')}`)).data;
    check('encuentra avisos (también pendientes)', s2.jobs && s2.jobs.some((j) => j.id === nuevo.data.job.id));
    const s3 = (await admin.get('/api/admin/search?q=bodega@demo')).data;
    check('encuentra empresas por mail', s3.companies && s3.companies.some((c) => c.email === 'bodega@demo.workuco'));
    const s4 = (await admin.get('/api/admin/search?q=%25')).data;
    check('un % no trae todo', (s4.jobs || []).length === 0 && (s4.places || []).length === 0, JSON.stringify(s4).slice(0, 120));
    const s5 = (await admin.get('/api/admin/search?q=')).data;
    check('texto vacío: listas vacías', s5.jobs && s5.jobs.length === 0 && s5.places.length === 0 && s5.companies.length === 0);
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
