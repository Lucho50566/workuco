/**
 * Pruebas de interfaz end-to-end con Chrome headless + CDP.
 * Recorre los flujos principales como una persona real.
 *
 *   node tools/test-ui.mjs [urlBase]
 */
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'http://127.0.0.1:4251';
const PORT = 9750 + Math.floor(Math.random() * 100);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
};

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\cdp-uitest-${Date.now()}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page');
      if (t?.webSocketDebuggerUrl) return t.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error('CDP no disponible');
}
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); let loaded = false; const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.loadEventFired') loaded = true;
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const go = async (url, wait = 1400) => {
  loaded = false; await send('Page.navigate', { url });
  for (let i = 0; i < 90; i++) { if (loaded) break; await sleep(150); }
  await sleep(wait);
};
const click = async (sel) => {
  const done = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  if (!done) throw new Error(`No existe ${sel}`);
  await sleep(450);
};
const setVal = async (sel, value) => {
  await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
};
const apiJson = async (path, opts) => evalJs(`fetch(${JSON.stringify(path)},${JSON.stringify(opts || {})}).then(r=>r.json())`);

try {
  console.log('— Público —');
  await go(`${BASE}/`);
  check('home carga ofertas', (await evalJs(`document.querySelectorAll('#featured-jobs .job-card').length`)) === 6);
  check('home muestra empresas', (await evalJs(`document.querySelectorAll('#companies-strip .company-pill').length`)) >= 4);
  check('home tiene buscador y roles', await evalJs(`!!document.querySelector('#home-search') && document.querySelectorAll('.role-btn').length === 2`));

  await go(`${BASE}/buscar`);
  await setVal('#f-q', 'bodega');
  await click('#filters-form button[type="submit"]');
  await sleep(900);
  const found = await evalJs(`document.querySelector('#results').textContent`);
  check('buscador filtra por palabra', /bodega/i.test(found) && /ofertas encontradas/.test(await evalJs(`document.querySelector('#results-count').textContent`)));
  await click('[data-filter="locality"][data-value="San Carlos"]');
  await sleep(800);
  check('filtro por localidad funciona', !/Tunuyán/.test(await evalJs(`document.querySelector('#results').textContent`)));

  await go(`${BASE}/oferta/jdemo001`);
  check('detalle muestra carrusel', (await evalJs(`document.querySelectorAll('.carousel-slide').length`)) >= 2);
  check('detalle muestra botón postular', await evalJs(`!!document.querySelector('#open-apply')`));

  console.log('\n— Persona: registro y perfil —');
  await go(`${BASE}/acceder?rol=empleado&modo=registro`);
  check('formulario de registro de persona', await evalJs(`!document.querySelector('#register-form').hidden && !document.querySelector('#r-locality-wrap').hidden`));
  const mail = `ui-${Date.now()}@test.com`;
  await setVal('#r-name', 'Prueba Interfaz');
  await setVal('#r-email', mail);
  await setVal('#r-phone', '2622111222');
  await setVal('#r-pass', 'clave12345');
  await evalJs(`document.querySelector('#r-terms').checked = true`);
  await setVal('#r-locality', 'Tunuyán');
  await click('#register-submit');
  await sleep(1400);
  check('registro redirige al perfil', (await evalJs(`location.pathname`)) === '/mi-perfil');
  check('perfil muestra el nombre', /Prueba Interfaz/.test(await evalJs(`document.querySelector('#profile-summary').textContent`)));

  await click('[data-tab="profile"]');
  await setVal('#c-headline', 'Atención al público y ventas');
  await click('#profile-save');
  await sleep(900);
  const savedProfile = await apiJson('/api/candidate/profile');
  check('guarda el perfil desde la UI', savedProfile.candidate.headline === 'Atención al público y ventas');

  await go(`${BASE}/oferta/jdemo003`);
  await click('#open-apply');
  check('modal muestra el perfil cargado', await evalJs(`!document.querySelector('#apply-profile').hidden`));
  await setVal('#a-message', 'Me interesa el puesto, tengo disponibilidad.');
  await click('#apply-submit');
  await sleep(1000);
  check('postulación desde la UI', /Postulación enviada/.test(await evalJs(`document.querySelector('#apply-modal').textContent`)));
  const myApps = await apiJson('/api/candidate/applications');
  check('la postulación quedó guardada', myApps.applications.some((a) => a.jobId === 'jdemo003'));

  console.log('\n— Empresa: panel y postulantes —');
  await evalJs(`fetch('/api/auth/logout',{method:'POST'})`);
  await go(`${BASE}/acceder?rol=empresa`);
  await setVal('#l-email', 'bodega@demo.workuco');
  await setVal('#l-pass', 'demo12345');
  await click('#login-submit');
  await sleep(1500);
  check('login de empresa redirige al panel', (await evalJs(`location.pathname`)) === '/panel');
  check('panel muestra KPIs', (await evalJs(`document.querySelector('#kpi-apps').textContent`)) !== '0');

  await click('[data-tab="applicants"]');
  await sleep(500);
  check('kanban tiene 6 columnas', (await evalJs(`document.querySelectorAll('#kanban .kanban-col').length`)) === 6);
  const cards = await evalJs(`document.querySelectorAll('#kanban .app-card').length`);
  check('kanban muestra postulantes', cards > 0, `cards=${cards}`);
  const openedId = await evalJs(`document.querySelector('#kanban .app-card')?.dataset.app`);
  await evalJs(`document.querySelector('#kanban .app-card')?.click()`);
  await sleep(400);
  check('abre la ficha del postulante', await evalJs(`!document.querySelector('#drawer').hidden`));
  check('la ficha muestra acciones de contacto', /WhatsApp/.test(await evalJs(`document.querySelector('#drawer-body').textContent`)));

  await click('[data-set-stage="revisado"]');
  await sleep(700);
  check('cambia etapa desde la ficha', /En revisión/.test(await evalJs(`document.querySelector('#drawer-body').textContent`)));
  await setVal('#notes', 'Nota cargada desde la prueba de interfaz.');
  await sleep(1000);
  const appNow = await apiJson(`/api/company/applications/${openedId}`);
  check('guarda notas desde la ficha', appNow.application.notes.includes('prueba de interfaz'));

  console.log('\n— Empresa: publicar con wizard —');
  await go(`${BASE}/publicar`);
  check('wizard arranca en paso 1', await evalJs(`!document.querySelector('[data-step="1"]').hidden`));
  await setVal('#j-title', 'Cajero/a de prueba UI');
  await click('[data-cat="Comercio"]');
  await click('[data-loc="Tunuyán"]');
  await click('[data-mod="Presencial"]');
  await click('[data-type="Tiempo completo"]');
  await click('#wizard-next');
  await sleep(400);
  check('avanza al paso 2', await evalJs(`!document.querySelector('[data-step="2"]').hidden`));
  await click('[data-template="atencion"]');
  await click('#wizard-next');
  await sleep(300);
  await click('#wizard-next');
  await sleep(400);
  check('llega al paso 4 con preview', await evalJs(`!document.querySelector('[data-step="4"]').hidden && document.querySelector('#job-preview').textContent.includes('Cajero/a de prueba UI')`));
  await click('#job-submit');
  await sleep(1100);
  check('publicación enviada', /Publicación enviada/.test(await evalJs(`document.querySelector('#publish-app').textContent`)));
  const jobsNow = await apiJson('/api/company/jobs');
  check('la oferta queda pendiente', jobsNow.jobs.some((j) => j.title === 'Cajero/a de prueba UI' && j.status === 'pending'));

  if (errors.length) console.log('\nJS ERRORS:', errors.slice(0, 8));
  check('sin errores de JS', errors.length === 0, `${errors.length} errores`);
} finally {
  ws.close(); proc.kill();
}

console.log(`\n${ok} ok · ${fail} fail`);
if (fail) process.exitCode = 1;
