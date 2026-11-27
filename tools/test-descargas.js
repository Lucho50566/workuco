/**
 * Descargas con nombre: un CV llamado con tildes o ñ ("CV Joaquín Muñoz.pdf") se tiene que poder abrir.
 * (bug: el nombre iba crudo en Content-Disposition y Node respondía "Invalid character in header content").
 *   node tools/test-descargas.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4652;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-descargas-'));
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
    return res;
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass } });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) { /* arrancando */ } await wait(150); }
    const pdf = Buffer.from('%PDF-1.4\n% CV de prueba\n%%EOF\n').toString('base64');
    const jo = client();
    await jo.post('/api/auth/register', { role: 'candidate', name: 'Joaquín Muñoz', email: 'joaquin@test.workuco', phone: '2622 440440', password: 'clave12345', acceptTerms: true });
    /* como lo manda un iPhone: la tilde va aparte (NFD), y ese acento suelto no entra en un encabezado HTTP */
    const up = await jo.patch('/api/candidate/profile', { cv: { name: 'CV Joaquín Muñoz.pdf'.normalize('NFD'), data: pdf } });
    check('sube el CV con tildes en el nombre', up.status === 200, String(up.status));
    const me = await (await jo.get('/api/me')).json();
    const id = me.user.candidate.id;
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const r = await admin.get(`/api/cv/c/${id}`);
    const body = Buffer.from(await r.arrayBuffer());
    check('el admin lo abre (200 y es el PDF)', r.status === 200 && body.subarray(0, 5).toString() === '%PDF-', `${r.status} ${body.subarray(0, 80)}`);
    const cd = r.headers.get('content-disposition') || '';
    check('el nombre viaja con tildes (filename*=UTF-8)', /filename\*=UTF-8''CV%20Joaqu%C3%ADn%20Mu%C3%B1oz\.pdf/.test(cd), cd);
    check('y con un nombre de respaldo sin tildes', /filename="CV Joaquin Munoz\.pdf"/.test(cd), cd);
    check('la persona también lo abre', (await jo.get(`/api/cv/c/${id}`)).status === 200);
  } catch (e) { fail++; console.error('ERROR:', e); } finally {
    server.kill(); await wait(300); fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
