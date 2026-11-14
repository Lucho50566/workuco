/**
 * Pruebas de cumplimiento legal: consentimiento al registrarse, descarga de datos,
 * baja (supresión), leyenda AAIP, datos de terceros en avisos importados,
 * detección de avisos discriminatorios y que /media/ no entregue CV.
 *
 *   node tools/test-legal.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { discriminationHints } = require('../lib/legal');

const ROOT = path.join(__dirname, '..');
const PORT = 4598;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-legal-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
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
    return { status: res.status, data: data || {}, text, headers: res.headers };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}

async function main() {
  console.log('— Reglas de avisos discriminatorios —');
  check('"buena presencia" se marca', discriminationHints('Mozo con buena presencia').length === 1);
  check('una franja de edad se marca', discriminationHints('Edad entre 25 y 35 años').length === 1);
  check('"mayor de 18" (límite legal) no se marca', discriminationHints('Ser mayor de 18 años').length === 0);
  check('"no se aceptan menores de 18" no se marca', discriminationHints('No se aceptan menores de 18').length === 0);
  check('"Mozos y mozas" no se marca', discriminationHints('Mozos y mozas para el salón').length === 0);
  check('"3 años de experiencia" no se marca', discriminationHints('Con 3 años de experiencia').length === 0);
  check('"solo hombres" se marca', discriminationHints('Solo hombres para la cosecha').length === 1);

  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_IMPORT_AI_FAKE: '1',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass,
      WORKUCO_LEGAL_NAME: 'Juan Pérez', WORKUCO_LEGAL_CUIT: '20-12345678-9', WORKUCO_LEGAL_ADDRESS: 'San Martín 100, Tunuyán' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitServer();
    const pub = client();

    console.log('— Pie legal —');
    const home = await pub.get('/');
    check('el pie tiene la leyenda de la AAIP', /AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA/.test(home.text) && /artículo 14, inciso 3/.test(home.text));
    check('el pie identifica al responsable', /Juan Pérez/.test(home.text) && /20-12345678-9/.test(home.text) && /San Martín 100/.test(home.text));
    check('el pie tiene términos, privacidad y botón de baja', /href="\/terminos"/.test(home.text) && /href="\/privacidad"/.test(home.text) && /href="\/baja"/.test(home.text));
    check('existe la página /baja', (await pub.get('/baja')).status === 200);

    console.log('— Consentimiento —');
    const base = { role: 'candidate', name: 'Ana Legal', email: 'ana@legal.workuco', phone: '2622 401402', password: 'clave12345' };
    const sin = await pub.post('/api/auth/register', base);
    check('sin aceptar términos no se crea la cuenta', sin.status === 400 && !!sin.data.fields.acceptTerms);
    const empresaSin = await client().post('/api/auth/register', { ...base, role: 'company', name: 'Empresa Legal', email: 'emp@legal.workuco' });
    check('la empresa también tiene que aceptar', empresaSin.status === 400 && !!empresaSin.data.fields.acceptTerms);
    const ana = client();
    check('aceptando, se crea', (await ana.post('/api/auth/register', { ...base, acceptTerms: true })).status === 201);

    console.log('— Derecho de acceso: descarga —');
    const ex = await ana.get('/api/account/export');
    check('descarga un JSON como archivo', ex.status === 200 && /attachment/.test(ex.headers.get('content-disposition') || ''));
    check('incluye perfil y postulaciones, sin la contraseña', !!ex.data.perfil && Array.isArray(ex.data.postulaciones) && !('password' in ex.data.perfil));
    check('registra cuándo y qué versión aceptó', !!ex.data.perfil.terms_at && !!ex.data.perfil.terms_version);
    check('sin sesión no descarga', (await client().get('/api/account/export')).status === 401);

    console.log('— Supresión: baja —');
    /* se postula a un aviso del Café de la Plaza, para mirar después las notificaciones de esa empresa */
    const cafe = client();
    await cafe.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    const cafeJob = ((await cafe.get('/api/company/jobs')).data.jobs || []).find((j) => j.status === 'approved');
    await ana.post(`/api/jobs/${cafeJob.id}/apply`, { message: 'Hola' });
    const notifs = async () => JSON.stringify((await cafe.get('/api/notifications')).data);
    check('la empresa recibió el aviso con su nombre', (await notifs()).includes('Ana Legal'));
    check('con contraseña equivocada no se borra', (await ana.post('/api/account/delete', { password: 'otra' })).status === 401);
    check('con la contraseña se borra', (await ana.post('/api/account/delete', { password: 'clave12345' })).status === 200);
    check('ya no puede entrar', (await client().post('/api/auth/login', { role: 'candidate', email: base.email, password: base.password })).status === 401);
    check('la empresa ya no tiene su nombre en las notificaciones', !(await notifs()).includes('Ana Legal'));
    const apsCafe = JSON.stringify((await cafe.get('/api/company/applications')).data);
    check('su postulación ya no está en el panel de la empresa', !apsCafe.includes('ana@legal.workuco'));
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    const apps = await admin.get('/api/admin/stats');
    check('el admin sigue funcionando después de la baja', apps.status === 200);

    console.log('— Guía del Valle: baja y descarga —');
    const PNG = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public', 'icon-192.png')).toString('base64')}`;
    const gas = client();
    await gas.post('/api/auth/register', { role: 'candidate', name: 'Gasista Legal', email: 'gas@legal.workuco', phone: '2622 403403', password: 'clave12345', acceptTerms: true });
    const fic = await gas.post('/api/my/places', { name: 'Gas Legal', section: 'oficios', category: 'Gasista', localities: ['Tunuyán'], description: 'Instalaciones de gas matriculado, con garantía.', whatsapp: '2622 403403', photos: [PNG, PNG] });
    await admin.patch(`/api/admin/places/${fic.data.place.id}`, { status: 'approved' });
    const fotos = fic.data.place.photos.map((u) => path.join(DATA, 'uploads', u.split('/').pop()));
    check('las fotos de la ficha están en el disco', fotos.length === 2 && fotos.every((x) => fs.existsSync(x)));
    const exp = await gas.get('/api/account/export');
    check('"Descargar mis datos" incluye las fichas', Array.isArray(exp.data.fichas) && exp.data.fichas[0].name === 'Gas Legal');
    await gas.post('/api/account/delete', { password: 'clave12345' });
    check('al darse de baja, la ficha desaparece', (await pub.get(`/api/places/${fic.data.place.slug}`)).status === 404);
    check('y su página da 404', (await pub.get(`/guia/${fic.data.place.slug}`)).status === 404);
    check('y sus fotos se borran del disco', fotos.every((x) => !fs.existsSync(x)));
    const appJs = (await pub.get('/app.js')).text;
    check('la política de privacidad explica la guía y las fichas con datos públicos', /Guía del Valle/.test(appJs) && /datos públicos/.test(appJs) && /autoriz/.test(appJs));

    console.log('— Avisos importados: datos de terceros —');
    const parsed = await admin.post('/api/admin/import/parse', { text: 'Se busca mozo, llamar al 2622 15-555123', sourceName: 'Canal X' });
    const draft = (parsed.data.drafts || [])[0];
    const imp = await admin.post('/api/admin/import/publish', { draft, sourceName: 'Canal X' });
    const det = await pub.get(`/api/jobs/${imp.data.job.id}`);
    check('sin reclamar, el aviso no muestra teléfono ni mail del anunciante', det.status === 200 && det.data.job.contactPhone === '' && det.data.job.contactEmail === '');

    console.log('— Avisos discriminatorios —');
    const emp = client();
    await emp.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    const pubJob = await emp.post('/api/company/jobs', {
      title: 'Moza para el salón', description: 'Buscamos moza con buena presencia, edad entre 20 y 30 años, para el turno noche del café.',
      locality: 'Tunuyán', category: 'Gastronomía', type: 'Medio tiempo', modality: 'Presencial', contactEmail: 'cafe@demo.workuco',
    });
    check('al publicar, avisa a la empresa', pubJob.status === 201 && (pubJob.data.warnings || []).length >= 2);
    const list = await admin.get('/api/admin/jobs?status=pending');
    const flagged = (list.data.jobs || []).find((j) => j.id === pubJob.data.job.id);
    check('el admin lo ve marcado al revisar', !!flagged && flagged.warnings.length >= 2);

    console.log('— Archivos —');
    check('/media/ no entrega PDF (los CV van con permiso)', (await pub.get('/media/cv-cualquiera.pdf')).status === 404);
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
