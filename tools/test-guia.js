/**
 * Pruebas de punta a punta de la Guía del Valle: fichas de personas y empresas,
 * moderación, búsqueda, contactos, carga del admin, reclamo y borrado.
 *   node tools/test-guia.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4614;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-guia-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const PNG = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public', 'icon-192.png')).toString('base64')}`;

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {}, text };
  }
  return {
    get: (p, o) => req(p, o), post: (p, b = {}) => req(p, { method: 'POST', body: b }),
    put: (p, b) => req(p, { method: 'PUT', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }),
  };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const ficha = (o = {}) => ({
  name: 'Gas Don Tito', section: 'oficios', category: 'Gasista', localities: ['Tunuyán'],
  description: 'Instalaciones y reparaciones de gas, matriculado y con garantía.', whatsapp: '2622 555123',
  address: 'San Martín 100', hours: { mode: '24h' }, ...o,
});
const register = async (c, role, email, extra = {}) => c.post('/api/auth/register', { role, name: `Cuenta ${email.split('@')[0]}`, email, phone: '2622 401401', password: 'clave12345', acceptTerms: true, ...extra });

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1',
      PUBLIC_URL: 'https://workuco.com.ar', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
  });
  try {
    await waitServer();
    const pub = client();
    const admin = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });

    console.log('— Persona publica su oficio —');
    const tito = client();
    await register(tito, 'candidate', 'tito@test.workuco');
    const sinSesion = await pub.post('/api/my/places', ficha());
    check('sin sesión no se puede', sinSesion.status === 401);
    const c1 = await tito.post('/api/my/places', { ...ficha(), photos: [PNG, PNG] });
    check('crea la ficha pendiente', c1.status === 201 && c1.data.place.status === 'pending', JSON.stringify(c1.data).slice(0, 200));
    const id = c1.data.place && c1.data.place.id;
    const slug = c1.data.place && c1.data.place.slug;
    check('guarda las 2 fotos', c1.data.place && c1.data.place.photos.length === 2);
    check('pendiente no aparece en la guía', !(await pub.get('/api/places')).data.places.some((p) => p.id === id));
    check('pendiente: el público no ve el detalle', (await pub.get(`/api/places/${slug}`)).status === 404);
    check('pendiente: su dueño sí', (await tito.get(`/api/places/${slug}`)).status === 200);
    check('datos inválidos: 400 con campos', (await tito.post('/api/my/places', ficha({ category: 'Boliche' }))).data.fields.category !== undefined);
    check('7 fotos: 400', (await tito.post('/api/my/places', { ...ficha({ name: 'Otra Ficha' }), photos: Array(7).fill(PNG) })).status === 400);

    const ap = await admin.patch(`/api/admin/places/${id}`, { status: 'approved' });
    check('el admin aprueba', ap.status === 200 && ap.data.place.status === 'approved');
    const lista = await pub.get('/api/places');
    const enLista = lista.data.places.find((p) => p.id === id);
    check('aprobada aparece en la guía', !!enLista);
    check('el resumen trae portada, rubro y estado', enLista && enLista.cover && enLista.category === 'Gasista' && enLista.open.state === 'always');
    check('al dueño le llega la novedad', JSON.stringify((await tito.get('/api/notifications')).data).includes('Gas Don Tito'));
    const det = await pub.get(`/api/places/${slug}`);
    check('detalle con WhatsApp listo', det.data.place.waUrl === 'https://wa.me/5492622555123');
    check('detalle con link para llegar', /google\.com\/maps\/search/.test(det.data.place.mapsUrl));

    console.log('— Cambios después de aprobada —');
    await tito.put(`/api/my/places/${id}`, { ...ficha(), hours: { mode: 'turno' }, keepPhotos: det.data.place.photos });
    check('cambiar el horario la deja publicada', (await tito.get(`/api/places/${slug}`)).data.place.status === 'approved');
    check('figura en cambios recientes', (await admin.get('/api/admin/places?status=recent')).data.places.some((p) => p.id === id));
    check('conserva las fotos', (await tito.get(`/api/places/${slug}`)).data.place.photos.length === 2);
    await tito.put(`/api/my/places/${id}`, { ...ficha({ name: 'Gas Tito e Hijos' }), keepPhotos: [] });
    const mine = (await tito.get('/api/my/places')).data.places.find((p) => p.id === id);
    check('cambiar el nombre la vuelve a revisión', mine.status === 'pending' && mine.name === 'Gas Tito e Hijos');
    check('sin keepPhotos ni fotos nuevas, quedan 0', mine.photos.length === 0);
    await admin.patch(`/api/admin/places/${id}`, { status: 'approved' });

    console.log('— Límite de fichas —');
    for (let i = 2; i <= 5; i++) await tito.post('/api/my/places', ficha({ name: `Ficha ${i}` }));
    const sexta = await tito.post('/api/my/places', ficha({ name: 'Ficha 6' }));
    check('la sexta ficha: 400', sexta.status === 400 && /5 fichas/.test(sexta.data.error));

    console.log('— Búsqueda —');
    const emp = client();
    await emp.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    const abierta = await emp.post('/api/my/places', ficha({ name: 'Pizzería 24', section: 'comida', category: 'Pizzería', hours: { mode: '24h' }, localities: ['Tunuyán'] }));
    const cerrada = await emp.post('/api/my/places', ficha({ name: 'Pizzería Nunca', section: 'comida', category: 'Pizzería', hours: { mode: 'horario', days: { dom: [['03:00', '03:01']] } }, localities: ['Tunuyán'] }));
    const lejos = await emp.post('/api/my/places', ficha({ name: 'Pizzería Lejos', section: 'comida', category: 'Pizzería', hours: { mode: '24h' }, localities: ['Tupungato'] }));
    check('la empresa también crea fichas', abierta.status === 201 && cerrada.status === 201 && lejos.status === 201);
    for (const r of [abierta, cerrada, lejos]) await admin.patch(`/api/admin/places/${r.data.place.id}`, { status: 'approved' });
    const f = (await pub.get(`/api/places?section=comida&locality=${encodeURIComponent('Tunuyán')}&open=1`)).data.places.map((p) => p.name);
    check('filtra por sección, localidad y abierto ahora', f.includes('Pizzería 24') && !f.includes('Pizzería Nunca') && !f.includes('Pizzería Lejos'), JSON.stringify(f));
    check('la respuesta trae las secciones', (await pub.get('/api/places')).data.sections.comida.label === 'Comida');

    console.log('— Contactos —');
    await pub.post(`/api/places/${id}/contact`, { kind: 'whatsapp' });
    await pub.post(`/api/places/${id}/contact`, { kind: 'whatsapp' });
    const st = (await tito.get('/api/my/places')).data.places.find((p) => p.id === id).stats;
    check('dos toques seguidos cuentan una vez', st.week.contacts === 1, JSON.stringify(st));
    check('tipo de contacto inválido: 400', (await pub.post(`/api/places/${id}/contact`, { kind: 'otro' })).status === 400);

    console.log('— Destacar y ocultar —');
    await admin.patch(`/api/admin/places/${lejos.data.place.id}`, { featuredDays: 7 });
    check('destacada primero', (await pub.get('/api/places?section=comida')).data.places[0].name === 'Pizzería Lejos');
    await admin.patch(`/api/admin/places/${lejos.data.place.id}`, { featuredDays: null });
    await admin.patch(`/api/admin/places/${cerrada.data.place.id}`, { status: 'hidden' });
    check('oculta no aparece', !(await pub.get('/api/places?section=comida')).data.places.some((p) => p.name === 'Pizzería Nunca'));

    console.log('— Carga del admin —');
    const sinAuto = await admin.post('/api/admin/places', ficha({ name: 'Electricista Juan' }));
    check('oficio sin autorización: 400', sinAuto.status === 400 && !!sinAuto.data.fields.consent);
    const conAuto = await admin.post('/api/admin/places', { ...ficha({ name: 'Electricista Juan', category: 'Electricista', whatsapp: '2622 777888' }), consent: true });
    check('oficio con autorización: 201', conAuto.status === 201 && conAuto.data.place.consentBy === ADMIN.email && conAuto.data.place.status === 'approved');
    const lav = await admin.post('/api/admin/places', ficha({ name: 'Lavadero Uco', section: 'servicios', category: 'Lavadero', whatsapp: '2622 333444' }));
    check('comercio sin autorización: 201 sin reclamar, con link', lav.status === 201 && lav.data.place.claimed === false && /\/reclamar-ficha\/[a-f0-9]{48}$/.test(lav.data.claimUrl));
    check('trae el WhatsApp con el mensaje', /^https:\/\/wa\.me\/5492622333444\?text=/.test(lav.data.waUrl));
    check('figura en "sin reclamar"', (await admin.get('/api/admin/places?status=unclaimed')).data.places.some((p) => p.id === lav.data.place.id));
    check('sin sesión de admin no', (await pub.post('/api/admin/places', ficha())).status === 401);
    const token = lav.data.claimUrl.split('/').pop();

    console.log('— Reclamo —');
    check('el link muestra la ficha', (await pub.get(`/api/claim-place/${token}`)).data.place.name === 'Lavadero Uco');
    const nuevo = client();
    const acc = await nuevo.post(`/api/claim-place/${token}/accept`, { role: 'candidate', name: 'Dueño Lavadero', email: 'lavadero@test.workuco', phone: '2622 333444', password: 'clave12345', acceptTerms: true });
    check('reclamar creando cuenta de persona', acc.status === 200, JSON.stringify(acc.data));
    check('la ficha queda en su cuenta', (await nuevo.get('/api/my/places')).data.places.some((p) => p.name === 'Lavadero Uco'));
    check('el link no sirve dos veces', (await pub.get(`/api/claim-place/${token}`)).status === 404);

    const lleno = await admin.post('/api/admin/places', ficha({ name: 'Gomería Tito', section: 'servicios', category: 'Gomería', whatsapp: '2622 111222' }));
    const tok2 = lleno.data.claimUrl.split('/').pop();
    const r5 = await tito.post(`/api/claim-place/${tok2}/accept`, {});
    check('con 5 fichas: 409 y la ficha sigue sin reclamar', r5.status === 409 && /5 fichas/.test(r5.data.error) && (await pub.get(`/api/claim-place/${tok2}`)).status === 200);
    const sinTerm = await client().post(`/api/claim-place/${tok2}/accept`, { role: 'company', name: 'Gomería Tito', email: 'gomeria@test.workuco', phone: '2622 111222', password: 'clave12345' });
    check('crear cuenta sin aceptar términos: 400', sinTerm.status === 400 && !!sinTerm.data.fields.acceptTerms);

    console.log('— Borrar desde el link —');
    const del = await pub.post(`/api/claim-place/${tok2}/delete`, {});
    check('se borra', del.status === 200 && (await pub.get(`/api/claim-place/${tok2}`)).status === 404);
    const otra = await admin.post('/api/admin/places', ficha({ name: 'Gomería Tito', section: 'servicios', category: 'Gomería', whatsapp: '2622 111222' }));
    check('no se puede volver a cargar: 409', otra.status === 409);

    console.log('— Páginas, menú y Google —');
    const html = (p) => pub.get(p, { headers: { Accept: 'text/html' } });
    const meta = (h, prop) => { const m = new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)">`).exec(h); return m ? m[1] : null; };
    const ldOf = (h) => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h); return m ? JSON.parse(m[1]) : null; };
    const g = await html('/guia');
    const nav = (/<nav class="main-nav"[\s\S]*?<\/nav>/.exec(g.text) || [''])[0];
    check('/guia responde', g.status === 200 && /data-page="guide"/.test(g.text));
    check('el menú tiene Guía y no Empresas', nav.includes('href="/guia"') && !nav.includes('href="/empresas"'));
    check('el pie sigue teniendo Empresas', /<footer[\s\S]*href="\/empresas"/.test(g.text));
    const pizza = await nuevo.post('/api/my/places', { ...ficha({ name: 'Pizzería del Lavadero', section: 'comida', category: 'Pizzería' }), photos: [PNG] });
    await admin.patch(`/api/admin/places/${pizza.data.place.id}`, { status: 'approved' });
    const fp = await html(`/guia/${pizza.data.place.slug}`);
    check('la ficha tiene su título', /<title>Pizzería del Lavadero · Pizzería en Tunuyán · WorkUco<\/title>/.test(fp.text));
    check('og:image es la foto, absoluta', /^https:\/\/workuco\.com\.ar\/media\/place-[^"]+\.png$/.test(meta(fp.text, 'og:image') || ''), meta(fp.text, 'og:image'));
    check('en modo demo la ficha no va a Google', /noindex/.test(fp.text) && !ldOf(fp.text));
    const juan = await html(`/guia/${conAuto.data.place.slug}`);
    check('la cargada por el admin se ve igual', juan.status === 200 && /Electricista Juan/.test(juan.text));
    const smap = (await pub.get('/sitemap.xml')).text;
    check('en modo demo el mapa del sitio no lista fichas', !smap.includes('/guia/'));
    check('el mapa del sitio lista /guia', smap.includes('https://workuco.com.ar/guia<'));
    check('una ficha que no existe da 404', (await html('/guia/no-existe-esta')).status === 404);
    const xss = await nuevo.post('/api/my/places', ficha({ name: '<img src=x onerror=alert(1)>', section: 'comida', category: 'Café' }));
    await admin.patch(`/api/admin/places/${xss.data.place.id}`, { status: 'approved' });
    const xp = await html(`/guia/${xss.data.place.slug}`);
    check('un nombre con HTML no rompe la página', xp.status === 200 && !xp.text.includes('<img src=x onerror') && xp.text.includes('&lt;img src=x onerror'));
    check('/reclamar-ficha responde y es noindex', /noindex/.test((await html(`/reclamar-ficha/${'b'.repeat(48)}`)).text));
    check('la portada tiene la banda de la guía', /id="guia-band"/.test((await html('/')).text));

    console.log('— Dueño borra su ficha —');
    check('otro no puede borrarla', (await emp.del(`/api/my/places/${id}`)).status === 404);
    check('el dueño sí', (await tito.del(`/api/my/places/${id}`)).status === 200 && (await pub.get(`/api/places/${slug}`)).status === 404);
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
