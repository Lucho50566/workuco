/**
 * Pruebas de "instalar como app" (PWA): manifiesto en todas las páginas, service worker,
 * página sin conexión, botones discretos de instalar y el script del cartel.
 *
 *   node tools/test-pwa.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PORT = 4611;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-pwa-${Date.now()}`);

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

async function main() {
  console.log('— Archivos —');
  const pwa = fs.readFileSync(path.join(ROOT, 'public/pwa.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  check('pwa.js es JavaScript válido', (() => { try { new vm.Script(pwa); return true; } catch (_) { return false; } })());
  check('sw.js es JavaScript válido', (() => { try { new vm.Script(sw); return true; } catch (_) { return false; } })());
  check('el cartel tiene los botones "Instalar" y "Seguir desde la Web"', /Instalar<\/button>/.test(pwa) && /Seguir desde la Web<\/button>/.test(pwa));
  check('el cartel no aparece abierto como app', /display-mode: standalone/.test(pwa) && /navigator\.standalone/.test(pwa));
  check('"Seguir desde la Web" lo frena por 7 días', /LATER_DAYS = 7/.test(pwa));
  check('hay ayuda para iPhone (Agregar a inicio)', /Agregar a inicio/.test(pwa));
  check('hay ayuda para abrir desde Instagram/Facebook', /Instagram/.test(pwa) && /Abrir en/.test(pwa));
  check('el service worker no guarda páginas viejas (sólo la de sin conexión)', /mode !== 'navigate'/.test(sw) && !/cache\.put/.test(sw));
  check('si tocan "Instalar" antes de tiempo, espera hasta 2 s el aviso del navegador', /waitPrompt\(2000\)/.test(pwa) && /waiters\.splice\(0\)\.forEach/.test(pwa));
  check('desde Instagram/Facebook en Android abre la página en Chrome', /package=com\.android\.chrome/.test(pwa) && /inApp && isAndroid && !fromIntent/.test(pwa));
  check('el salto a Chrome tiene vuelta segura (sin Chrome sigue en la misma página)', /S\.browser_fallback_url=/.test(pwa));
  check('al llegar desde ese salto el cartel sale enseguida y se limpia la dirección', /fromIntent && !standalone\(\)/.test(pwa) && /params\.delete\('instalar'\)/.test(pwa));
  check('el service worker sólo borra sus propias cachés', /startsWith\('wk-offline-'\)/.test(sw));
  check('con el almacenamiento bloqueado no se rompe (se toma dentro del try)', /try \{ return area\(session\)/.test(pwa) && !/sessionStorage\)/.test(pwa.replace('window.sessionStorage', '')));

  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitServer();

    console.log('— Manifiesto —');
    const mr = await fetch(`${BASE}/manifest.webmanifest`);
    const m = await mr.json();
    check('se sirve como manifest', /application\/manifest\+json/.test(mr.headers.get('content-type') || ''));
    check('es instalable: nombre, inicio, standalone', m.name && m.short_name && m.start_url === '/' && m.scope === '/' && m.display === 'standalone' && m.id === '/');
    check('tiene íconos de 192 y 512', ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s)));
    for (const ic of m.icons) check(`el ícono ${ic.src} existe`, (await fetch(BASE + ic.src)).status === 200);
    check('los colores son los de la marca', m.theme_color === '#0b1612' && m.background_color === '#f5f1e6');

    console.log('— Service worker y sin conexión —');
    const swr = await fetch(`${BASE}/sw.js`);
    check('/sw.js se sirve en la raíz como JavaScript', swr.status === 200 && /javascript/.test(swr.headers.get('content-type') || ''));
    check('/sw.js no queda guardado en caché viejo', /no-cache/.test(swr.headers.get('cache-control') || ''));
    const off = await fetch(`${BASE}/offline.html`);
    check('existe la página sin conexión', off.status === 200 && /Sin conexión/.test(await off.text()));

    console.log('— Páginas —');
    for (const p of ['/', '/buscar', '/changas', '/guia', '/panel', '/mi-perfil', '/acceder', '/contacto']) {
      const html = await (await fetch(BASE + p)).text();
      const links = (html.match(/rel="manifest"/g) || []).length;
      check(`${p}: un solo manifiesto`, links === 1, `(${links})`);
      check(`${p}: carga pwa.js`, /<script src="\/pwa\.js(\?v=[a-f0-9]+)?" defer><\/script>/.test(html));
      check(`${p}: botón de instalar en la cabecera, el menú y el pie (ocultos hasta saber si se puede)`,
        /class="app-install"[^>]*data-app-install hidden/.test(html) && /class="mobile-install"[^>]*data-app-install hidden/.test(html) && /class="footer-install"[^>]*data-app-install hidden/.test(html));
    }
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
