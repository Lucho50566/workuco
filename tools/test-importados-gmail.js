/**
 * Avisar por Gmail a las empresas importadas: la IA copia el mail del flyer o del texto sin inventarlo,
 * y el admin tiene el mail con un link de Gmail ya armado (destinatario, asunto y mensaje).
 *   node tools/test-importados-gmail.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildImportPrompt, groundDrafts } = require('../lib/importer');

const ROOT = path.join(__dirname, '..');
const PORT = 4721;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = { localities: ['Tunuyán'], categories: ['Gastronomía'], types: ['Tiempo completo'], modalities: ['Presencial'] };

function testImporter() {
  console.log('— Importador —');
  const { system } = buildImportPrompt(meta);
  check('la consigna pide copiar el mail tal cual', /mail/i.test(system) && /exact|tal cual/i.test(system) && /gmail/i.test(system));
  const base = { title: 'Mozo', imageIndex: -1, warnings: [], contactPhoneNorm: '' };
  const [a] = groundDrafts([{ ...base, contactEmail: 'inventado@gmail.com' }], 'Se busca mozo, mandar CV a resto.uco@gmail.com');
  check('mail que no está en el texto: se marca para revisar', a.checked === 'review' && a.warnings.some((w) => /mail/i.test(w)), JSON.stringify(a.warnings));
  const [b] = groundDrafts([{ ...base, contactEmail: 'resto.uco@gmail.com' }], 'Se busca mozo, mandar CV a Resto.Uco@gmail.com');
  check('mail que sí está: sin aviso', !(b.warnings || []).some((w) => /mail/i.test(w)), JSON.stringify(b.warnings));
  const [c] = groundDrafts([{ ...base, contactEmail: 'x@gmail.com', imageIndex: 0 }], 'texto');
  check('mail leído de un flyer: no se compara con el texto', !(c.warnings || []).length);
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
const gmailParts = (url) => { const u = new URL(url); return { host: u.host, to: u.searchParams.get('to'), su: u.searchParams.get('su'), body: u.searchParams.get('body') }; };

async function testApi() {
  console.log('— Admin —');
  const DATA = path.join(os.tmpdir(), `workuco-imp-gmail-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '', WORKUCO_IMPORT_AI_FAKE: '1',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const d0 = (await admin.post('/api/admin/import/parse', { text: 'Se busca mozo en Tunuyán' })).data.drafts[0];
    await admin.post('/api/admin/import/publish', { draft: { ...d0, companyName: 'Resto Con Mail', contactPhone: '2622 503001', contactEmail: 'Resto.Mail@gmail.com' }, sourceName: 'Canal', sourceText: 'x' });
    await admin.post('/api/admin/import/publish', { draft: { ...d0, companyName: 'Finca Sin Mail', contactPhone: '2622 503002', contactEmail: '' }, sourceName: 'Canal', sourceText: 'x' });
    const rows = (await admin.get('/api/admin/import')).data.companies || [];
    const con = rows.find((c) => c.name === 'Resto Con Mail');
    const sin = rows.find((c) => c.name === 'Finca Sin Mail');
    check('la empresa trae el mail del aviso', con && con.email === 'resto.mail@gmail.com', JSON.stringify(con && con.email));
    const g = con && con.gmailUrl ? gmailParts(con.gmailUrl) : {};
    check('link de Gmail con destinatario y asunto', g.host === 'mail.google.com' && g.to === 'resto.mail@gmail.com' && /WorkUco/.test(g.su || ''), JSON.stringify(g));
    check('…y el mensaje con el link de reclamo', (g.body || '').includes(con.claimUrl));
    check('sin mail: sin link de Gmail', sin && sin.email === '' && sin.gmailUrl === '');
    const gen = await admin.post(`/api/admin/import/companies/${con.id}/message`);
    check('el mensaje de la IA va también al Gmail', gen.data.gmailUrl && gmailParts(gen.data.gmailUrl).body === gen.data.message, JSON.stringify(gen.data).slice(0, 200));
    const ed = await admin.put(`/api/admin/import/companies/${con.id}/message`, { message: 'Hola, les escribimos de WorkUco por su búsqueda.' });
    check('al editar, el Gmail se actualiza', gmailParts(ed.data.gmailUrl).body === ed.data.message);
    const after = ((await admin.get('/api/admin/import')).data.companies || []).find((c) => c.id === con.id);
    check('la lista usa el mensaje guardado en el Gmail', gmailParts(after.gmailUrl).body === ed.data.message);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }
}

(async () => {
  try { testImporter(); } catch (e) { fail++; console.error('ERROR importador:', e); }
  await testApi();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
