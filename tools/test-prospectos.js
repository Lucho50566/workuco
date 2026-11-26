/**
 * "Empresas para contactar": planilla, mensajes por rubro (con la frase para no recibir más), estados,
 * botones de WhatsApp y Gmail, "se registró" automático y "no contactar".
 *   node tools/test-prospectos.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../lib/prospects');

const ROOT = path.join(__dirname, '..');
const PORT = 4751;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'dueno@prueba.test', pass: 'clave-admin-prueba' };
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CSV = `nombre,rubro,localidad,web,instagram,email,telefono,fuente_url
Bodega Los Andes,Bodega,Tunuyán,https://bodegalosandes.test,@bodegalosandes,info@bodegalosandes.test,2622 411111,https://bodegalosandes.test/contacto
"Hotel Valle, Spa",Hotel,Tunuyán,,,reservas@hotelvalle.test,,https://hotelvalle.test
Ferretería Central,Comercio,Tunuyán,,@ferrecentral,,2622 422222,https://instagram.com/ferrecentral
,Restaurante,Tunuyán,,,,,
Bodega Los Andes,Bodega,Tunuyán,,,,2622 411111,`;

function testLib() {
  console.log('— Planilla y mensajes —');
  const rows = P.parseCsv(CSV);
  check('lee la planilla (con comillas y comas)', rows.length === 5 && rows[1].nombre === 'Hotel Valle, Spa', JSON.stringify(rows[1]));
  const clean = P.normalizeProspect(rows[0]);
  check('normaliza teléfono e Instagram', clean.phoneNorm === '2622411111' && clean.instagram === 'bodegalosandes', JSON.stringify(clean));
  check('sin nombre: no sirve', P.normalizeProspect(rows[3]) === null);
  check('rubro → grupo', P.segmentOf('Bodega') === 'agro' && P.segmentOf('Hotel') === 'turismo' && P.segmentOf('Restaurante') === 'turismo' && P.segmentOf('Ferretería') === 'comercio' && P.segmentOf('Constructora') === 'obra' && P.segmentOf('Estudio contable') === 'otros');
  const m = P.defaultProspectMessage({ name: 'Bodega Los Andes', category: 'Bodega', locality: 'Tunuyán' });
  check('el mensaje nombra a la empresa y va con el link de publicar', m.includes('Bodega Los Andes') && m.includes('workuco.com.ar/publicar'), m);
  check('el mensaje de bodega habla de la temporada', /temporada|cosecha|vendimia/i.test(m));
  check('siempre lleva la frase para no recibir más', /no les escribimos más|no los volvemos a contactar/i.test(m));
  check('es amable y corto', m.length >= 250 && m.length <= 900, String(m.length));
  const pr = P.buildProspectPrompt({ name: 'Hotel Valle', category: 'Hotel', locality: 'Tunuyán' });
  check('la consigna de la IA pide tono respetuoso, profesional y amigable', /respetuoso/i.test(pr.system) && /amigable/i.test(pr.system) && /no inventes/i.test(pr.system));
  const norm = P.normalizeProspectMessage({ mensaje: 'Hola Hotel Valle, entren a https://otro.test' });
  check('el texto de la IA: sin links ajenos, con el de publicar y la frase final', !norm.includes('otro.test') && norm.includes('workuco.com.ar/publicar') && /no los volvemos a contactar|no les escribimos más/i.test(norm), norm);
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
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), put: (p, b) => req(p, { method: 'PUT', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }) };
}

async function testApi() {
  console.log('— Admin —');
  const DATA = path.join(os.tmpdir(), `workuco-prosp-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_IMPORT_AI_FAKE: '1',
      WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
    const admin = client(); await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    check('sin sesión de admin: 401', (await client().get('/api/admin/prospects')).status === 401);
    const imp = await admin.post('/api/admin/prospects/import', { csv: CSV });
    check('importar la planilla: 3 nuevas, 2 salteadas (sin nombre o repetida)', imp.status === 200 && imp.data.added === 3 && imp.data.skipped === 2, JSON.stringify(imp.data));
    check('importarla de nuevo no duplica', (await admin.post('/api/admin/prospects/import', { csv: CSV })).data.added === 0);
    const one = await admin.post('/api/admin/prospects', { name: 'Constructora Sur', category: 'Constructora', locality: 'Tunuyán', phone: '2622 433333' });
    check('cargar una a mano', one.status === 201 && one.data.prospect.name === 'Constructora Sur', JSON.stringify(one.data).slice(0, 200));
    check('sin nombre: 400', (await admin.post('/api/admin/prospects', { name: '' })).status === 400);

    let list = (await admin.get('/api/admin/prospects')).data;
    const bodega = list.prospects.find((p) => p.name === 'Bodega Los Andes');
    const hotel = list.prospects.find((p) => p.name === 'Hotel Valle, Spa');
    check('todas empiezan "para contactar"', list.prospects.every((p) => p.status === 'pendiente') && list.counts.pendiente === 4, JSON.stringify(list.counts));
    check('WhatsApp con el mensaje', /^https:\/\/wa\.me\/5492622411111\?text=/.test(bodega.waUrl) && decodeURIComponent(bodega.waUrl).includes('Bodega Los Andes'));
    check('Gmail con destinatario, asunto y mensaje', new URL(hotel.gmailUrl).searchParams.get('to') === 'reservas@hotelvalle.test' && /WorkUco/.test(new URL(hotel.gmailUrl).searchParams.get('su')));
    check('Gmail desde la cuenta de WorkUco', new URL(hotel.gmailUrl).searchParams.get('authuser') === 'contacto.workuco@gmail.com');
    check('sin teléfono: sin WhatsApp', hotel.waUrl === '');

    const gen = await admin.post(`/api/admin/prospects/${bodega.id}/message`);
    check('la IA escribe un mensaje para la empresa', gen.status === 200 && gen.data.message.includes('Bodega Los Andes') && gen.data.message.includes('workuco.com.ar/publicar'), JSON.stringify(gen.data).slice(0, 200));
    const ed = await admin.put(`/api/admin/prospects/${bodega.id}/message`, { message: 'Hola Bodega, les escribo de WorkUco.' });
    check('editar el mensaje: se agrega el link y la frase final', ed.status === 200 && ed.data.message.includes('workuco.com.ar/publicar') && /volvemos a contactar|escribimos más/i.test(ed.data.message));

    const c1 = await admin.post(`/api/admin/prospects/${bodega.id}/contacted`, { kind: 'contacto' });
    check('marcar contactada', c1.status === 200 && c1.data.prospect.status === 'contactada' && c1.data.prospect.contactedAt > 0);
    const c2 = await admin.post(`/api/admin/prospects/${bodega.id}/contacted`, { kind: 'recordatorio' });
    check('marcar recordatorio', c2.data.prospect.status === 'recordatorio' && c2.data.prospect.remindedAt > 0);
    check('hoy contactaste', (await admin.get('/api/admin/prospects')).data.today >= 2);
    const no = await admin.patch(`/api/admin/prospects/${hotel.id}`, { status: 'no_contactar' });
    check('no contactar', no.data.prospect.status === 'no_contactar' && no.data.prospect.waUrl === '' && no.data.prospect.gmailUrl === '');
    check('no contactar: no se puede marcar contactada', (await admin.post(`/api/admin/prospects/${hotel.id}/contacted`, { kind: 'contacto' })).status === 409);
    check('estado inventado: 400', (await admin.patch(`/api/admin/prospects/${hotel.id}`, { status: 'cualquiera' })).status === 400);

    /* la ferretería se registra sola con su teléfono: pasa a "se registró" */
    await client().post('/api/auth/register', { name: 'Ferretería Central SRL', email: 'ferre@prueba.test', phone: '2622 422222', password: 'clave12345', acceptTerms: true });
    list = (await admin.get('/api/admin/prospects')).data;
    check('si se registra, aparece como "se registró"', list.prospects.find((p) => p.name === 'Ferretería Central').status === 'registrada', JSON.stringify(list.prospects.map((p) => [p.name, p.status])));
    check('borrar', (await admin.del(`/api/admin/prospects/${one.data.prospect.id}`)).status === 200 && !(await admin.get('/api/admin/prospects')).data.prospects.some((p) => p.name === 'Constructora Sur'));
  } catch (e) { fail++; console.error('ERROR:', e); } finally { child.kill(); await sleep(300); fs.rmSync(DATA, { recursive: true, force: true }); }
}

(async () => {
  try { testLib(); } catch (e) { fail++; console.error('ERROR lib:', e); }
  await testApi();
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
