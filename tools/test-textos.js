/**
 * Textos con tildes, ñ y mayúsculas: buscar "tecnico" tiene que encontrar "Técnico Mecatrónico", y al revés.
 * (bug real: SQLite compara tildes y mayúsculas no ASCII tal cual; "tecnico" o "TÉCNICO" daban 0 resultados).
 *   node tools/test-textos.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4653;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-textos-'));
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const h = {}; if (cookie) h.Cookie = cookie; if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    const t = await res.text(); let data = {}; try { data = JSON.parse(t); } catch (_) { /* html */ }
    return { status: res.status, data };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}
const total = async (c, q) => (await c.get(`/api/jobs?q=${encodeURIComponent(q)}`)).data.total;

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass } });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) { /* arrancando */ } await wait(150); }
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Viñedos Ñandú', email: 'nandu@test.workuco', phone: '2622 450450', password: 'clave12345', acceptTerms: true });
    const j = (await emp.post('/api/company/jobs', { title: 'Técnico Mecatrónico', description: 'Mantenimiento de máquinas en la planta, turno mañana, con ganas de aprender.', locality: 'Tunuyán', category: 'Mantenimiento', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'nandu@test.workuco' })).data.job;
    await admin.patch(`/api/admin/jobs/${j.id}`, { status: 'approved' });
    const pub = client();
    console.log('— Búsqueda de avisos —');
    for (const q of ['Técnico', 'técnico', 'tecnico', 'TECNICO', 'TÉCNICO', 'mecatronico', 'MECATRÓNICO', 'tecnico mecatronico'.split(' ')[0]]) {
      check(`"${q}" encuentra el aviso`, (await total(pub, q)) === 1);
    }
    check('la tilde separada (como la manda un iPhone) también', (await total(pub, 'técnico'.normalize('NFD'))) === 1);
    check('busca por empresa con ñ escrita sin ñ ("nandu")', (await total(pub, 'nandu')) === 1);
    check('busca por empresa con ñ ("Ñandú")', (await total(pub, 'Ñandú')) === 1);
    check('algo que no está no aparece', (await total(pub, 'astronauta')) === 0);
    check('% y _ no son comodines', (await total(pub, '%')) === 0 && (await total(pub, '_')) === 0);
  } catch (e) { fail++; console.error('ERROR:', e); } finally {
    server.kill(); await wait(300); fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
