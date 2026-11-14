// Prueba en Chrome headless de la Guía del Valle.
// Requiere un servidor con datos demo frescos y la IA simulada:
//   WORKUCO_DEMO=1 WORKUCO_IMPORT_AI_FAKE=1 WORKUCO_CONTACT_WA="2622 400000" node server.js
//   WK_BASE=http://localhost:4260 node tools/test-ui-guia.mjs [carpeta-para-capturas]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/* sin valor por defecto: así nunca corre por error contra la base real (importa, borra y reclama fichas) */
const BASE = process.env.WK_BASE;
if (!BASE) { console.error('Falta WK_BASE (un servidor con datos demo frescos, p. ej. http://localhost:4260)'); process.exit(2); }
const SHOTS = process.argv[2] || '';
const PORT = 9955 + Math.floor(Math.random() * 40);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\cdp-guia-${PORT}-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
/* además de la página, ningún elemento visible puede salirse a la derecha (body puede ocultar el desborde) */
const noOverflow = async (scope = 'main') => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && ![...document.querySelectorAll('${scope} *')].some((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.guia-tabs, .flyer-rail, .filter-chips'); })`);
const post = (url, body) => ev(`fetch(${JSON.stringify(url)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})}).then(async r=>({status:r.status,data:await r.json().catch(()=>({}))}))`);
const getJson = (url) => ev(`fetch(${JSON.stringify(url)}).then(r=>r.json())`);

/* 1. el admin carga fichas de comercios */
await go('/');
await post('/api/admin/login', { email: 'admin@workuco.com.ar', password: 'workuco2026' });
const base = { localities: ['Tunuyán'], address: 'San Martín 100', description: 'Atención todos los días, con la mejor onda del Valle.' };
const pizza = await post('/api/admin/places', { ...base, name: 'Pizzería 24 Horas', section: 'comida', category: 'Pizzería', whatsapp: '2622 500001', hours: { mode: '24h' } });
const bar = await post('/api/admin/places', { ...base, name: 'Bar Madrugada', section: 'salidas', category: 'Bar', whatsapp: '2622 500002', hours: { mode: 'horario', days: { dom: [['03:00', '03:01']] } } });
const lav = await post('/api/admin/places', { ...base, name: 'Lavadero Uco', section: 'servicios', category: 'Lavadero', whatsapp: '2622 500003', hours: { mode: 'turno' } });
check('el admin carga 3 fichas', [pizza, bar, lav].every((r) => r.status === 201), JSON.stringify([pizza.status, bar.status, lav.status]));

/* 2. /guia en celular y computadora */
for (const w of [320, 390, 1440]) {
  await size(w); await go('/guia'); await sleep(400);
  check(`/guia sin desbordes (${w})`, await noOverflow());
  check(`/guia muestra las fichas (${w})`, (await ev(`document.querySelectorAll('#guia-list .place-card').length`)) >= 3);
  await shot(`guia-${w}`);
}
await size(390); await go('/guia'); await sleep(400);
check('hay pestaña por sección más "Todo"', (await ev(`document.querySelectorAll('#guia-tabs .guia-tab').length`)) === 5);
await ev(`document.querySelector('#guia-tabs [data-section="comida"]').click()`); await sleep(900);
check('la pestaña Comida cambia la dirección', /seccion=comida/.test(await ev('location.search')));
check('y muestra sólo comida', await ev(`[...document.querySelectorAll('#guia-list .place-card')].every((c) => /Pizzería|Restaurante|Rotisería|Parrilla|Delivery|Panadería|Heladería|Café|Otro/.test(c.querySelector('.place-cat').textContent))`));
check('aparecen los rubros de la sección', (await ev(`document.querySelectorAll('#guia-cats [data-cat]').length`)) >= 5);
await ev(`document.querySelector('#guia-tabs [data-section=""]').click()`); await sleep(900);
await ev(`(() => { const c = document.querySelector('#guia-open'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(900);
const abiertas = await ev(`[...document.querySelectorAll('#guia-list .place-name')].map((n) => n.textContent)`);
check('"Abierto ahora" saca al bar cerrado', abiertas.includes('Pizzería 24 Horas') && !abiertas.includes('Bar Madrugada'), JSON.stringify(abiertas));
check('"Abierto ahora" queda en la dirección', /abierto=1/.test(await ev('location.search')));

/* 3. la ficha */
await go(`/guia/${pizza.data.place.slug}`); await sleep(400);
check('la ficha sin desbordes (390)', await noOverflow());
check('la ficha tiene el nombre y el estado', /Pizzería 24 Horas/.test(await ev(`document.querySelector('.ficha-name').textContent`)) && !!(await ev(`!!document.querySelector('.ficha-info .place-open.is-open')`)));
check('en el celular, WhatsApp y Llamar quedan fijos abajo', await ev(`getComputedStyle(document.querySelector('.ficha-sticky')).position === 'fixed'`));
check('dice que la armó WorkUco y cómo reclamarla', /Ficha armada por WorkUco/.test(await ev('document.body.innerText')));
await shot('ficha-390');
await ev(`window.open = () => null; document.querySelector('.ficha-sticky [data-contact="whatsapp"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`);
await sleep(800);
const adm = await getJson('/api/admin/places?status=unclaimed');
const pst = adm.places.find((x) => x.id === pizza.data.place.id).stats;
check('tocar WhatsApp suma un contacto', pst.week.contacts >= 1, JSON.stringify(pst));
await size(1440); await go(`/guia/${pizza.data.place.slug}`); await sleep(400);
check('la ficha sin desbordes (1440)', await noOverflow());
await shot('ficha-1440');

/* 4. portada y reclamo */
await size(390); await go('/'); await sleep(800);
check('la portada tiene las 4 secciones de la guía', (await ev(`document.querySelectorAll('#guia-home-tiles .guia-tile').length`)) === 4);
check('y fichas de muestra', (await ev(`document.querySelectorAll('#guia-home-list .place-card').length`)) >= 1);
check('la banda de la guía no desborda', await noOverflow('#guia-band'));
await send('Network.clearBrowserCookies');
await go(new URL(lav.data.claimUrl).pathname); await sleep(400);
check('la página de reclamo pregunta si es tuya', /¿Esta ficha es tuya\?/.test(await ev('document.body.innerText')));
check('ofrece crear cuenta y borrarla', !!(await ev(`!!document.querySelector('#cp-form') && !!document.querySelector('#cp-delete')`)));
check('reclamo sin desbordes (390)', await noOverflow());
await shot('reclamar-390');

check('sin errores de JS', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
console.log(`\n${ok} ok · ${fail} fail`);
ws.close(); proc.kill(); process.exit(fail ? 1 : 0);
