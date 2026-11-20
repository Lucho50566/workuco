/**
 * Mensaje personalizado con IA para avisar a las empresas importadas, e IA del importador más rápida
 * (corte configurable y "pensar poco" en Gemini 3). Sin internet: proveedor e IA falsos.
 *   node tools/test-importados-mensaje.js
 */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ai = require('../lib/ai');
const { defaultClaimMessage, buildClaimMessagePrompt, normalizeClaimMessage } = require('../lib/importer');

const ROOT = path.join(__dirname, '..');
const PORT = 4701;
const MOCK = 4702;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LINK = `https://workuco.com.ar/reclamar/${'a'.repeat(48)}`;

async function testAi() {
  console.log('— IA del importador —');
  const bodies = [];
  let delay = 0;
  const mock = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      bodies.push(JSON.parse(raw || '{}'));
      if (delay) await sleep(delay);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
    });
  });
  await new Promise((r) => mock.listen(MOCK, '127.0.0.1', r));
  try {
    const cfg = (model) => ({ provider: 'gemini', apiKey: 'k', model, baseUrl: `http://127.0.0.1:${MOCK}` });
    await ai.callProvider(cfg('gemini-3.5-flash-lite'), { system: 's', user: 'u', maxTokens: 50 });
    check('Gemini 3: pide pensar poco', bodies[0].generationConfig && bodies[0].generationConfig.thinkingConfig && bodies[0].generationConfig.thinkingConfig.thinkingLevel === 'low', JSON.stringify(bodies[0].generationConfig));
    await ai.callProvider(cfg('gemini-2.5-flash'), { system: 's', user: 'u', maxTokens: 50 });
    check('Gemini 2.5: no manda thinkingLevel', !(bodies[1].generationConfig || {}).thinkingConfig);
    delay = 1000;
    let err = null;
    try { await ai.callProvider(cfg('gemini-3.5-flash-lite'), { system: 's', user: 'u', maxTokens: 50, timeoutMs: 200 }); } catch (e) { err = e; }
    check('el corte de tiempo es configurable', !!err);
    check('modelo de Gemini sugerido actualizado', ai.DEFAULTS.gemini.model === 'gemini-3.5-flash-lite');
  } finally { mock.close(); }
}

function testTexts() {
  console.log('— Textos —');
  const base = { name: 'Parrilla Don Chicho', jobTitle: 'Mozo para el finde', locality: 'Tunuyán', sourceName: 'Empleos Tunuyán', applications: 3, claimUrl: LINK };
  const def = defaultClaimMessage(base);
  check('el texto fijo trae nombre, puesto, postulantes y link', /Parrilla Don Chicho|WorkUco/.test(def) && def.includes('Mozo para el finde') && def.includes('3') && def.includes(LINK));
  const pr = buildClaimMessagePrompt(base);
  check('la consigna pide tono respetuoso, profesional y muy amigable', /respetuoso/i.test(pr.system) && /profesional/i.test(pr.system) && /amigable/i.test(pr.system));
  check('la consigna prohíbe inventar y prometer', /no inventes/i.test(pr.system) && /promet/i.test(pr.system));
  check('la consigna lleva los datos de la empresa', pr.user.includes('Parrilla Don Chicho') && pr.user.includes('Mozo para el finde') && pr.user.includes('Empleos Tunuyán'));
  check('sin link: se agrega', normalizeClaimMessage({ mensaje: 'Hola, ¿cómo están?' }, LINK).endsWith(LINK));
  const other = normalizeClaimMessage({ mensaje: 'Entren a https://otro-sitio.com/x para reclamar.' }, LINK);
  check('link ajeno: se cambia por el real', !other.includes('otro-sitio.com') && other.includes(LINK), other);
  check('acepta texto suelto y lo limpia', normalizeClaimMessage('```\nHola <b>gente</b>\n```', LINK).startsWith('Hola gente'));
  check('largo máximo', normalizeClaimMessage({ mensaje: 'x'.repeat(5000) }, LINK).length <= 900 + LINK.length + 2);
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
function startServer(DATA, env) {
  return spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass, WORKUCO_IMPORT_AI_PROVIDER: '', WORKUCO_IMPORT_AI_KEY: '', ...env },
  });
}
async function up() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) return; } catch (_) {} await sleep(150); } }

