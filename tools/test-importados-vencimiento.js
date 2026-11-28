/**
 * Avisos importados: se borran solos a los N días (14 por defecto) si la empresa no los reclamó, quedan
 * registrados como vencidos, avisan a quienes se postularon; y con 10 o más postulantes sin reclamar
 * aparecen como "gran oportunidad" con un mensaje especial.
 *   node tools/test-importados-vencimiento.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { buildClaimMessagePrompt, defaultClaimMessage } = require('../lib/importer');

const ROOT = path.join(__dirname, '..');
const PORT = 4741;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
const DAY = 86400000;
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function testTexts() {
  console.log('— Textos de gran oportunidad —');
  const info = { name: 'Resto X', jobTitle: 'Mozo', sourceName: 'Canal', applications: 12, claimUrl: 'https://workuco.com.ar/reclamar/abc' };
  const def = defaultClaimMessage(info);
  check('el texto fijo cuenta cuántas personas se postularon', def.includes('12') && /oportunidad/i.test(def) && def.includes(info.claimUrl), def);
  const pr = buildClaimMessagePrompt(info);
  check('la consigna de la IA pide destacar los postulantes sin presionar', /12/.test(pr.system + pr.user) && /oportunidad/i.test(pr.system) && /presion/i.test(pr.system));
  const pocos = defaultClaimMessage({ ...info, applications: 3 });
  check('con pocos postulantes, el mensaje de siempre', !/gran oportunidad/i.test(pocos));
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
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }) };
}

async function testApi() {
  console.log('— Vencimiento y gran oportunidad —');
  const DATA = path.join(os.tmpdir(), `workuco-imp-venc-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '', WORKUCO_IMPORT_AI_FAKE: '1',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  const sql = (fn) => { const db = new DatabaseSync(path.join(DATA, 'workuco.sqlite')); try { return fn(db); } finally { db.close(); } };
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const st = (await admin.get('/api/admin/import')).data.settings || {};
    check('plazo por defecto: 14 días', st.ttlDays === 14, JSON.stringify(st));
    check('plazo de 3 días: 400', (await admin.put('/api/admin/import/settings', { ttlDays: 3 })).status === 400);
    check('plazo de 31 días: 400', (await admin.put('/api/admin/import/settings', { ttlDays: 31 })).status === 400);
    check('plazo de 7 días: ok', (await admin.put('/api/admin/import/settings', { ttlDays: 7 })).data.settings.ttlDays === 7);
    await admin.put('/api/admin/import/settings', { ttlDays: 14 });

    const d0 = (await admin.post('/api/admin/import/parse', { text: 'Se busca mozo en Tunuyán' })).data.drafts[0];
    const mk = async (name, phone) => (await admin.post('/api/admin/import/publish', { draft: { ...d0, companyName: name, contactPhone: phone }, sourceName: 'Canal', sourceText: 'x' })).data;
    const viejo = await mk('Resto Viejo', '2622 505001');
    const reclamado = await mk('Resto Reclamado', '2622 505002');
    const pronto = await mk('Resto Pronto', '2622 505003');
    const nuevo = await mk('Resto Nuevo', '2622 505004');
    const popular = await mk('Resto Popular', '2622 505005');

    /* una persona con cuenta se postula al viejo: tiene que enterarse cuando se borre */
    const persona = client(); await persona.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    check('una persona se postula al aviso viejo', (await persona.post(`/api/jobs/${viejo.job.id}/apply`, { message: 'Me interesa' })).status === 201);
    /* 10 postulaciones al popular */
    for (let i = 0; i < 10; i++) await client().post(`/api/jobs/${popular.job.id}/apply`, { name: `Persona ${i} Prueba`, email: `p${i}@prueba.test`, phone: `2622 44${String(1000 + i)}` });

    const rows0 = (await admin.get('/api/admin/import')).data.companies;
    const tok = (n) => rows0.find((c) => c.name === n).claimUrl.split('/').pop();
    await client().post(`/api/claim/${tok('Resto Reclamado')}/accept`, { email: 'reclamado@prueba.test', password: 'clave12345', acceptTerms: true });

    /* atrasamos las fechas de publicación */
    const back = (jobId, days) => sql((db) => db.prepare('UPDATE jobs SET published_at=?, imported_at=? WHERE id=?').run(Date.now() - days * DAY, Date.now() - days * DAY, jobId));
    back(viejo.job.id, 15); back(reclamado.job.id, 20); back(pronto.job.id, 12.5); back(nuevo.job.id, 3);

    const rows = (await admin.get('/api/admin/import')).data.companies;
    const pr = rows.find((c) => c.name === 'Resto Pronto');
    check('cada empresa muestra cuándo se borra', pr && Math.abs(pr.expiresAt - (Date.now() + 1.5 * DAY)) < 3600000, JSON.stringify(pr && pr.expiresAt));
    const pop = rows.find((c) => c.name === 'Resto Popular');
    check('10 postulantes: gran oportunidad', pop && pop.opportunity === true && pop.applications === 10);
    check('…con su mensaje especial', pop && /10/.test(pop.messageText) && /oportunidad/i.test(pop.messageText), pop && pop.messageText);
    check('…y el WhatsApp lo lleva', pop && decodeURIComponent(pop.waUrl).includes(pop.messageText));
    check('con pocos postulantes no es gran oportunidad', rows.find((c) => c.name === 'Resto Nuevo').opportunity === false);

    const ib = (await admin.get('/api/admin/inbox')).data;
    check('bandeja: se borra pronto', (ib.expiringSoon || []).some((c) => c.name === 'Resto Pronto') && !(ib.expiringSoon || []).some((c) => c.name === 'Resto Nuevo'), JSON.stringify(ib.expiringSoon));
    check('bandeja: gran oportunidad', (ib.opportunities || []).some((c) => c.name === 'Resto Popular'));
    check('la bandeja los cuenta', ib.counts.expiringSoon >= 1 && ib.counts.opportunities >= 1, JSON.stringify(ib.counts));
    check('marcar avisado de la oportunidad', (await admin.post(`/api/admin/import/companies/${pop.id}/notified`, { kind: 'oportunidad' })).status === 200);
    check('…y sale de la bandeja', !((await admin.get('/api/admin/inbox')).data.opportunities || []).some((c) => c.name === 'Resto Popular'));

    const sw = await admin.post('/api/admin/import/sweep');
    check('barrido: borra el vencido', sw.status === 200 && sw.data.deleted === 1, JSON.stringify(sw.data));
    const after = (await admin.get('/api/admin/import')).data;
    const names = after.companies.map((c) => c.name);
    check('el vencido ya no está', !names.includes('Resto Viejo'));
    check('el reclamado no se toca aunque sea viejo', names.includes('Resto Reclamado'));
    check('el de 12 días y medio sigue', names.includes('Resto Pronto'));
    const venc = (after.responses || []).find((r) => r.name === 'Resto Viejo');
    check('queda registrado como vencido', venc && venc.action === 'vencida' && venc.jobs.length === 1, JSON.stringify(venc));
    const aviso = sql((db) => db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_id='udemo01' AND title LIKE '%cerró%'").get().n);
    check('la persona que se postuló recibe el aviso', aviso === 1, String(aviso));
    check('la cuenta de la empresa que no reclamó también se borra', sql((db) => db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id=?').get(viejo.job.companyId).n) === 0);
    /* una importada sin reclamar que se quedó sin avisos por otro lado (se lo cerraron o borraron) */
    sql((db) => { db.prepare('DELETE FROM jobs WHERE id=?').run(nuevo.job.id); db.prepare('UPDATE companies SET created_at=? WHERE id=?').run(Date.now() - 2 * DAY, nuevo.job.companyId); });
    const sw2 = await admin.post('/api/admin/import/sweep');
    check('una importada sin reclamar que se quedó sin avisos se borra', sw2.data.companies === 1 && sql((db) => db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id=?').get(nuevo.job.companyId).n) === 0, JSON.stringify(sw2.data));
    check('la reclamada no se toca', sql((db) => db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id=?').get(reclamado.job.companyId).n) === 1);
    check('las demás importadas con avisos siguen', (await admin.get('/api/admin/import')).data.companies.some((c) => c.name === 'Resto Pronto'));
    check('un segundo barrido no hace nada', (await admin.post('/api/admin/import/sweep')).data.deleted === 0);
    check('sin sesión de admin no se puede barrer', (await client().post('/api/admin/import/sweep')).status === 401);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }
}

(async () => {
  try { testTexts(); } catch (e) { fail++; console.error('ERROR textos:', e); }
  await testApi();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
