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
const noOverflow = async (scope = 'main') => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && ![...document.querySelectorAll('${scope} *')].some((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.guia-tabs, .tabs, .flyer-rail, .filter-chips'); })`);
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

/* 5. editores: "Mis servicios" de una persona, panel de empresa y pestaña Guía del admin */
const upload = async (sel, files) => {
  const doc = await send('DOM.getDocument', {});
  const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel });
  await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files });
};
const IMG1 = path.resolve('public/icon-192.png'); const IMG2 = path.resolve('public/og-default.png');
await send('Network.clearBrowserCookies');
await size(390); await go('/');
await post('/api/auth/register', { role: 'candidate', name: 'Tito Gasista', email: `tito${Date.now()}@test.workuco`, phone: '2622 401401', password: 'clave12345', acceptTerms: true });
await go('/mi-perfil?tab=servicios'); await sleep(600);
check('"Mis servicios" abre desde el link', await ev(`!document.querySelector('[data-panel="services"]').hidden`));
await click('[data-place-new]'); await sleep(300);
check('el editor no desborda (390)', await noOverflow());
await setVal('#pe-name', 'Gas Don Tito');
await setVal('#pe-section', 'oficios'); await sleep(100);
check('los rubros dependen de la sección', (await ev(`[...document.querySelectorAll('#pe-category option')].map((o) => o.value)`)).includes('Gasista'));
await setVal('#pe-category', 'Gasista');
await click('[data-pe-loc="Tunuyán"]');
check('"Va a domicilio" aparece en oficios', await ev(`!document.querySelector('#pe-home-wrap').hidden`));
await setVal('#pe-desc', 'Instalaciones y reparaciones de gas, matriculado y con garantía.');
await setVal('#pe-wa', '2622 555123');
await click('[name="pe-mode"][value="horario"]');
await setVal('#pe-h-lun-0-a', '09:00'); await setVal('#pe-h-lun-0-b', '18:00');
await click('[data-pe-copy]');
check('"copiar a días hábiles" copia el lunes al viernes', (await ev(`document.querySelector('#pe-h-vie-0-a').value`)) === '09:00');
await upload('#pe-photos', [IMG1, IMG2]); await sleep(1500);
check('se ven las 2 fotos cargadas', (await ev(`document.querySelectorAll('#pe-photo-list .pe-photo').length`)) === 2);
await shot('editor-390');
await ev(`document.querySelector('#pe-form').requestSubmit()`); await sleep(1500);
check('la ficha queda "En revisión"', /En revisión/.test(await ev(`document.querySelector('#my-places').innerText`)));
const mine = await getJson('/api/my/places');
check('se guardó con 2 fotos y horario', mine.places[0].photos.length === 2 && mine.places[0].hours.days.vie[0][0] === '09:00', JSON.stringify(mine.places[0] && mine.places[0].hours));
const tito = mine.places[0];
const adminSession = async () => { await send('Network.clearBrowserCookies'); await post('/api/admin/login', { email: 'admin@workuco.com.ar', password: 'workuco2026' }); };
await adminSession();
await ev(`fetch('/api/admin/places/${tito.id}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})}).then(r=>r.status)`);
await go('/admin'); await sleep(600);
await click('.tab[data-tab="guide"]'); await sleep(900);
check('el admin ve la pestaña Guía con sus listas', await ev(`!!document.querySelector('#admin-places [data-adm-filter="pending"]') && !!document.querySelector('#admin-places [data-adm-filter="unclaimed"]')`));
await click('[data-adm-new]'); await sleep(300);
await setVal('#pe-name', 'Electricista Juan'); await setVal('#pe-section', 'oficios'); await sleep(100);
await setVal('#pe-category', 'Electricista'); await click('[data-pe-loc="Tunuyán"]');
await setVal('#pe-desc', 'Instalaciones eléctricas domiciliarias y tableros.'); await setVal('#pe-wa', '2622 600700');
check('en oficios aparece la casilla de autorización', await ev(`!document.querySelector('#pe-consent-wrap').hidden`));
await ev(`document.querySelector('#pe-form').requestSubmit()`); await sleep(1000);
check('sin tildarla, pide la autorización', await ev(`!document.querySelector('[data-error="consent"]').hidden`));
await click('#pe-consent');
await ev(`document.querySelector('#pe-form').requestSubmit()`); await sleep(1200);
check('con la autorización se carga y muestra el link de reclamo', /reclamar-ficha/.test(await ev(`document.querySelector('#admin-places').innerText`)));
await click('[data-adm-filter="approved"]'); await sleep(800);
check('la publicada aparece con acciones de destacar y ocultar', await ev(`!!document.querySelector('#admin-places [data-adm-feature]') && !!document.querySelector('#admin-places [data-adm-status="hidden"]')`));
await shot('admin-guia');
await send('Network.clearBrowserCookies');
await post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
await size(1440); await go('/panel#guia'); await sleep(900);
check('la empresa tiene "Guía" en su panel', await ev(`!document.querySelector('[data-panel="guide"]').hidden && !!document.querySelector('#company-places [data-place-new]')`));
await shot('panel-guia');
/* 6. preferencias de la persona */
await send('Network.clearBrowserCookies');
await size(390); await go('/');
await post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
await go('/mi-perfil?tab=preferencias'); await sleep(700);
check('la pestaña Preferencias abre desde el link', await ev(`!document.querySelector('[data-panel="prefs"]').hidden && !!document.querySelector('#prefs-box [data-pref="localities"]')`));
check('"Tus datos" está en Preferencias', await ev(`!!document.querySelector('[data-panel="prefs"] [data-account-data]') && document.querySelectorAll('[data-panel="prefs"] [data-mail-type]').length === 4`));
await click('#prefs-box [data-pref="localities"][data-value="Tunuyán"]'); await sleep(500);
await click('#prefs-box [data-pref="localities"][data-value="Tupungato"]'); await sleep(500);
const me1 = await getJson('/api/me');
check('tocar una localidad la guarda', JSON.stringify(me1.user.candidate.prefs.localities) === '["Tunuyán","Tupungato"]', JSON.stringify(me1.user.candidate.prefs));
check('Preferencias sin desbordes (390)', await noOverflow());
await shot('prefs-390');
await go('/buscar'); await sleep(900);
check('/buscar arranca con "Tus localidades"', await ev(`/Tus localidades/.test((document.querySelector('#chips-locality .filter-chip.is-active') || {}).textContent || '')`));
check('y los avisos son de esas localidades', await ev(`[...document.querySelectorAll('#results .job-card, #results .job-row')].length > 0 && ![...document.querySelectorAll('#results')].some((r) => /San Carlos/.test(r.innerText) && !/Tunuyán|Tupungato/.test(r.innerText))`));
await ev(`document.querySelector('#chips-locality [data-value=""]').click()`); await sleep(800);
check('se puede sacar el filtro', await ev(`(document.querySelector('#chips-locality .filter-chip.is-active') || {}).textContent === 'Toda la zona'`));
await ev(`fetch('/api/account/prefs',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({localities:[]})}).then(r=>r.status)`);
/* 7. celular: tarjetas de avisos y panel de novedades sin cortes */
await send('Network.clearBrowserCookies');
await size(390); await go('/');
await post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
await go('/buscar'); await sleep(900);
check('las tarjetas de avisos no se cortan a 390', await noOverflow('#results'));
check('el corazón de Guardar no tapa la compatibilidad', await ev(`(() => { const row = document.querySelector('#results .job-row'); if (!row) return false; const s = row.querySelector('.save-btn').getBoundingClientRect(); const m = row.querySelector('.match-pill'); if (!m) return true; const r = m.getBoundingClientRect(); return r.right <= s.left || r.bottom <= s.top || r.top >= s.bottom; })()`));
await ev(`(document.querySelector('[data-bell]') || document.querySelector('.bell-btn') || document.querySelector('[aria-label*="otificaciones"]')).click()`); await sleep(500);
check('el panel de novedades entra en la pantalla', await ev(`(() => { const p = document.querySelector('.bell-panel'); if (!p) return false; const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`));
/* 8. soluciones para empresas: interés, permiso de contacto y lista del admin */
await send('Network.clearBrowserCookies');
await post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
await size(1440); await go('/panel#soluciones'); await sleep(1000);
check('la empresa tiene "Soluciones" con los servicios', await ev(`!document.querySelector('[data-panel="solutions"]').hidden && document.querySelectorAll('#sol-list .sol-card').length === 3`));
await ev(`document.querySelector('#sol-list input[value="web"]').click()`); await sleep(200);
check('marcar "Me interesa" se ve marcado', await ev(`document.querySelector('#sol-list input[value="web"]').closest('.sol-card').classList.contains('is-on')`));
check('el permiso de contacto arranca sin marcar', await ev(`document.querySelector('#sol-ok').checked === false`));
await ev(`document.querySelector('#sol-form').requestSubmit()`); await sleep(900);
check('sin el permiso pide marcarlo', await ev(`!document.querySelector('[data-error="marketingOk"]').hidden`));
await setVal('#sol-note', 'Quiero una web para mostrar el menú');
await click('#sol-ok');
await ev(`document.querySelector('#sol-form').requestSubmit()`); await sleep(1000);
check('con el permiso se guarda y dice por qué le van a escribir', /Página web/.test(await ev(`document.querySelector('#sol-state').textContent`)) && !(await ev(`document.querySelector('#sol-off').hidden`)));
await shot('panel-soluciones');
await size(390); await go('/panel#soluciones'); await sleep(1000);
check('Soluciones sin desbordes (390)', await noOverflow());
await adminSession(); await size(1440);
await go('/admin'); await sleep(900);
await click('.tab[data-tab="services"]'); await sleep(900);
check('el admin ve a la empresa interesada con su nota', await ev(`/Página web/.test(document.querySelector('#admin-services').innerText) && /menú/.test(document.querySelector('#admin-services').innerText)`));
await shot('admin-servicios');
/* 9. avisos destacados: la empresa pide, el admin destaca, la gente lo ve marcado */
await send('Network.clearBrowserCookies');
await post('/api/auth/login', { email: 'bodega@demo.workuco', password: 'demo12345' });
await size(1440); await go('/panel#ofertas'); await sleep(1000);
check('cada aviso muestra vistas de la semana', /esta semana/.test(await ev(`document.querySelector('#jobs-cards').innerText`)));
check('ofrece pedir destacado gratis en el lanzamiento', await ev(`!!document.querySelector('#jobs-cards [data-feat-req]') && /Gratis durante el lanzamiento/.test(document.querySelector('#jobs-cards').innerText)`));
const pedido = await ev(`document.querySelector('#jobs-cards [data-feat-req]').dataset.featReq`);
await click('#jobs-cards [data-feat-req]'); await sleep(1000);
check('después de pedirlo dice que está pedido', /Pediste destacarlo/.test(await ev(`document.querySelector('#jobs-cards').innerText`)));
await shot('panel-destacar');
await adminSession(); await size(1440);
await go('/admin'); await sleep(1000);
check('el admin ve el pedido y la comparación de vistas', await ev(`/Pidió destacar/.test(document.querySelector('#admin-jobs').innerText) && !!document.querySelector('#admin-jobs .feat-summary')`));
await setVal(`[data-feature-days="${pedido}"]`, '7'); await sleep(1200);
check('al elegir 7 días queda destacada', /Destacada hasta el/.test(await ev(`document.querySelector('#admin-jobs').innerText`)));
await shot('admin-destacados');
await send('Network.clearBrowserCookies');
await go('/buscar'); await sleep(900);
check('en Buscar el aviso sale arriba con la marca "Destacada"', await ev(`/Destacada/.test((document.querySelector('#results .job-row, #results .job-card') || {}).innerText || '')`));
check('sin errores de JS', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
console.log(`\n${ok} ok · ${fail} fail`);
ws.close(); proc.kill(); process.exit(fail ? 1 : 0);