async function testApi() {
  console.log('— API con IA (de prueba) —');
  const DATA = path.join(os.tmpdir(), `workuco-imp-msg-${Date.now()}`);
  let child = startServer(DATA, { WORKUCO_IMPORT_AI_FAKE: '1' });
  try {
    await up();
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const d0 = (await admin.post('/api/admin/import/parse', { text: 'Se busca mozo en Tunuyán 2622 555123' })).data.drafts[0];
    await admin.post('/api/admin/import/publish', { draft: { ...d0, companyName: 'Parrilla Don Chicho', contactPhone: '2622 501001' }, sourceName: 'Empleos Tunuyán', sourceText: 'x' });
    const row = ((await admin.get('/api/admin/import')).data.companies || [])[0];
    check('sin sesión de admin: 401', (await client().post(`/api/admin/import/companies/${row.id}/message`)).status === 401);
    check('empresa inexistente: 404', (await admin.post('/api/admin/import/companies/cnoexiste/message')).status === 404);
    const gen = await admin.post(`/api/admin/import/companies/${row.id}/message`);
    check('la IA escribe el mensaje', gen.status === 200 && gen.data.ai === true && gen.data.message.includes('Parrilla Don Chicho') && gen.data.message.includes(row.claimUrl), JSON.stringify(gen.data).slice(0, 300));
    check('…y el WhatsApp lleva ese texto', decodeURIComponent(gen.data.waUrl || '').includes(gen.data.message));
    const listed = ((await admin.get('/api/admin/import')).data.companies || [])[0];
    check('queda guardado en la lista', listed.message === gen.data.message && decodeURIComponent(listed.waUrl).includes(gen.data.message));
    const edited = await admin.put(`/api/admin/import/companies/${row.id}/message`, { message: 'Hola Chicho, <script>x</script> te escribo de WorkUco.' });
    check('guardar una edición sin link: se agrega el link', edited.status === 200 && edited.data.message.includes(row.claimUrl) && edited.data.message.startsWith('Hola Chicho'), JSON.stringify(edited.data));
    check('mensaje vacío: 400', (await admin.put(`/api/admin/import/companies/${row.id}/message`, { message: '  ' })).status === 400);
    const owner = client();
    await owner.post(`/api/claim/${row.claimUrl.split('/').pop()}/accept`, { email: 'parrilla@prueba.test', password: 'clave12345', acceptTerms: true });
    check('empresa ya reclamada: 404', (await admin.post(`/api/admin/import/companies/${row.id}/message`)).status === 404);
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }

  console.log('— API sin IA configurada —');
  const DATA2 = path.join(os.tmpdir(), `workuco-imp-msg2-${Date.now()}`);
  child = startServer(DATA2, {});
  try {
    await up();
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const pub = await admin.post('/api/admin/import/publish', { draft: { title: 'Ayudante de cocina', locality: 'Tunuyán', category: 'Gastronomía', type: 'Tiempo completo', modality: 'Presencial',
      description: 'Buscamos ayudante de cocina para turno noche en restaurante del centro.', companyName: 'Bodegón La Esquina', contactPhone: '2622 502002' }, sourceName: 'Canal' });
    check('se carga un aviso a mano', pub.status === 201, JSON.stringify(pub.data).slice(0, 200));
    const row = ((await admin.get('/api/admin/import')).data.companies || [])[0];
    const gen = await admin.post(`/api/admin/import/companies/${row.id}/message`);
    check('sin IA: texto fijo, sin trabarse', gen.status === 200 && gen.data.ai === false && gen.data.message.includes(row.claimUrl) && !!gen.data.warning, JSON.stringify(gen.data).slice(0, 300));
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA2, { recursive: true, force: true }); }
}

(async () => {
  try { await testAi(); } catch (e) { fail++; console.error('ERROR IA:', e); }
  try { testTexts(); } catch (e) { fail++; console.error('ERROR textos:', e); }
  await testApi();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
