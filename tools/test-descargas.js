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

    /* foto de perfil: al cambiarla, la dirección cambia (si no, el navegador mostraba la vieja guardada 24 h) */
    const png = (r, g, b) => { /* PNG 1×1 de un color */
      const zlib = require('zlib');
      const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
      const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
      const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
      const raw = zlib.deflateSync(Buffer.from([0, r, g, b]));
      return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', raw), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
    };
    const ph1 = await (await jo.patch('/api/candidate/profile', { photo: png(255, 0, 0) })).json();
    const url1 = (ph1.candidate || {}).photo;
    const ph2 = await (await jo.patch('/api/candidate/profile', { photo: png(0, 0, 255) })).json();
    const url2 = (ph2.candidate || {}).photo;
    check('cambiar la foto cambia su dirección', !!url1 && !!url2 && url1 !== url2, `${url1} → ${url2}`);
    const f2 = await jo.get(url2);
    const b2 = Buffer.from(await f2.arrayBuffer());
    check('la dirección nueva trae la foto nueva', f2.status === 200 && b2.equals(Buffer.from(png(0, 0, 255).split(',')[1], 'base64')));
    check('la foto no se guarda en servidores intermedios (private)', /private/.test(f2.headers.get('cache-control') || ''), f2.headers.get('cache-control'));
    /* errores: los pensados para la persona conservan su mensaje; los internos no muestran detalles */
    const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' });
    check('formulario roto: 400 con mensaje claro', bad.status === 400 && /JSON inválido/.test(await bad.text()));

    /* postularse con un CV con tildes: el nombre se conserva y se puede abrir */
    const emp = client();
    await emp.post('/api/auth/register', { role: 'company', name: 'Finca Tildes', email: 'tildes@test.workuco', phone: '2622 441441', password: 'clave12345', acceptTerms: true });
    const job = await (await emp.post('/api/company/jobs', { title: 'Peón rural', description: 'Tareas generales de la finca, turno mañana, con ganas de aprender y trabajar.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'tildes@test.workuco' })).json();
    await admin.patch(`/api/admin/jobs/${job.job.id}`, { status: 'approved' });
    const ap = await (await jo.post(`/api/jobs/${job.job.id}/apply`, { message: 'Hola', cv: { name: 'CV Joaquín Muñoz.pdf'.normalize('NFD'), data: pdf } })).json();
    const appId = (ap.application && ap.application.id) || ap.id;
    const apps = await (await emp.get('/api/company/applications')).json();
    const mine = (apps.applications || []).find((a) => a.id === appId) || (apps.applications || [])[0];
    const r2 = await emp.get(`/api/company/cv/${mine && mine.id}`);
    const cd2 = r2.headers.get('content-disposition') || '';
    check('postulación con CV con tildes: abre y conserva "Joaquín Muñoz"', r2.status === 200 && /Joaqu%C3%ADn%20Mu%C3%B1oz/.test(cd2), `${r2.status} ${cd2}`);
  } catch (e) { fail++; console.error('ERROR:', e); } finally {
    server.kill(); await wait(300); fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
