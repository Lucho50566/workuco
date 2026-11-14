/**
 * Pruebas de vistas previas (WhatsApp / Open Graph), Google for Jobs (JobPosting),
 * mapa del sitio, robots y página 404. Levanta un servidor SIN demo (como en producción)
 * y otro CON demo (que no se tiene que indexar).
 *
 *   node tools/test-seo.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const PNG = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public', 'icon-192.png')).toString('base64')}`;

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client(base) {
  let cookie = '';
  async function req(p, { method = 'GET', body, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {}, text, type: res.headers.get('content-type') || '' };
  }
  return { get: (p, o) => req(p, o), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}
function start(port, env) {
  const data = path.join(os.tmpdir(), `workuco-seo-${port}-${Date.now()}`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), WORKUCO_DATA: data, WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass, WORKUCO_DEMO: '', PUBLIC_URL: '', ...env },
  });
  return { child, data, base: `http://127.0.0.1:${port}` };
}
async function waitServer(base) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const ldOf = (html) => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html); return m ? JSON.parse(m[1]) : null; };
const meta = (html, prop) => { const m = new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)">`).exec(html); return m ? m[1] : null; };

async function main() {
  const prod = start(4611, { PUBLIC_URL: 'https://workuco.com.ar' });
  const demo = start(4612, { WORKUCO_DEMO: '1' });
  try {
    await Promise.all([waitServer(prod.base), waitServer(demo.base)]);
    const pub = client(prod.base);

    console.log('— Producción: robots y mapa del sitio —');
    const robots = await pub.get('/robots.txt');
    check('robots permite el sitio y bloquea panel/api', /Allow: \//.test(robots.text) && /Disallow: \/api\//.test(robots.text) && /Disallow: \/panel/.test(robots.text));
    check('robots apunta al mapa del sitio con el dominio público', robots.text.includes('Sitemap: https://workuco.com.ar/sitemap.xml'));

    /* empresa y aviso reales, aprobados por el admin */
    const emp = client(prod.base);
    await emp.post('/api/auth/register', { role: 'company', name: 'Bodega <Prueba> & Cía', email: 'bodega@seo.workuco', phone: '2622 500500', password: 'clave12345', acceptTerms: true });
    const j = await emp.post('/api/company/jobs', {
      title: 'Operario de bodega "turno mañana"', description: 'Buscamos operario para fraccionamiento y limpieza de tanques en la bodega, con ganas de aprender.',
      responsibilities: 'Fraccionar vino\nLimpiar tanques', requirements: 'Secundario completo', locality: 'Tunuyán', category: 'Agricultura',
      type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'bodega@seo.workuco', salaryMin: 900000, salaryMax: 1100000, salaryPeriod: 'mes', flyers: [PNG],
    });
    const id = j.data.job.id;
    const pendiente = await pub.get(`/oferta/${id}`);
    check('aviso sin aprobar: no va a Google', /name="robots" content="noindex"/.test(pendiente.text) && !ldOf(pendiente.text));
    const admin = client(prod.base);
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    await admin.patch(`/api/admin/jobs/${id}`, { status: 'approved' });

    console.log('— Vista previa del aviso (WhatsApp / Open Graph) —');
    const page = await pub.get(`/oferta/${id}`);
    check('el título de la pestaña es el puesto y la empresa', /<title>Operario de bodega &quot;turno mañana&quot; en Bodega &lt;Prueba&gt; &amp; Cía · WorkUco<\/title>/.test(page.text));
    check('og:title con el puesto, la empresa y la localidad', (meta(page.text, 'og:title') || '').includes('Operario de bodega &quot;turno mañana&quot; en Bodega &lt;Prueba&gt; &amp; Cía · Tunuyán'));
    check('og:description con sueldo', /\$/.test(meta(page.text, 'og:description') || ''));
    check('og:image es el flyer, con link absoluto', /^https:\/\/workuco\.com\.ar\/media\/flyer-[^"]+\.png$/.test(meta(page.text, 'og:image') || ''), meta(page.text, 'og:image'));
    check('og:url y canonical apuntan al aviso', meta(page.text, 'og:url') === `https://workuco.com.ar/oferta/${id}` && page.text.includes(`<link rel="canonical" href="https://workuco.com.ar/oferta/${id}">`));
    check('una sola descripción en el head', (page.text.match(/<meta name="description"/g) || []).length === 1);
    check('ningún texto de la empresa rompe el HTML', !page.text.includes('<Prueba>'));

    console.log('— Google for Jobs (JobPosting) —');
    const ld = ldOf(page.text);
    check('hay datos JobPosting', !!ld && ld['@type'] === 'JobPosting');
    check('título, empresa y lugar', ld && ld.title.startsWith('Operario de bodega') && ld.hiringOrganization.name === 'Bodega <Prueba> & Cía' && ld.jobLocation.address.addressLocality === 'Tunuyán' && ld.jobLocation.address.addressCountry === 'AR');
    check('tipo de empleo y fecha', ld && ld.employmentType === 'FULL_TIME' && /^\d{4}-\d{2}-\d{2}$/.test(ld.datePosted) && /T23:59:59-03:00$/.test(ld.validThrough));
    check('sueldo en pesos por mes', ld && ld.baseSalary.currency === 'ARS' && ld.baseSalary.value.minValue === 900000 && ld.baseSalary.value.maxValue === 1100000 && ld.baseSalary.value.unitText === 'MONTH');
    check('la descripción incluye tareas y requisitos', ld && /Fraccionar vino/.test(ld.description) && /Secundario completo/.test(ld.description));
    check('el JSON no puede cerrar la etiqueta <script>', !/<\/script>[\s\S]*Bodega <Prueba>/.test(page.text) && page.text.includes('\\u003cPrueba\\u003e'));

    console.log('— Guía del Valle: vista previa y Google —');
    const fichaBase = { section: 'comida', category: 'Pizzería', localities: ['Tunuyán'], address: 'San Martín 100', description: 'Pizzas a la piedra y empanadas todos los días.', whatsapp: '2622 555123', hours: { mode: '24h' } };
    const pz = await emp.post('/api/my/places', { ...fichaBase, name: 'Pizzería de la Bodega', photos: [PNG] });
    await admin.patch(`/api/admin/places/${pz.data.place.id}`, { status: 'approved' });
    const fp = await pub.get(`/guia/${pz.data.place.slug}`);
    check('la ficha tiene su título', /<title>Pizzería de la Bodega · Pizzería en Tunuyán · WorkUco<\/title>/.test(fp.text));
    check('og:image es la foto, absoluta', /^https:\/\/workuco\.com\.ar\/media\/place-[^"]+\.png$/.test(meta(fp.text, 'og:image') || ''), meta(fp.text, 'og:image'));
    const lb = ldOf(fp.text);
    check('datos para Google: Restaurant con dirección, teléfono y horario', lb && lb['@type'] === 'Restaurant' && lb.address.streetAddress === 'San Martín 100' && lb.address.addressLocality === 'Tunuyán' && lb.telephone === '+542622555123' && lb.openingHoursSpecification.length === 1);
    check('la ficha con dueño no es noindex', !/noindex/.test(fp.text));
    const cargada = await admin.post('/api/admin/places', { ...fichaBase, name: 'Lavadero del Centro', section: 'servicios', category: 'Lavadero', whatsapp: '2622 999000' });
    const fc = await pub.get(`/guia/${cargada.data.place.slug}`);
    check('cargada por el admin sin reclamar: noindex y sin datos para Google', /noindex/.test(fc.text) && !ldOf(fc.text));
    const smg = (await pub.get('/sitemap.xml')).text;
    check('el mapa del sitio lista la ficha con dueño y no la sin reclamar', smg.includes(`/guia/${pz.data.place.slug}<`) && !smg.includes(`/guia/${cargada.data.place.slug}<`) && smg.includes('https://workuco.com.ar/guia<'));

    console.log('— Mapa del sitio —');
    const sm = await pub.get('/sitemap.xml');
    check('es XML', /xml/.test(sm.type) && sm.text.startsWith('<?xml'));
    check('incluye la portada y el aviso aprobado', sm.text.includes('<loc>https://workuco.com.ar/</loc>') && sm.text.includes(`<loc>https://workuco.com.ar/oferta/${id}</loc>`));
    check('incluye la empresa', sm.text.includes(`<loc>https://workuco.com.ar/empresa/${j.data.job.companyId}</loc>`));
    check('no incluye paneles ni perfiles', !/\/panel|\/mi-perfil|\/p\//.test(sm.text));

    console.log('— Otras páginas —');
    const home = await pub.get('/');
    check('la portada tiene vista previa con la imagen general', meta(home.text, 'og:image') === 'https://workuco.com.ar/og-default.png' && !/noindex/.test(home.text));
    check('la imagen general existe', (await pub.get('/og-default.png')).status === 200);
    const empresa = await pub.get(`/empresa/${j.data.job.companyId}`);
    check('la página de empresa tiene su título', /<title>Bodega &lt;Prueba&gt; &amp; Cía · WorkUco<\/title>/.test(empresa.text));
    check('el panel sigue sin indexarse', /noindex/.test((await pub.get('/panel')).text));
    check('el perfil público no se indexa', /noindex/.test((await pub.get('/p/alguien')).text));

    console.log('— 404 —');
    const nf = await pub.get('/no-existe', { headers: { Accept: 'text/html' } });
    check('una página que no existe da 404 con página propia', nf.status === 404 && /Esta página se perdió/.test(nf.text) && /noindex/.test(nf.text));
    const nfJob = await pub.get('/oferta/noexiste123', { headers: { Accept: 'text/html' } });
    check('un aviso que no existe da 404', nfJob.status === 404 && /Esta página se perdió/.test(nfJob.text));
    const nfImg = await pub.get('/falta.png');
    check('un archivo que no existe da 404 en texto plano', nfImg.status === 404 && /text\/plain/.test(nfImg.type));

    console.log('— Modo demo: nada se indexa —');
    const d = client(demo.base);
    check('robots bloquea todo', /Disallow: \/\s*$/.test((await d.get('/robots.txt')).text));
    const dJobs = (await d.get('/api/jobs?limit=3')).data.jobs;
    const dPage = await d.get(`/oferta/${dJobs[0].id}`);
    check('los avisos ficticios no llevan JobPosting y son noindex', !ldOf(dPage.text) && /noindex/.test(dPage.text));
    check('la portada demo es noindex', /noindex/.test((await d.get('/')).text));
    check('el mapa del sitio demo no lista avisos', !/\/oferta\//.test((await d.get('/sitemap.xml')).text));

    console.log('— Sin PUBLIC_URL: el Host del pedido no se puede falsificar —');
    const raw = (host) => new Promise((resolve, reject) => {
      require('http').get({ host: '127.0.0.1', port: 4612, path: '/', headers: { Host: host, Accept: 'text/html' } }, (r) => {
        let b = ''; r.setEncoding('utf8'); r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b));
      }).on('error', reject);
    });
    const evil = await raw('evil.com/phish?x=1');
    check('un Host que no es un dominio no entra a los links', !evil.includes('evil.com') && /og:url" content="http:\/\/localhost\//.test(evil));
    const okHost = await raw('workuco.test:8080');
    check('un Host normal se usa tal cual', okHost.includes('og:url" content="http://workuco.test:8080/'));
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    prod.child.kill(); demo.child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(prod.data, { recursive: true, force: true });
    fs.rmSync(demo.data, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
