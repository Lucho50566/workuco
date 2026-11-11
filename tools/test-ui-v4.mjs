// Prueba en Chrome headless del flujo de avisos importados (v4).
// Requiere un servidor con datos demo frescos y la IA simulada:
//   WORKUCO_DEMO=1 WORKUCO_IMPORT_AI_FAKE=1 WORKUCO_CONTACT_WA="2622 400000" node server.js
//   WK_BASE=http://localhost:4250 node tools/test-ui-v4.mjs [carpeta-para-capturas]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.WK_BASE || 'http://localhost:4250';
const SHOTS = process.argv[2] || '';
const PORT = 9955 + Math.floor(Math.random() * 40);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\cdp-v4-${PORT}-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch (_) { await sleep(250); }
}
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description);
  if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const size = async (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 800 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 800 });
await size(1440);
const go = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(1600); };
const shot = async (name) => {
  if (!SHOTS) return;
  await ev(`(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(s); })()`);
  const h = Math.min(await ev('document.documentElement.scrollHeight'), 9000);
  const w = await ev('innerWidth');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };
const click = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ${sel}'); el.click(); return true; })()`);
const setVal = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const noOverflow = async () => ev('document.documentElement.scrollWidth <= innerWidth + 1');

/* 1. el admin importa */
await go('/');
await ev(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@workuco.com.ar',password:'workuco2026'})}).then(r=>r.status)`);
await go('/admin');
await click('[data-tab="import"]'); await sleep(400);
check('la pestaña Importar está visible', await ev(`!document.querySelector('[data-panel="import"]').hidden`));
await setVal('#imp-source', 'Empleos Tunuyán (WhatsApp)');
await setVal('#imp-text', 'SE BUSCA MOZO para Resto El Álamo, Tunuyán, turno noche. Escribir al 2622 15-555123.\n---\nFinca Las Pircas busca cosechadores de manzana, $30.000 por día. +54 9 2622 444777');
await click('#imp-read'); await sleep(1500);
check('aparecen 2 borradores', (await ev(`document.querySelectorAll('[data-draft]').length`)) === 2);
await shot('admin-borradores');
await click('[data-publish="0"]'); await sleep(1200);
await click('[data-publish="0"]'); await sleep(1500);
check('se publicaron los dos', (await ev(`document.querySelectorAll('[data-draft]').length`)) === 0);
check('la tabla muestra las dos fichas sin avisar', (await ev(`[...document.querySelectorAll('#imp-list tbody tr')].filter(r => /Sin avisar/.test(r.textContent)).length`)) === 2);
check('cada ficha tiene botón de WhatsApp', (await ev(`document.querySelectorAll('#imp-list [data-notify]').length`)) === 2);
await shot('admin-importados');
const list = await ev(`fetch('/api/admin/import').then(r=>r.json())`);
const resto = list.companies.find((c) => c.name === 'Resto El Álamo');
const finca = list.companies.find((c) => c.name === 'Finca Las Pircas');

/* 2. lo que ve la gente */
await send('Network.clearBrowserCookies');
await go(`/oferta/${resto.jobs[0].id}`);
check('el detalle dice de qué canal salió', /Aviso tomado de Empleos Tunuyán/.test(await ev('document.body.innerText')));
check('el detalle ofrece escribir a Workuco por WhatsApp', await ev(`!!document.querySelector('.claim-hint a[href^="https://wa.me/5492622400000"]')`));
await shot('oferta-importada');
await go(`/empresa/${resto.id}`);
check('la ficha avisa que no está reclamada', /Ficha armada por Workuco/.test(await ev('document.body.innerText')));
await go('/buscar');
check('la tarjeta muestra "Tomado de un canal"', /Tomado de un canal/.test(await ev('document.body.innerText')));

/* 3. una empresa borra su ficha */
const tokFinca = finca.claimUrl.split('/').pop();
await go(`/reclamar/${tokFinca}`);
check('la página de reclamo muestra la empresa', /Finca Las Pircas ya está en Workuco/.test(await ev('document.body.innerText')));
await shot('reclamar');
await size(390); await go(`/reclamar/${tokFinca}`);
check('reclamo sin desbordes en el celular', await noOverflow());
await shot('reclamar-movil');
await size(1440); await go(`/reclamar/${tokFinca}`);
await click('[data-claim-open="delete"]'); await sleep(300);
await click('#claim-delete'); await sleep(1000);
check('la empresa borró su ficha', /Listo, la borramos/.test(await ev('document.body.innerText')));

/* 4. otra empresa reclama la suya */
const tokResto = resto.claimUrl.split('/').pop();
await go(`/reclamar/${tokResto}`);
await click('[data-claim-open="mine"]'); await sleep(300);
await setVal('#cl-email', `elalamo${Date.now()}@test.workuco`);
await setVal('#cl-pass', 'clave12345');
await click('#claim-form [type=submit]'); await sleep(2000);
check('reclamar lleva al panel de la empresa', (await ev('location.pathname')) === '/panel');
/* 5. una empresa publica con flyer (si se pasó WK_FLYER con la ruta de una imagen) */
if (process.env.WK_FLYER) {
  await send('Network.clearBrowserCookies');
  await go('/');
  await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cafe@demo.workuco',password:'demo12345'})}).then(r=>r.status)`);
  await go('/publicar');
  await click('[data-tpl="mozo"]'); await sleep(200);
  await click('[data-loc="Tupungato"]'); await click('[data-mod="Presencial"]');
  await click('#wizard-next'); await sleep(300);
  const doc = await send('DOM.getDocument', {});
  const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#flyer-input' });
  await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [process.env.WK_FLYER, process.env.WK_FLYER2 || process.env.WK_FLYER] });
  await sleep(1500);
  check('el wizard muestra los 2 flyers cargados', (await ev(`document.querySelectorAll('#flyer-preview .flyer-thumb').length`)) === 2);
  check('con flyer pide sólo 20 caracteres', /20 caracteres/.test(await ev(`document.querySelector('#desc-hint').textContent`)));
  await shot('wizard-flyer');
  await setVal('#j-description', 'Mozo para el salón, turno noche.');
  await click('#wizard-next'); await sleep(300);
  check('con flyer avanza con una descripción corta', (await ev(`document.querySelector('.wizard-step:not([hidden])').dataset.step`)) === '3');
  await click('#wizard-next'); await sleep(300);
  check('la vista previa usa el flyer', await ev(`!!document.querySelector('.preview-flyer img')`));
  check('en el último paso se ve el botón de enviar', await ev(`(() => { const b = document.querySelector('#job-submit'); return !b.hidden && b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden'; })()`));
  await ev('window.scrollTo(0, 0)'); await sleep(250);
  check('sin scroll, la barra de pasos va arriba de la tarjeta y no tapa el título', await ev(`(() => {
    const bar = document.querySelector('.wizard-top').getBoundingClientRect();
    const card = document.querySelector('.wizard').getBoundingClientRect();
    const head = document.querySelector('.wizard-step:not([hidden]) .wizard-step-head').getBoundingClientRect();
    return Math.abs(bar.top - card.top) < 3 && head.top >= bar.bottom - 1;
  })()`));
  await ev('window.scrollTo(0, 600)'); await sleep(250);
  check('con scroll, la barra se pega debajo del encabezado', await ev(`(() => {
    const bar = document.querySelector('.wizard-top').getBoundingClientRect();
    const header = document.querySelector('.site-header').getBoundingClientRect();
    return Math.abs(bar.top - header.bottom) < 3;
  })()`));
  await click('#job-submit'); await sleep(1200);
  const mine = await ev(`fetch('/api/company/jobs').then(r=>r.json()).then(d=>d.jobs.find(j=>j.flyer))`);
  check('el aviso se guardó con 2 flyers', !!mine && mine.flyers.length === 2 && /^\/media\/flyer-/.test(mine.flyer));
  await send('Network.clearBrowserCookies');
  await go('/');
  await ev(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@workuco.com.ar',password:'workuco2026'})}).then(r=>r.status)`);
  await ev(`fetch('/api/admin/jobs/${mine.id}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})}).then(r=>r.status)`);
  await go(`/oferta/${mine.id}`);
  check('el detalle muestra los 2 flyers en carrusel', (await ev(`document.querySelectorAll('.detail-flyers .flyer-slide').length`)) === 2);
  check('los flyers del detalle se ven completos', await ev(`[...document.querySelectorAll('.detail-flyers img')].every((i) => getComputedStyle(i).objectFit === 'contain')`));
  await shot('oferta-flyer');
  await go('/buscar?q=mozo');
  check('la búsqueda muestra el aviso', /Mozo/.test(await ev('document.body.innerText')));
  await go('/');
  check('la tarjeta muestra el flyer completo y +1', await ev(`(() => { const i = document.querySelector('.job-cover-flyer img'); const m = document.querySelector('.job-cover-flyer .flyer-more'); return !!i && getComputedStyle(i).objectFit === 'contain' && !!m && m.textContent.trim() === '+1'; })()`));
  await go('/');
  await shot('home-flyer');
}
/* 6. modo flyers */
{
  await send('Network.clearBrowserCookies');
  const current = `(() => { const f = document.querySelector('#feed'); const top = f.getBoundingClientRect().top;
    const s = [...f.querySelectorAll('.fslide[data-job]')].find((x) => Math.abs(x.getBoundingClientRect().top - top) < 5); return s ? s.dataset.job : ''; })()`;
  for (const w of [390, 1440]) {
    await size(w); await go('/flyers'); await sleep(600);
    check(`modo flyers sin desbordes (${w})`, await noOverflow());
    check(`la primera diapositiva tiene flyer (${w})`, await ev(`!!document.querySelector('.fslide[data-job] .flyer-frame')`));
    if (w === 1440) check('en la computadora el feed tiene ancho de celular', (await ev(`document.querySelector('#feed').getBoundingClientRect().width`)) <= 461);
    await shot(`flyers-${w}`);
  }
  await size(390); await go('/flyers'); await sleep(600);
  const first = await ev(current);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`); await sleep(900);
  const second = await ev(current);
  check('la flecha ↓ pasa al aviso siguiente', !!first && !!second && first !== second, `${first} → ${second}`);
  await ev(`document.querySelector('.fslide[data-job="${second}"] .fact-main').click()`); await sleep(1200);
  check('"Me interesa" lleva al aviso completo', (await ev('location.pathname')) === `/oferta/${second}`);
  await go('/flyers'); await sleep(600);
  await ev(`document.querySelector('[data-feed-save]').click()`); await sleep(800);
  check('Guardar sin sesión lleva a ingresar', (await ev('location.pathname')) === '/acceder');
  await go('/flyers'); await sleep(600);
  await ev(`document.querySelector('[data-feed-filter="Tupungato"]').click()`); await sleep(1200);
  check('el filtro Tupungato muestra sólo Tupungato', await ev(`(() => { const s = [...document.querySelectorAll('.fslide[data-job]')]; return s.length > 0 && s.every((x) => x.dataset.locality === 'Tupungato'); })()`));
  if (process.env.WK_FLYER2) {
    check('un flyer muy alto se ve entero dentro de la diapositiva', await ev(`(() => {
      const imgs = [...document.querySelectorAll('.fslide .flyer-frame img')];
      return imgs.length > 0 && imgs.every((i) => { const f = i.closest('.flyer-frame').getBoundingClientRect(); const r = i.getBoundingClientRect(); return getComputedStyle(i).objectFit === 'contain' && r.width <= f.width + 1 && r.height <= f.height + 1; });
    })()`));
  }
  await shot('flyers-tupungato');
}
check('sin errores de JS', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
console.log(`\n${ok} ok · ${fail} fail`);
ws.close(); proc.kill(); process.exit(fail ? 1 : 0);
