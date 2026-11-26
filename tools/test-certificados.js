/**
 * Pruebas de los certificados de trabajo: reglas, base y API.
 *   node tools/test-certificados.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

function reglas() {
  console.log('— Reglas —');
  const { newCode, normCode, formatCode, validateIssue, periodLabel } = require('../lib/certificates');
  check('código de 8 letras sin ambiguas', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(newCode()));
  check('normaliza minúsculas y guion', normCode('k7m2-9qxa') === 'K7M29QXA');
  check('rechaza letras ambiguas', normCode('O0I1L000') === '');
  check('rechaza largo incorrecto', normCode('K7M29QX') === '' && normCode('') === '' && normCode(null) === '');
  check('formato con guion', formatCode('K7M29QXA') === 'K7M2-9QXA');
  const ctx = { appliedDate: '2026-03-10', today: '2026-11-25', defaultPosition: 'Tractorista' };
  const v = validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30' }, ctx);
  check('válido, con el puesto del aviso', !v.errors && v.value.position === 'Tractorista' && v.value.comment === '');
  check('fecha inexistente', !!(validateIssue({ startDate: '2026-02-30', endDate: '2026-04-30' }, ctx).errors || {}).startDate);
  check('falta una fecha', !!(validateIssue({ startDate: '2026-03-15' }, ctx).errors || {}).endDate);
  check('desde > hasta', !!(validateIssue({ startDate: '2026-05-01', endDate: '2026-04-30' }, ctx).errors || {}).endDate);
  check('hasta futura', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-12-01' }, ctx).errors || {}).endDate);
  check('desde antes de postularse (-1 día ok)', !validateIssue({ startDate: '2026-03-09', endDate: '2026-03-20' }, ctx).errors
    && !!(validateIssue({ startDate: '2026-03-08', endDate: '2026-03-20' }, ctx).errors || {}).startDate);
  check('comentario con teléfono', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'llamalo al 2622555123' }, ctx).errors || {}).comment);
  check('comentario de 281', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'a'.repeat(281) }, ctx).errors || {}).comment);
  check('comentario de 280 ok', !validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'a'.repeat(280) }, ctx).errors);
  check('puesto de 81', !!(validateIssue({ position: 'a'.repeat(81), startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).errors || {}).position);
  check('puesto editado', validateIssue({ position: '  Encargado de riego ', startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).value.position === 'Encargado de riego');
  check('período legible', periodLabel('2026-03-03', '2026-04-30') === 'del 3 de marzo de 2026 al 30 de abril de 2026');
  check('un solo día', periodLabel('2026-11-25', '2026-11-25') === 'el 25 de noviembre de 2026');
}

function base() {
  console.log('— Base —');
  const { Store } = require('../lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-cert-'));
  const s = new Store(path.join(dir, 'db.sqlite'));
  try {
    s.insertCandidate({ id: 'u1', name: 'Ana', email: 'ana@x.test', phone: '2622000001', password: 'x' });
    const base = { applicationId: 'a1', candidateId: 'u1', companyId: 'co1', jobId: 'j1', personName: 'Ana', companyName: 'Finca', position: 'Tractorista', locality: 'Tunuyán', startDate: '2026-03-15', endDate: '2026-04-30' };
    const c1 = s.insertCertificate({ ...base, comment: 'Muy responsable' });
    check('se crea vigente con comentario pendiente', c1.status === 'valid' && c1.commentStatus === 'pending' && c1.onProfile === false && /^[A-Z2-9]{8}$/.test(c1.code));
    check('por código y por id', s.certificateByCode(c1.code).id === c1.id && s.certificate(c1.id).code === c1.code);
    const c2 = s.insertCertificate({ ...base, applicationId: 'a2', comment: '' });
    check('sin comentario queda none', c2.commentStatus === 'none');
    check('códigos distintos', c1.code !== c2.code);
    check('por postulación', s.certificatesForApplication('a1').length === 1 && s.certificatesForApplication('a1')[0].id === c1.id);
    check('la base no deja dos vigentes para la misma postulación', s.insertCertificate({ ...base, comment: '' }) === null && s.certificatesForApplication('a1').length === 1);
    check('de la persona y de la empresa', s.certificatesOfCandidate('u1').length === 2 && s.certificatesOfCompany('co1').length === 2);
    check('no figura en público hasta prenderlo', s.publicCertificatesOf('u1').length === 0);
    s.setCertificateOnProfile(c1.id, true);
    check('figura en público', s.publicCertificatesOf('u1').length === 1);
    check('comentario aceptado', s.setCertificateComment(c1.id, 'shown').commentStatus === 'shown');
    check('admin busca por empresa o código', s.adminCertificates({ q: 'finca' }).length === 2 && s.adminCertificates({ q: c2.code }).length === 1);
    const r = s.revokeCertificate(c1.id, 'admin', 'denuncia');
    check('anula una vez', r.status === 'revoked' && r.revokedBy === 'admin' && r.revokeReason === 'denuncia' && !!r.revokedAt && s.revokeCertificate(c1.id, 'company', 'x') === null);
    check('anulado no figura en público', s.publicCertificatesOf('u1').length === 0);
    s.deleteCandidateCascade('u1');
    check('la baja borra sus certificados', s.certificatesOfCandidate('u1').length === 0 && !s.certificateByCode(c2.code));
  } finally {
    try { s.db.close(); } catch (_) { /* nada */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PORT = 4641;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
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
    try { data = JSON.parse(text); } catch (_) { /* html */ }
    return { status: res.status, data: data || {}, text };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }) };
}

