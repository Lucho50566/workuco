/**
 * Respuesta de las empresas a los avisos importados: motivo obligatorio al borrar, registro de aceptadas y
 * rechazadas, aviso por mail al dueño, bandeja del admin y "marcar avisado".
 *   node tools/test-importados-respuesta.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, IMPORT_REASONS } = require('../lib/store');

const ROOT = path.join(__dirname, '..');
const PORT = 4691;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function testBase() {
  console.log('— Base —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-imp-resp-'));
  const s = new Store(path.join(dir, 'db.sqlite'));
  try {
    check('motivos fijos', IMPORT_REASONS && IMPORT_REASONS.cubierto === 'Ya cubrimos el puesto' && IMPORT_REASONS.no_publicar === 'No queremos publicar en WorkUco'
      && IMPORT_REASONS.datos_mal === 'Los datos están mal' && IMPORT_REASONS.otro === 'Otro');
    const a = s.createUnclaimed({ name: 'Resto Uno', phone: '2622 555001', phoneNorm: '2622555001', nameNorm: 'resto uno' });
    const b = s.createUnclaimed({ name: 'Finca Dos', phone: '2622 555002', phoneNorm: '2622555002', nameNorm: 'finca dos' });
    s.insertJob({ id: 'jx1', companyId: b.id, title: 'Cosechadores', locality: 'Tunuyán', category: 'Agricultura', type: 'Temporal', modality: 'Presencial', description: 'x', status: 'approved' });
    s.markNotified(b.id);
    s.recordImportResponse({ company: s.company(a.id), action: 'aceptada' });
    s.recordImportResponse({ company: s.company(b.id), action: 'rechazada', reason: 'cubierto', comment: 'Ya entraron dos chicos' });
    const list = s.importResponses();
    const rej = list.find((r) => r.action === 'rechazada');
    check('se registran las dos respuestas', list.length === 2, JSON.stringify(list));
    check('la rechazada guarda motivo, comentario, avisos y si se había avisado', rej && rej.reason === 'cubierto' && rej.reasonLabel === 'Ya cubrimos el puesto'
      && rej.comment === 'Ya entraron dos chicos' && rej.jobs[0] === 'Cosechadores' && rej.notified === true && rej.notifiedAt > 0, JSON.stringify(rej));
    check('las más nuevas primero', list[0].createdAt >= list[1].createdAt);
    check('la bandeja del admin las muestra', s.adminInbox().importResponses.length === 2);
    s.setAdminMeta('inbox_seen_at', Date.now() + 1);
    check('vistas, dejan de ser nuevas', s.adminInbox().importResponses.length === 0);
  } finally {
    try { s.db.close(); } catch (_) {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const h = { Origin: BASE };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    let data = {}; try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }) };
}

async function testApi() {
  console.log('— API —');
  const DATA = path.join(os.tmpdir(), `workuco-imp-resp-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_IMPORT_AI_FAKE: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: '', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const parsed = await admin.post('/api/admin/import/parse', { text: 'Se busca mozo para restaurante en Tunuyán. Llamar al 2622 555123' });
    const d0 = (parsed.data.drafts || [])[0];
    check('la IA de prueba arma un borrador', !!d0, JSON.stringify(parsed.data).slice(0, 200));
    const mk = (name, phone) => admin.post('/api/admin/import/publish', { draft: { ...d0, companyName: name, contactPhone: phone }, sourceName: 'Canal', sourceText: 'x' });
    await mk('Resto Acepta', '2622 401001');
    await mk('Finca Rechaza', '2622 401002');
    await mk('Taller Sin Motivo', '2622 401003');
    const rows = (await admin.get('/api/admin/import')).data.companies || [];
    const tok = (name) => ((rows.find((c) => c.name === name) || {}).claimUrl || '').split('/').pop();
    const idOf = (name) => (rows.find((c) => c.name === name) || {}).id;

    const view = await client().get(`/api/claim/${tok('Finca Rechaza')}`);
    check('la página de reclamo trae los motivos', Array.isArray(view.data.reasons) && view.data.reasons.length === 4 && view.data.reasons[0].label === 'Ya cubrimos el puesto', JSON.stringify(view.data.reasons));

    const noReason = await client().post(`/api/claim/${tok('Taller Sin Motivo')}/delete`, {});
    check('borrar sin motivo: 400', noReason.status === 400 && noReason.data.fields && noReason.data.fields.reason, JSON.stringify(noReason.data));
    const fake = await client().post(`/api/claim/${tok('Taller Sin Motivo')}/delete`, { reason: 'inventado' });
    check('motivo inventado: 400', fake.status === 400);
    check('…y la empresa sigue ahí', (await client().get(`/api/claim/${tok('Taller Sin Motivo')}`)).status === 200);

    check('marcar avisado a mano', (await admin.post(`/api/admin/import/companies/${idOf('Finca Rechaza')}/notified`)).status === 200);
    const del = await client().post(`/api/claim/${tok('Finca Rechaza')}/delete`, { reason: 'otro', comment: '<b>Cerramos</b> por vacaciones' });
    check('borrar con motivo', del.status === 200, JSON.stringify(del.data));
    check('la empresa ya no existe', (await client().get(`/api/claim/${tok('Finca Rechaza')}`)).status === 404);

    const owner = client();
    const acc = await owner.post(`/api/claim/${tok('Resto Acepta')}/accept`, { email: 'resto@acepta.test', password: 'clave12345', acceptTerms: true });
    check('aceptar', acc.status === 200, JSON.stringify(acc.data));
    check('el link usado ya no sirve para borrar', (await client().post(`/api/claim/${tok('Resto Acepta')}/delete`, { reason: 'cubierto' })).status === 404);
    check('marcar avisado a una ya reclamada: 404', (await admin.post(`/api/admin/import/companies/${idOf('Resto Acepta')}/notified`)).status === 404);

    const ov = (await admin.get('/api/admin/import')).data;
    const responses = ov.responses || [];
    const rej = responses.find((r) => r.name === 'Finca Rechaza');
    const accR = responses.find((r) => r.name === 'Resto Acepta');
    check('el admin ve las dos respuestas, una por empresa', responses.length === 2, JSON.stringify(responses));
    check('la rechazada con motivo, comentario y que estaba avisada', rej && rej.action === 'rechazada' && rej.reasonLabel === 'Otro' && rej.comment === '<b>Cerramos</b> por vacaciones' && rej.notified === true);
    check('la aceptada con fecha', accR && accR.action === 'aceptada' && accR.createdAt > 0);
    check('la empresa aceptada trae la fecha en que aceptó', ((ov.companies || []).find((c) => c.name === 'Resto Acepta') || {}).claimedAt > 0);

    const ib = (await admin.get('/api/admin/inbox')).data;
    check('la bandeja del admin tiene las respuestas', (ib.importResponses || []).length === 2 && ib.counts.importResponses === 2, JSON.stringify(ib.counts));
    await admin.post('/api/admin/inbox/seen');
    check('vistas, salen de la bandeja', ((await admin.get('/api/admin/inbox')).data.importResponses || []).length === 0);

    await sleep(300);
    const outbox = fs.existsSync(path.join(DATA, 'outbox.jsonl')) ? fs.readFileSync(path.join(DATA, 'outbox.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    const toAdmin = outbox.filter((m) => m.to === ADMIN.email);
    check('mail al dueño por la que aceptó', toAdmin.some((m) => /Resto Acepta/.test(m.subject || '') && /acept/i.test(m.subject || '')), JSON.stringify(toAdmin.map((m) => m.subject)));
    check('mail al dueño por la que borró, con el motivo', toAdmin.some((m) => /Finca Rechaza/.test(m.subject || '') && /Otro/.test(`${m.text || ''}${m.html || ''}`)));
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill(); await sleep(300);
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}

(async () => {
  try { testBase(); } catch (e) { fail++; console.error('ERROR en la base:', e); }
  await testApi();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
