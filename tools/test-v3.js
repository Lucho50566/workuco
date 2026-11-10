/**
 * Pruebas end-to-end de las funciones v3: sueldo y changas, compatibilidad,
 * notificaciones, alertas, talento, invitaciones, respuesta de empresa, CV y perfil público.
 *
 *   node tools/test-v3.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4598;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-v3-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const PASS = 'demo12345';

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const kv = c.split(';')[0];
      if (kv.startsWith('wk_sess=')) cookie = kv;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {}, text, type: res.headers.get('content-type') || '' };
  }
  return {
    get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }),
  };
}

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}

const monthly = (j) => (j.salaryMin || 0) * ({ 'día': 22, hora: 160 }[j.salaryPeriod] || 1);
const nonIncreasing = (arr) => arr.every((v, i) => i === 0 || arr[i - 1] >= v);
const validJob = (over = {}) => ({
  title: 'Ayudante de prueba', locality: 'Tunuyán', category: 'Comercio', type: 'Tiempo completo', modality: 'Presencial',
  description: 'Descripción de prueba suficientemente larga para pasar la validación del servidor de Workuco.',
  contactEmail: 'prueba@demo.workuco', ...over,
});

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_INVITE_LIMIT: '3',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitServer();
    const pub = client(); const martina = client(); const ramon = client(); const nuevo = client();
    const bodega = client(); const finca = client(); const admin = client(); const fresh = client();

    await martina.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: PASS });
    await ramon.post('/api/auth/login', { role: 'candidate', email: 'ramon@demo.workuco', password: PASS });
    await bodega.post('/api/auth/login', { email: 'bodega@demo.workuco', password: PASS });
    await finca.post('/api/auth/login', { email: 'finca@demo.workuco', password: PASS });
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const reg = await nuevo.post('/api/auth/register', { role: 'candidate', name: 'Persona Nueva', email: 'nueva@test.workuco', password: 'clave12345', phone: '2622 400400' });
    const nuevoId = reg.data.candidate && reg.data.candidate.id;
    await fresh.post('/api/auth/register', { role: 'company', name: 'Empresa Recién Creada', email: 'fresh@test.workuco', password: 'clave12345', phone: '2622 400401' });

    /* ------------------------------------------------------------ */
    console.log('\n— Sueldo, habilidades y changas —');
    const meta = await pub.get('/api/meta');
    check('meta: conteos públicos', meta.data.counts && meta.data.counts.jobs === 16 && meta.data.counts.gigs === 4, JSON.stringify(meta.data.counts));
    check('meta: períodos de sueldo', Array.isArray(meta.data.salaryPeriods) && meta.data.salaryPeriods.length === 3);

    const all = await pub.get('/api/jobs?limit=30');
    check('lista: 16 ofertas aprobadas', all.data.total === 16, `total=${all.data.total}`);
    check('lista: cada oferta trae salaryLabel y skills', (all.data.jobs || []).every((j) => typeof j.salaryLabel === 'string' && Array.isArray(j.skills)));
    const j1 = (all.data.jobs || []).find((j) => j.id === 'jdemo001') || {};
    check('sueldo estructurado con etiqueta', j1.salaryMin === 900000 && j1.salaryMax === 1100000 && j1.salaryLabel === '$ 900.000 a $ 1.100.000 por mes', j1.salaryLabel);

    const gigs = await pub.get('/api/jobs?gig=1&limit=30');
    check('filtro changas', (gigs.data.jobs || []).length === 4 && gigs.data.jobs.every((j) => j.gig === true && j.startDate && j.duration));
    const noGigs = await pub.get('/api/jobs?gig=0&limit=30');
    check('filtro sin changas', (noGigs.data.jobs || []).length === 12 && noGigs.data.jobs.every((j) => j.gig === false));
    const withSalary = await pub.get('/api/jobs?withSalary=1&limit=30');
    check('filtro con sueldo publicado', (withSalary.data.jobs || []).length > 0 && withSalary.data.jobs.length < 16 && withSalary.data.jobs.every((j) => j.salaryMin > 0));
    const bySalary = await pub.get('/api/jobs?sort=salary&limit=30');
    check('orden por sueldo (normalizado a mes)', (bySalary.data.jobs || []).length === 16 && nonIncreasing(bySalary.data.jobs.map(monthly)) && monthly(bySalary.data.jobs[0]) > 0);

    const legacy = await bodega.post('/api/company/jobs', validJob({ salary: 'A convenir' }));
    check('aviso sin campos nuevos sigue siendo válido', legacy.status === 201 && Array.isArray(legacy.data.job.skills) && legacy.data.job.skills.length === 0 && legacy.data.job.gig === false);
    check('aviso viejo usa el texto de sueldo', legacy.data.job && legacy.data.job.salaryLabel === 'A convenir');
    const pendingJobId = legacy.data.job && legacy.data.job.id;
    const badSalary = await bodega.post('/api/company/jobs', validJob({ salaryMin: 500000, salaryMax: 400000 }));
    check('sueldo máximo menor al mínimo se rechaza', badSalary.status === 400 && badSalary.data.fields && !!badSalary.data.fields.salaryMax);
    const manySkills = await bodega.post('/api/company/jobs', validJob({ skills: Array.from({ length: 12 }, (_, i) => `Habilidad ${i}`), salaryMin: 5e9 }));
    check('máximo 8 habilidades por aviso', manySkills.status === 201 && manySkills.data.job.skills.length === 8);
    check('sueldo acotado a 99.999.999', manySkills.data.job && manySkills.data.job.salaryMin === 99999999);
    const gigJob = await bodega.post('/api/company/jobs', validJob({ gig: true, startDate: '2026-12-01', duration: '2 semanas', salaryMin: 30000, salaryPeriod: 'día' }));
    check('alta de changa', gigJob.status === 201 && gigJob.data.job.gig === true && gigJob.data.job.salaryLabel === '$ 30.000 por día', gigJob.data.job && gigJob.data.job.salaryLabel);

    const prof = await nuevo.patch('/api/candidate/profile', { openToWork: true, categories: ['Agricultura', 'Inventada'], salaryMin: 800000 });
    check('perfil: disponible, rubros y sueldo pretendido', prof.status === 200 && prof.data.candidate.openToWork === true
      && JSON.stringify(prof.data.candidate.categories) === '["Agricultura"]' && prof.data.candidate.salaryMin === 800000);
    await nuevo.patch('/api/candidate/profile', { openToWork: false, categories: [], salaryMin: 0 });

    /* ------------------------------------------------------------ */
    console.log('\n— Compatibilidad —');
    check('sin sesión no hay match', (all.data.jobs || []).every((j) => j.match === undefined));
    const mList = await martina.get('/api/jobs?limit=30');
    check('con sesión de persona cada oferta trae match', (mList.data.jobs || []).length === 16 && mList.data.jobs.every((j) => j.match && Number.isInteger(j.match.score)));
    const mj1 = (mList.data.jobs || []).find((j) => j.id === 'jdemo001') || {};
    check('Martina es muy compatible con el puesto de bodega', mj1.match && mj1.match.score >= 80, JSON.stringify(mj1.match));
    const mSort = await martina.get('/api/jobs?sort=match&limit=30');
    check('orden por compatibilidad', (mSort.data.jobs || []).length === 16 && nonIncreasing(mSort.data.jobs.map((j) => j.match.score)));
    const mSortP2 = await martina.get('/api/jobs?sort=match&limit=9&page=2');
    check('orden por compatibilidad pagina bien', mSortP2.data.page === 2 && (mSortP2.data.jobs || []).length === 7
      && mSortP2.data.jobs[0].match.score <= mSort.data.jobs[8].match.score);
    const mDetail = await martina.get('/api/jobs/jdemo001');
    check('detalle con match, motivos y faltantes', mDetail.data.job && mDetail.data.job.match && mDetail.data.job.match.reasons.length > 0 && Array.isArray(mDetail.data.job.match.missing));
    const rec = await martina.get('/api/candidate/recommended');
    check('recomendadas: hasta 6, compatibles y sin las ya postuladas', rec.status === 200 && rec.data.jobs.length > 0 && rec.data.jobs.length <= 6
      && rec.data.jobs.every((j) => j.id !== 'jdemo001' && j.match.score >= 40));
    check('recomendadas requiere sesión de persona', (await pub.get('/api/candidate/recommended')).status === 401);
    const nList = await nuevo.get('/api/jobs?sort=match&limit=30');
    check('perfil vacío: match null y el orden no rompe', nList.status === 200 && (nList.data.jobs || []).length === 16 && nList.data.jobs.every((j) => j.match === null));
    const bApps = await bodega.get('/api/company/applications');
    const mApp = (bApps.data.applications || []).find((a) => a.id === 'ademo01') || {};
    check('la empresa ve la compatibilidad de cada postulante', mApp.match && Number.isInteger(mApp.match.score));
    const dash = await bodega.get('/api/company/dashboard');
    const dApp = (dash.data.applications || []).find((a) => a.id === 'ademo01') || {};
    check('el tablero del panel también trae la compatibilidad', dApp.match && Number.isInteger(dApp.match.score));
    check('el tablero trae la respuesta de la empresa', dash.data.response && dash.data.response.rate >= 0);

    /* ------------------------------------------------------------ */
    console.log('\n— Notificaciones —');
    check('notificaciones requiere sesión', (await pub.get('/api/notifications')).status === 401);
    const ap = await nuevo.post('/api/jobs/jdemo008/apply', {});
    check('postulación de persona nueva', ap.status === 201);
    const bN = await bodega.get('/api/notifications');
    check('la empresa recibe aviso de postulación', (bN.data.items || []).some((n) => n.kind === 'postulacion' && /Persona Nueva/.test(`${n.title} ${n.body}`)) && bN.data.unread >= 1);
    const before = (await martina.get('/api/notifications')).data;
    await bodega.patch('/api/company/applications/ademo01', { stage: 'entrevista' });
    const n1 = (await martina.get('/api/notifications')).data;
    check('cambio de etapa notifica a la persona', n1.items.length === before.items.length + 1 && n1.items[0].kind === 'etapa' && /Operario de bodega/.test(`${n1.items[0].title} ${n1.items[0].body}`) && n1.items[0].link);
    await bodega.patch('/api/company/applications/ademo01', { stage: 'entrevista', rating: 3 });
    const n2 = (await martina.get('/api/notifications')).data;
    check('la misma etapa no notifica dos veces', n2.items.length === n1.items.length);
    await bodega.patch('/api/company/applications/ademo01', { stage: 'descartado' });
    const n3 = (await martina.get('/api/notifications')).data;
    check('el descarte también se avisa', n3.items.length === n2.items.length + 1 && n3.items[0].kind === 'etapa');
    await nuevo.post('/api/notifications/read', { id: n3.items[0].id });
    check('nadie marca como leídas las de otra persona', (await martina.get('/api/notifications')).data.unread === n3.unread && n3.unread > 0);
    await martina.post('/api/notifications/read', { id: n3.items[0].id });
    check('marcar una como leída', (await martina.get('/api/notifications')).data.unread === n3.unread - 1);
    await martina.post('/api/notifications/read', {});
    check('marcar todas como leídas', (await martina.get('/api/notifications')).data.unread === 0);

    /* ------------------------------------------------------------ */
    console.log('\n— Alertas —');
    check('alertas requiere sesión de persona', (await bodega.get('/api/candidate/alerts')).status === 401);
    const a1 = await martina.post('/api/candidate/alerts', { category: 'Gastronomía', locality: 'Tunuyán' });
    check('crear alerta', a1.status === 201 && a1.data.alert && a1.data.alert.label.includes('Gastronomía'));
    check('alerta vacía se rechaza', (await martina.post('/api/candidate/alerts', {})).status === 400);
    for (let i = 0; i < 9; i++) await martina.post('/api/candidate/alerts', { q: `tecnologia ${i}`, category: 'Tecnología' });
    const aList = await martina.get('/api/candidate/alerts');
    check('lista de alertas', aList.data.alerts.length === 10);
    check('máximo 10 alertas', (await martina.post('/api/candidate/alerts', { q: 'una más' })).status === 400);
    check('no se borra la alerta de otra persona', (await nuevo.del(`/api/candidate/alerts/${a1.data.alert.id}`)).status === 404);
    const lastAlert = aList.data.alerts.find((a) => a.id !== a1.data.alert.id);
    check('borrar alerta propia', (await martina.del(`/api/candidate/alerts/${lastAlert.id}`)).status === 200
      && (await martina.get('/api/candidate/alerts')).data.alerts.length === 9);
    const gj = await finca.post('/api/company/jobs', validJob({ title: 'Mozo para salón de eventos', category: 'Gastronomía' }));
    const mBefore = (await martina.get('/api/notifications')).data.items.length;
    await admin.patch(`/api/admin/jobs/${gj.data.job.id}`, { status: 'approved' });
    const mAfter = (await martina.get('/api/notifications')).data;
    check('oferta aprobada dispara la alerta que coincide (una sola vez)', mAfter.items.length === mBefore + 1 && mAfter.items[0].kind === 'alerta' && mAfter.items[0].link === `/oferta/${gj.data.job.id}`);
    check('la empresa se entera de la aprobación', (await finca.get('/api/notifications')).data.items.some((n) => n.kind === 'oferta'));
    const gj2 = await finca.post('/api/company/jobs', validJob({ title: 'Cocinero de temporada', category: 'Gastronomía', locality: 'San Carlos' }));
    await admin.patch(`/api/admin/jobs/${gj2.data.job.id}`, { status: 'approved' });
    check('otra localidad no dispara la alerta', (await martina.get('/api/notifications')).data.items.length === mAfter.items.length);

    /* ------------------------------------------------------------ */
    console.log('\n— Base de talento e invitaciones —');
    check('talento es solo para empresas', (await martina.get('/api/company/talent')).status === 401 && (await pub.get('/api/company/talent')).status === 401);
    const talent = await bodega.get('/api/company/talent');
    const people = talent.data.people || [];
    check('talento lista personas disponibles', people.length >= 5 && people.some((x) => x.id === 'udemo01'));
    check('talento no incluye a quien no está disponible', !people.some((x) => x.id === nuevoId || x.id === 'udemo05'));
    check('talento no filtra datos de contacto', !/512345|533221|@demo\.workuco|"phone"|"email"/.test(talent.text));
    const tJob = await bodega.get('/api/company/talent?jobId=jdemo001');
    const tp = tJob.data.people || [];
    check('talento con oferta: match y orden', tp.length >= 5 && tp.every((x) => x.match && Number.isInteger(x.match.score)) && nonIncreasing(tp.map((x) => x.match.score)));
    check('talento marca quién ya se postuló', (tp.find((x) => x.id === 'udemo01') || {}).applied === true);
    check('talento con oferta ajena: 403', (await bodega.get('/api/company/talent?jobId=jdemo002')).status === 403);
    const tFilter = await bodega.get('/api/company/talent?locality=Tupungato');
    check('talento filtra por localidad', (tFilter.data.people || []).length > 0 && tFilter.data.people.every((x) => x.locality === 'Tupungato'));
    const tQ = await bodega.get('/api/company/talent?q=tractor');
    check('talento busca por habilidad', (tQ.data.people || []).some((x) => x.id === 'udemo03') && tQ.data.people.length < people.length);

    const inv = await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo03', message: 'Nos interesa tu perfil <b>mucho</b>' });
    check('invitar a postularse', inv.status === 201);
    check('invitación duplicada: 409', (await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo03' })).status === 409);
    check('invitar con oferta ajena: 403', (await bodega.post('/api/company/invitations', { jobId: 'jdemo002', candidateId: 'udemo03' })).status === 403);
    check('invitar con oferta sin aprobar: 400', (await bodega.post('/api/company/invitations', { jobId: pendingJobId, candidateId: 'udemo03' })).status === 400);
    check('invitar a quien no está disponible: 404', (await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo05' })).status === 404);
    check('invitar a quien ya se postuló: 409', (await bodega.post('/api/company/invitations', { jobId: 'jdemo001', candidateId: 'udemo01' })).status === 409);
    const rN = await ramon.get('/api/notifications');
    check('la persona recibe la invitación como notificación', (rN.data.items || []).filter((n) => n.kind === 'invitacion').length === 1);
    const rInv = await ramon.get('/api/candidate/invitations');
    const mine = (rInv.data.invitations || []).find((i) => i.job && i.job.id === 'jdemo008');
    check('la persona ve la invitación', !!mine && mine.status === 'enviada' && mine.companyName === 'Bodega Alto Uco' && mine.message.includes('Nos interesa'));
    const tAfter = await bodega.get('/api/company/talent?jobId=jdemo008');
    check('talento marca a quién ya se invitó', ((tAfter.data.people || []).find((x) => x.id === 'udemo03') || {}).invited === true);
    await ramon.post('/api/jobs/jdemo008/apply', {});
    const rInv2 = await ramon.get('/api/candidate/invitations');
    check('al postularse la invitación queda como postulada', ((rInv2.data.invitations || []).find((i) => i.job.id === 'jdemo008') || {}).status === 'postulada');
    await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo04' });
    await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo06' });
    check('límite diario de invitaciones: 429', (await bodega.post('/api/company/invitations', { jobId: 'jdemo008', candidateId: 'udemo07' })).status === 429);
    check('meta trae 8 plantillas de aviso', Array.isArray(meta.data.templates) && meta.data.templates.length === 8
      && meta.data.templates.every((t) => t.id && t.label && t.title && t.description.length >= 60 && Array.isArray(t.skills)));

    /* ------------------------------------------------------------ */
    console.log('\n— Respuesta de la empresa —');
    const cBodega = await pub.get('/api/companies/cdemo01bodega');
    const r = cBodega.data.company && cBodega.data.company.response;
    check('empresa con historial trae su respuesta', !!r && r.rate >= 0 && r.rate <= 100 && r.days >= 1 && r.total >= 3, JSON.stringify(r));
    const freshMe = await fresh.get('/api/me');
    const cFresh = await pub.get(`/api/companies/${freshMe.data.user.company.id}`);
    check('empresa nueva no trae insignia', cFresh.status === 200 && cFresh.data.company.response === null);
    check('el detalle de la oferta trae la respuesta de la empresa', !!(await pub.get('/api/jobs/jdemo001')).data.job.companyResponse);
    const cList = await pub.get('/api/companies');
    check('el directorio trae la respuesta', (cList.data.companies || []).some((c) => c.response && c.response.rate >= 0));

    /* ------------------------------------------------------------ */
    console.log('\n— CV Workuco y perfil público —');
    const cvMine = await martina.get('/api/cv-data/udemo01');
    check('la persona ve su CV con contacto', cvMine.status === 200 && cvMine.data.candidate.name === 'Martina Salinas' && /512345/.test(cvMine.data.candidate.phone));
    check('CV: otra persona no puede', (await nuevo.get('/api/cv-data/udemo01')).status === 403);
    check('CV: sin sesión 401', (await pub.get('/api/cv-data/udemo01')).status === 401);
    check('CV: empresa con postulación puede', (await bodega.get('/api/cv-data/udemo01')).status === 200);
    check('CV: empresa sin postulación no puede', (await finca.get('/api/cv-data/udemo01')).status === 403);
    check('CV: admin puede', (await admin.get('/api/cv-data/udemo01')).status === 200);
    const mp = (await martina.get('/api/candidate/profile')).data.candidate;
    check('perfil trae slug público', typeof mp.publicSlug === 'string' && mp.publicSlug.length > 3 && mp.isPublic === true);
    const pubP = await pub.get(`/api/public/${mp.publicSlug}`);
    check('perfil público visible', pubP.status === 200 && pubP.data.person.name === 'Martina Salinas' && pubP.data.person.skills.length > 0);
    check('perfil público sin datos de contacto', !/512345|martina@demo|"phone"|"email"/.test(pubP.text));
    const np = (await nuevo.get('/api/candidate/profile')).data.candidate;
    check('perfil no público: 404', (await pub.get(`/api/public/${np.publicSlug}`)).status === 404);
    await nuevo.patch('/api/candidate/profile', { isPublic: true });
    check('activar perfil público', (await pub.get(`/api/public/${np.publicSlug}`)).status === 200);
    for (const [name, url] of [['CV', '/cv/udemo01'], ['perfil público', `/p/${mp.publicSlug}`], ['changas', '/changas']]) {
      const page = await pub.get(url);
      check(`página de ${name} responde HTML`, page.status === 200 && page.type.includes('text/html') && !page.text.includes('{{NAV}}') && !page.text.includes('{{TITLE}}'));
    }

    /* ------------------------------------------------------------ */
    console.log('\n— Revisión final: privacidad, avisos repetidos, insignia y vencidos —');
    const leaks = (txt) => /"salaryMin":800000|"isPublic"|"publicSlug"|sueldo llega/i.test(txt);
    const dashTxt = JSON.stringify((await bodega.get('/api/company/dashboard')).data.applications.map((a) => a.candidate && a.match ? { c: a.candidate, m: a.match } : null));
    check('el tablero no muestra el sueldo pretendido ni datos del perfil público', !leaks(dashTxt));
    check('las postulaciones de empresa no lo muestran', !leaks(JSON.stringify((await bodega.get('/api/company/applications')).data)));
    check('el CV para la empresa no lo muestra', !leaks((await bodega.get('/api/cv-data/udemo01')).text));
    check('la persona sí ve su sueldo pretendido', (await martina.get('/api/cv-data/udemo01')).data.candidate.salaryMin === 800000);
    check('el talento no muestra el motivo de sueldo', !/sueldo llega/i.test((await bodega.get('/api/company/talent?jobId=jdemo001')).text));

    const rj = await finca.post('/api/company/jobs', validJob({ title: 'Mozo de fin de semana', category: 'Gastronomía' }));
    await admin.patch(`/api/admin/jobs/${rj.data.job.id}`, { status: 'approved' });
    const afterFirst = (await martina.get('/api/notifications')).data.items.filter((n) => n.kind === 'alerta').length;
    await finca.patch(`/api/company/jobs/${rj.data.job.id}`, { status: 'closed' });
    await admin.patch(`/api/admin/jobs/${rj.data.job.id}`, { status: 'approved' });
    const afterSecond = (await martina.get('/api/notifications')).data.items.filter((n) => n.kind === 'alerta').length;
    check('reaprobar un aviso no vuelve a avisar a las alertas', afterSecond === afterFirst, `${afterFirst} -> ${afterSecond}`);

    const fakeCo = client();
    await fakeCo.post('/api/auth/register', { role: 'company', name: 'Empresa Inflada', email: 'inflada@test.workuco', password: 'clave12345', phone: '2622 400402' });
    const fj = await fakeCo.post('/api/company/jobs', validJob({ title: 'Puesto para inflar' }));
    await admin.patch(`/api/admin/jobs/${fj.data.job.id}`, { status: 'approved' });
    for (let i = 0; i < 3; i++) {
      const m = await fakeCo.post('/api/company/applications', { jobId: fj.data.job.id, name: `Falso ${i} Test`, email: `falso${i}@test.workuco`, phone: '2622 400999' });
      await fakeCo.patch(`/api/company/applications/${m.data.application.id}`, { stage: 'entrevista' });
    }
    const fakeMe = await fakeCo.get('/api/me');
    check('los postulantes cargados a mano no inflan la insignia', (await pub.get(`/api/companies/${fakeMe.data.user.company.id}`)).data.company.response === null);

    const exp = await bodega.post('/api/company/jobs', validJob({ title: 'Aviso que ya venció', closesAt: '2020-01-01' }));
    await admin.patch(`/api/admin/jobs/${exp.data.job.id}`, { status: 'approved' });
    check('no se puede invitar a un aviso vencido', (await bodega.post('/api/company/invitations', { jobId: exp.data.job.id, candidateId: 'udemo07' })).status === 400);
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
