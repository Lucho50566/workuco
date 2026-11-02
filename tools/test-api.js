/**
 * Pruebas end-to-end de la API de Workuco.
 * Levanta un servidor temporal con datos demo y verifica los flujos principales.
 *
 *   node tools/test-api.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-test-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };

let ok = 0; let fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
  results.push({ name, cond });
}

function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const kv = c.split(';')[0];
      if (kv.startsWith('wk_sess=')) cookie = kv;
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, data, headers: res.headers };
  }
  return { req, get: (p) => req(p), post: (p, b) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }), del: (p) => req(p, { method: 'DELETE' }) };
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
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitServer();
    const pub = client();
    const admin = client();
    const comp = client();
    const other = client();

    console.log('\n— Público —');
    const meta = await pub.get('/api/meta');
    check('meta con localidades', meta.status === 200 && meta.data.localities.length === 3);
    check('meta con 9 categorías', meta.data.categories.length === 9);

    const list = await pub.get('/api/jobs?limit=50');
    check('lista solo ofertas aprobadas', list.status === 200 && list.data.total === 12, `total=${list.data.total}`);
    check('no expone emails de contacto en la lista', !JSON.stringify(list.data.jobs).includes('contactEmail'));
    check('ordenadas con destacadas primero', list.data.jobs[0].featured === true);

    const filtered = await pub.get('/api/jobs?locality=Tunuy%C3%A1n');
    check('filtro por localidad', filtered.data.jobs.every((j) => j.locality === 'Tunuyán'));

    const byCat = await pub.get('/api/jobs?category=Gastronom%C3%ADa');
    check('filtro por categoría', byCat.data.jobs.length >= 2);

    const q = await pub.get('/api/jobs?q=bodega');
    check('búsqueda por palabra', q.data.jobs.length >= 1);

    const remote = await pub.get('/api/jobs?modality=Remoto');
    check('filtro por modalidad', remote.data.jobs.every((j) => j.modality === 'Remoto'));

    const detail = await pub.get('/api/jobs/jdemo001');
    check('detalle de oferta', detail.status === 200 && detail.data.job.title.includes('bodega'));
    check('detalle incluye contacto', !!detail.data.job.contactEmail);

    const pendingDetail = await pub.get('/api/jobs/jdemo013');
    check('oferta pendiente no visible', pendingDetail.status === 404);

    console.log('\n— Postulaciones —');
    const badApply = await pub.post('/api/jobs/jdemo001/apply', { name: 'A', email: 'no', phone: '1' });
    check('valida postulación incompleta', badApply.status === 400 && !!badApply.data.fields.email);

    const apply = await pub.post('/api/jobs/jdemo001/apply', {
      name: 'Prueba Postulante', email: 'prueba@test.com', phone: '+54 2622 400000',
      message: 'Me interesa el puesto.', cv: { name: 'cv.pdf', data: Buffer.from('%PDF-1.4\n% test\n').toString('base64') },
    });
    check('postulación exitosa', apply.status === 201);
    const appId = apply.data.application.id;

    const dup = await pub.post('/api/jobs/jdemo001/apply', { name: 'Prueba Postulante', email: 'prueba@test.com', phone: '+54 2622 400000' });
    check('rechaza postulación duplicada', dup.status === 409);

    const notPdf = await pub.post('/api/jobs/jdemo002/apply', { name: 'Otro Postulante', email: 'otro@test.com', phone: '2622400001', cv: { name: 'x.txt', data: Buffer.from('hola').toString('base64') } });
    check('rechaza CV que no es PDF', notPdf.status === 400);

    console.log('\n— Cuenta de empresa —');
    const regBad = await pub.post('/api/auth/register', { name: '', email: 'x', phone: '', password: '123' });
    check('valida registro', regBad.status === 400 && Object.keys(regBad.data.fields).length >= 3);

    const reg = await comp.post('/api/auth/register', { name: 'Empresa Test SA', email: 'empresa@test.com', phone: '2622555555', password: 'clave12345' });
    check('registro de empresa', reg.status === 201);
    const me = await comp.get('/api/me');
    check('sesión de empresa activa', me.data.user && me.data.user.role === 'company');

    const noAuth = await pub.post('/api/company/jobs', { title: 'x' });
    check('publicar requiere sesión', noAuth.status === 401);

    const create = await comp.post('/api/company/jobs', {
      title: 'Cajero/a para supermercado', locality: 'Tunuyán', category: 'Comercio', type: 'Tiempo completo',
      modality: 'Presencial', description: 'Buscamos cajero con experiencia para turnos rotativos en el centro de Tunuyán, con atención al público.',
      responsibilities: 'Atención al público\nCobro en caja', requirements: 'Secundario completo\nExperiencia deseable',
      experience: '6 meses', schedule: 'Turnos rotativos', salary: '$ 700.000', contactEmail: 'rrhh@empresa.com', closesAt: '2027-01-15',
    });
    check('crea oferta pendiente', create.status === 201 && create.data.job.status === 'pending');
    const newJobId = create.data.job.id;

    const notVisible = await pub.get(`/api/jobs/${newJobId}`);
    check('la oferta nueva no es pública hasta aprobarse', notVisible.status === 404);

    console.log('\n— Administración —');
    const badLogin = await admin.post('/api/admin/login', { email: ADMIN.email, password: 'incorrecta' });
    check('admin rechaza credenciales malas', badLogin.status === 401);
    const goodLogin = await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    check('admin inicia sesión', goodLogin.status === 200);
    const stats = await admin.get('/api/admin/stats');
    check('estadísticas disponibles', stats.status === 200 && stats.data.stats.pending >= 3);
    check('cuenta empresas', stats.data.stats.companies >= 8);

    const pendingList = await admin.get('/api/admin/jobs?status=pending');
    check('admin ve pendientes', pendingList.data.jobs.some((j) => j.id === newJobId));

    const approve = await admin.patch(`/api/admin/jobs/${newJobId}`, { status: 'approved' });
    check('aprueba publicación', approve.status === 200 && approve.data.job.status === 'approved');

    const nowVisible = await pub.get(`/api/jobs/${newJobId}`);
    check('la oferta aprobada ya es pública', nowVisible.status === 200);

    const featured = await admin.patch(`/api/admin/jobs/${newJobId}`, { featured: true });
    check('marca destacada', featured.data.job.featured === true);

    const all = await pub.get('/api/jobs?limit=50');
    check('la destacada aparece primera', all.data.jobs[0].id === newJobId);

    const reject = await admin.patch(`/api/admin/jobs/${newJobId}`, { status: 'rejected', rejectReason: 'Falta descripción' });
    check('rechaza con motivo', reject.data.job.status === 'rejected' && reject.data.job.rejectReason === 'Falta descripción');

    const adminCompany = await admin.get('/api/admin/companies');
    const own = adminCompany.data.companies.find((c) => c.email === 'empresa@test.com');
    check('admin ve empresas registradas', !!own);
    const verify = await admin.patch(`/api/admin/companies/${own.id}`, { verified: true, plan: 'pro' });
    check('verifica empresa y cambia plan', verify.data.company.verified === true && verify.data.company.plan === 'pro');

    console.log('\n— Panel de empresa —');
    const myJobs = await comp.get('/api/company/jobs');
    check('empresa ve sus ofertas', myJobs.data.jobs.length === 1 && myJobs.data.jobs[0].status === 'rejected');

    const edit = await comp.put(`/api/company/jobs/${newJobId}`, {
      title: 'Cajero/a para supermercado', locality: 'Tunuyán', category: 'Comercio', type: 'Tiempo completo',
      modality: 'Presencial', description: 'Buscamos cajero con experiencia para turnos rotativos en el centro de Tunuyán, con muy buena atención al público.',
      contactEmail: 'rrhh@empresa.com', closesAt: '2027-01-15',
    });
    check('editar reenvía a revisión', edit.status === 200 && edit.data.job.status === 'pending');

    const apply2 = await pub.post(`/api/jobs/${newJobId}/apply`, { name: 'Candidato Test', email: 'candidato@test.com', phone: '2622444444' });
    check('no se puede postular a oferta pendiente', apply2.status === 404);

    await admin.patch(`/api/admin/jobs/${newJobId}`, { status: 'approved' });
    const apply3 = await pub.post(`/api/jobs/${newJobId}/apply`, { name: 'Candidato Test', email: 'candidato@test.com', phone: '2622444444', message: 'Disponibilidad inmediata.' });
    check('postulación a oferta aprobada', apply3.status === 201);

    const compApps = await comp.get('/api/company/applications');
    check('empresa ve postulaciones', compApps.data.applications.length === 1 && compApps.data.applications[0].name === 'Candidato Test');

    const statusUpdate = await comp.patch(`/api/company/applications/${compApps.data.applications[0].id}`, { status: 'contactada' });
    check('cambia estado de postulación', statusUpdate.status === 200);

    console.log('\n— CV y privacidad —');
    const cvOtherCompany = await comp.get(`/api/company/cv/${appId}`);
    check('otra empresa no accede al CV', cvOtherCompany.status === 403);

    const cvDenied = await pub.get('/api/company/cv/' + appId);
    check('sin sesión no se accede al CV', cvDenied.status === 401);

    await other.post('/api/auth/register', { name: 'Otra Empresa', email: 'otra@test.com', phone: '2622666666', password: 'clave12345' });
    const cvForbidden = await other.get(`/api/company/cv/${appId}`);
    check('empresa ajena no accede al CV', cvForbidden.status === 403);

    const adminCv = await admin.get(`/api/company/cv/${appId}`);
    check('admin puede ver el CV', adminCv.status === 200);

    console.log('\n— Borrado —');
    const del = await admin.del(`/api/admin/jobs/${newJobId}`);
    check('admin elimina oferta', del.status === 200);
    const gone = await pub.get(`/api/jobs/${newJobId}`);
    check('la oferta eliminada no existe', gone.status === 404);

    console.log('\n— Seguridad —');
    const spoof = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Evil', email: 'evil@test.com', phone: '2622777777', password: 'clave12345' }),
    });
    check('bloquea Origin externo', spoof.status === 403);

  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok · ${fail} fail`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