async function api() {
  console.log('— API —');
  const DATA = path.join(os.tmpdir(), `workuco-cert-${Date.now()}`);
  const OUTBOX = path.join(DATA, 'outbox.jsonl');
  const outbox = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const mailsTo = (to) => outbox().filter((m) => m.to === to);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) { /* arrancando */ } await wait(150); }
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const okBody = { startDate: today, endDate: today };
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Finca Certifica', email: 'finca@test.workuco', phone: '2622 408408', password: 'clave12345', acceptTerms: true });
    const otra = client();
    await otra.post('/api/auth/register', { role: 'company', name: 'Otra Empresa', email: 'otra@test.workuco', phone: '2622 409409', password: 'clave12345', acceptTerms: true });
    const ana = client();
    await ana.post('/api/auth/register', { role: 'candidate', name: 'Ana Certificada', email: 'ana@test.workuco', phone: '2622 410410', password: 'clave12345', acceptTerms: true });
    const leo = client();
    await leo.post('/api/auth/register', { role: 'candidate', name: 'Leo Certificado', email: 'leo@test.workuco', phone: '2622 411411', password: 'clave12345', acceptTerms: true });
    const mkJob = async (title) => {
      const j = (await emp.post('/api/company/jobs', { title, description: 'Tareas generales de la finca, turno mañana, con ganas de aprender y trabajar en equipo.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'finca@test.workuco' })).data.job;
      await admin.patch(`/api/admin/jobs/${j.id}`, { status: 'approved' });
      return j;
    };
    const job = await mkJob('Tractorista para finca');
    const job2 = await mkJob('Ayudante de cosecha');
    await ana.post(`/api/jobs/${job.id}/apply`, { message: 'Hola' });
    await leo.post(`/api/jobs/${job2.id}/apply`, { message: 'Hola' });
    const apps = (await emp.get('/api/company/applications')).data.applications;
    const app = apps.find((a) => a.jobId === job.id);
    const app2 = apps.find((a) => a.jobId === job2.id);
    const cert = (id, b = okBody, c = emp) => c.post(`/api/company/applications/${id}/certificate`, b);

    check('no se emite si no está contratada', (await cert(app.id)).status === 400);
    await emp.patch(`/api/company/applications/${app.id}`, { stage: 'contratado' });
    await emp.patch(`/api/company/applications/${app2.id}`, { stage: 'contratado' });
    check('validación con errores por campo', (await cert(app.id, { startDate: '2026-02-30', endDate: today })).data.errors.startDate !== undefined);
    check('otra empresa → 404', (await cert(app.id, okBody, otra)).status === 404);
    check('una persona no puede emitir', (await cert(app.id, okBody, ana)).status === 401);
    const r1 = await cert(app.id, { ...okBody, comment: 'Muy responsable' });
    check('emite', r1.status === 201 && /^[A-Z2-9]{8}$/.test(r1.data.certificate.code), `${r1.status} ${r1.text}`);
    check('doble clic → 409', (await cert(app.id)).status === 409);
    const code = r1.data.certificate.code;
    const id = r1.data.certificate.id;
    const det = (await emp.get(`/api/company/applications/${app.id}`)).data.application;
    check('el detalle de la postulación trae el certificado', det.certificate && det.certificate.code === code);
    const pub = await client().get(`/api/certificates/${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`);
    check('verificación pública con minúsculas y guion', pub.status === 200 && pub.data.certificate.status === 'valid', `${pub.status}`);
    check('comentario pendiente no se muestra', !('comment' in pub.data.certificate));
    check('sin datos privados', !/2622|@test\.workuco|candidateId|applicationId|revokeReason|"id"/.test(pub.text), pub.text);
    check('nombre de la cuenta y datos del aviso', pub.data.certificate.personName === 'Ana Certificada' && pub.data.certificate.companyName === 'Finca Certifica'
      && pub.data.certificate.position === 'Tractorista para finca' && pub.data.certificate.locality === 'Tunuyán' && /^(del|el) /.test(pub.data.certificate.period));
    check('código inexistente → 404', (await client().get('/api/certificates/AAAA-BBBB')).status === 404 && (await client().get('/api/certificates/x')).status === 404);
    await wait(150);
    check('aviso a la persona por mail', mailsTo('ana@test.workuco').some((m) => /te dio un certificado de trabajo/.test(m.subject)));
    check('y a la campanita', (await ana.get('/api/notifications')).data.items.some((n) => /te dio un certificado de trabajo/.test(n.title)));
    const mine = (await ana.get('/api/candidate/certificates')).data.certificates;
    check('la persona ve su certificado con el comentario pendiente', mine.length === 1 && mine[0].comment === 'Muy responsable' && mine[0].commentStatus === 'pending');
    check('otra persona no puede tocarlo', (await leo.patch(`/api/candidate/certificates/${id}`, { onProfile: true })).status === 404);
    await ana.patch(`/api/candidate/certificates/${id}`, { commentShown: true });
    check('comentario aceptado se muestra', (await client().get(`/api/certificates/${code}`)).data.certificate.comment === 'Muy responsable');
    await ana.patch(`/api/candidate/certificates/${id}`, { commentShown: false });
    check('y se puede volver a ocultar', !('comment' in (await client().get(`/api/certificates/${code}`)).data.certificate));
    const page = await client().get(`/certificado/${code}`);
    check('página con noindex', page.status === 200 && /noindex/.test(page.text));
    check('código inválido en la página → 404', (await client().get('/certificado/nada')).status === 404);
    check('no está en el sitemap', !/\/certificado\//.test((await client().get('/sitemap.xml')).text));

    // perfil público
    await ana.patch('/api/candidate/profile', { isPublic: true });
    const slug = (await ana.get('/api/me')).data.user.candidate.publicSlug;
    check('no figura en el perfil público hasta prenderlo', !((await client().get(`/api/public/${slug}`)).data.certificates || []).length);
    await ana.patch(`/api/candidate/certificates/${id}`, { onProfile: true });
    const pp = (await client().get(`/api/public/${slug}`)).data;
    check('figura en el perfil público, sin el comentario oculto', (pp.certificates || []).length === 1 && pp.certificates[0].code === code
      && pp.certificates[0].companyName === 'Finca Certifica' && !/Muy responsable/.test(JSON.stringify(pp.certificates)));

    // sin comentario: no se puede "mostrar comentario"
    const r2 = await cert(app2.id);
    check('sin comentario, mostrar comentario → 400', (await leo.patch(`/api/candidate/certificates/${r2.data.certificate.id}`, { commentShown: true })).status === 400);

    // anulación de la empresa y reemisión
    const rv = await emp.post(`/api/company/certificates/${r2.data.certificate.id}/revoke`, { reason: 'fechas mal' });
    check('la empresa anula', rv.status === 200 && rv.data.certificate.status === 'revoked');
    const anul = (await client().get(`/api/certificates/${r2.data.certificate.code}`)).data.certificate;
    check('anulado se ve como anulado y sin datos', anul.status === 'revoked' && !anul.personName && anul.revokedBy === 'company');
    check('otra empresa no puede anular', (await otra.post(`/api/company/certificates/${id}/revoke`, { reason: 'x' })).status === 404);
    const r3 = await cert(app2.id);
    check('anulado por la empresa: puede reemitir', r3.status === 201);
    await wait(150);
    check('aviso de anulación', mailsTo('leo@test.workuco').some((m) => /Se anuló tu certificado/.test(m.subject)));

    // admin
    check('admin lista', (await admin.get('/api/admin/certificates?q=finca')).data.certificates.length >= 2);
    check('empresa no entra a la lista de admin', (await emp.get('/api/admin/certificates')).status === 401);
    await admin.post(`/api/admin/certificates/${id}/revoke`, { reason: 'denuncia' });
    check('anulado por admin bloquea reemitir', (await cert(app.id)).status === 409);
    check('la persona ve que lo anuló WorkUco', (await client().get(`/api/certificates/${code}`)).data.certificate.revokedBy === 'admin');

    // sobrevive al borrado del aviso
    const code3 = r3.data.certificate.code;
    await emp.del(`/api/company/jobs/${job2.id}`);
    check('sobrevive al borrado del aviso', (await client().get(`/api/certificates/${code3}`)).data.certificate.status === 'valid'
      && (await emp.get('/api/company/certificates')).data.certificates.some((c) => c.code === code3));

    // postulación sin cuenta
    const g = await emp.post('/api/company/applications', { jobId: job.id, name: 'Invitado Sin Cuenta', email: 'invitado@test.workuco', phone: '2622 412412' });
    const gid = (g.data.application || {}).id;
    await emp.patch(`/api/company/applications/${gid}`, { stage: 'contratado' });
    check('postulación sin cuenta → 400', (await cert(gid)).status === 400);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}

async function main() {
  try {
    reglas();
    base();
    await api();
  } catch (e) {
    fail++; console.error('ERROR:', e);
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

module.exports = { fs, os, path, spawn };
main();
