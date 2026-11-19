/**
 * Pruebas de lo que miran los analizadores de sitios: encabezados de seguridad (clickjacking, HSTS, referrer),
 * tipografías servidas desde la propia página, datos estructurados de la portada y largo de las meta descripciones.
 *
 *   node tools/test-seguridad-seo.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4662;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-segseo-${Date.now()}`);

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const get = (p, headers = {}) => fetch(BASE + p, { headers, redirect: 'manual' });

async function main() {
  console.log('— Meta descripciones —');
  for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) {
    const m = /<meta name="description" content="([^"]*)">/.exec(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'));
    if (m) check(`${f}: descripción de 160 caracteres o menos`, [...m[1]].length <= 160, `(${[...m[1]].length})`);
  }

  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '' },
  });
  try {
    await waitServer();

    console.log('— Encabezados de seguridad —');
    for (const p of ['/', '/buscar', '/api/meta', '/styles.css', '/no-existe']) {
      const r = await get(p);
      check(`${p}: no se puede meter en otro sitio (X-Frame-Options)`, r.headers.get('x-frame-options') === 'SAMEORIGIN');
      check(`${p}: frame-ancestors 'self'`, /frame-ancestors 'self'/.test(r.headers.get('content-security-policy') || ''));
      check(`${p}: Referrer-Policy`, r.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
      check(`${p}: X-Content-Type-Options`, r.headers.get('x-content-type-options') === 'nosniff');
    }
    check('por http no se manda HSTS (rompería el desarrollo local)', !(await get('/')).headers.get('strict-transport-security'));
    const hs = (await get('/', { 'X-Forwarded-Proto': 'https' })).headers.get('strict-transport-security') || '';
    check('por https se manda HSTS de un año', /max-age=31536000/.test(hs), hs);
    check('HSTS sin includeSubDomains (no sabemos si todos los subdominios tienen https)', !/includeSubDomains/i.test(hs));

    console.log('— Tipografías propias —');
    const home = await (await get('/')).text();
    check('las páginas no cargan Google Fonts', !/fonts\.(googleapis|gstatic)\.com/.test(home));
    check('cargan /fonts/fonts.css y precargan las dos tipografías', /href="\/fonts\/fonts\.css"/.test(home) && /rel="preload" href="\/fonts\/bricolage-grotesque-latin\.woff2" as="font"/.test(home) && /rel="preload" href="\/fonts\/inter-latin\.woff2" as="font"/.test(home));
    const css = await (await get('/fonts/fonts.css')).text();
    check('fonts.css declara Bricolage Grotesque e Inter con font-display: swap', /Bricolage Grotesque/.test(css) && /'Inter'/.test(css) && (css.match(/font-display: swap/g) || []).length === 4);
    for (const f of [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1])) {
      const r = await get(f);
      const buf = Buffer.from(await r.arrayBuffer());
      check(`${f}: existe, es woff2 y se guarda un año`, r.status === 200 && buf.slice(0, 4).toString() === 'wOF2' && /max-age=31536000/.test(r.headers.get('cache-control') || ''));
    }
    check('las licencias de las tipografías están publicadas', (await get('/fonts/OFL-inter.txt')).status === 200 && (await get('/fonts/OFL-bricolage-grotesque.txt')).status === 200);
    check('la animación de inicio sigue en la página', /id="wk-intro"/.test(home));

    console.log('— Datos estructurados —');
    const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const graph = blocks.flatMap((b) => b['@graph'] || [b]);
    const org = graph.find((x) => x['@type'] === 'Organization'); const web = graph.find((x) => x['@type'] === 'WebSite');
    check('la portada tiene la organización WorkUco con logo', !!org && org.name === 'WorkUco' && /\/icon-512\.png$/.test(org.logo), JSON.stringify(org || {}).slice(0, 200));
    check('la organización lista San Carlos, Tunuyán y Tupungato', !!org && org.areaServed.map((c) => c.name).join(',') === 'San Carlos,Tunuyán,Tupungato');
    check('el sitio web tiene el buscador de empleos', !!web && /\/buscar\?q=\{search_term_string\}$/.test(web.potentialAction.target.urlTemplate));
    check('el contacto es el mail de WorkUco', !!org && org.contactPoint && org.contactPoint.email === 'contacto.workuco@gmail.com');
    const buscar = await (await get('/buscar')).text();
    check('las demás páginas no repiten los datos de la portada', !/"@type":"Organization"/.test(buscar));
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
