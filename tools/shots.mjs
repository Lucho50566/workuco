// Capturas y QA visual de Workuco con Chrome headless + CDP.
// Uso: node tools/shots.mjs [urlBase]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:4251';
const OUT = path.join(process.cwd(), 'shots');
mkdirSync(OUT, { recursive: true });
const PORT = 9700 + Math.floor(Math.random() * 200);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\cdp-shots-${Date.now()}`,
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
let id = 0;
const pending = new Map();
let loaded = false;
const jsErrors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.loadEventFired') loaded = true;
  if (msg.method === 'Runtime.exceptionThrown') {
    jsErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    jsErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id; pending.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}

async function go(url, { width = 1366, height = 900, wait = 1500 } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 800 });
  loaded = false;
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) { if (loaded) break; await sleep(150); }
  await sleep(wait);
}

async function shot(name, { full = false, width = 1366 } = {}) {
  let params = { format: 'png' };
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.result.cssContentSize || m.result.contentSize;
    params = {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.min(cs.width, width), height: Math.min(cs.height, 12000), scale: 1 },
    };
  }
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
  console.log('OK', name);
}

async function login(creds, role = 'company') {
  const body = { ...creds, role };
  const out = await evalJs(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})}).then(async r=>r.status+' '+await r.text())`);
  console.log('login', role, (out || '').slice(0, 80));
}
async function logout() { await evalJs(`fetch('/api/auth/logout',{method:'POST'})`); }

/* --- público --- */
await go(`${BASE}/`);
await shot('01-home-desktop.png', { full: true, width: 1366 });
await go(`${BASE}/`, { width: 390, height: 844 });
await shot('02-home-mobile.png', { full: true, width: 390 });

await go(`${BASE}/buscar`);
await shot('03-buscar-desktop.png', { full: true });
await go(`${BASE}/buscar`, { width: 390, height: 844 });
await shot('04-buscar-mobile.png', { full: true, width: 390 });

await go(`${BASE}/oferta/jdemo001`);
await shot('05-oferta-desktop.png', { full: true });
await go(`${BASE}/oferta/jdemo001`, { width: 390, height: 844 });
await shot('06-oferta-mobile.png', { full: true, width: 390 });

await go(`${BASE}/empresas`);
await shot('07-empresas.png', { full: true });
await go(`${BASE}/empresa/cdemo01bodega`);
await shot('08-empresa-publica.png', { full: true });

await go(`${BASE}/acceder`);
await shot('09-acceso-roles.png', { full: true });
await go(`${BASE}/acceder?rol=empresa&modo=registro`);
await shot('10-acceso-registro.png', { full: true });

/* --- empresa --- */
await go(`${BASE}/acceder?rol=empresa`);
await login({ email: 'bodega@demo.workuco', password: 'demo12345' }, 'company');
await go(`${BASE}/panel`);
await shot('11-panel-resumen.png', { full: true });
await evalJs(`document.querySelector('[data-tab="jobs"]').click()`);
await sleep(400);
await shot('12-panel-ofertas.png', { full: true });
await evalJs(`document.querySelector('[data-tab="applicants"]').click()`);
await sleep(500);
await shot('13-panel-postulantes.png', { full: true });
await evalJs(`document.querySelector('.app-card')?.click()`);
await sleep(500);
await shot('14-ficha-postulante.png');
await evalJs(`document.querySelector('[data-close-drawer]')?.click()`);
await evalJs(`document.querySelector('[data-tab="company"]').click()`);
await sleep(400);
await shot('15-panel-empresa.png', { full: true });
await evalJs(`document.querySelector('[data-tab="ai"]').click()`);
await sleep(400);
await shot('16-panel-ia.png', { full: true });
await go(`${BASE}/panel`, { width: 390, height: 844 });
await shot('16b-panel-mobile.png', { full: true, width: 390 });
await evalJs(`document.querySelector('[data-tab="applicants"]').click()`);
await sleep(500);
await shot('16c-kanban-mobile.png', { full: true, width: 390 });

await go(`${BASE}/publicar`);
await shot('17-wizard-paso1.png', { full: true });
await evalJs(`document.querySelector('#j-title').value='Vendedor/a de mostrador'; document.querySelector('#j-title').dispatchEvent(new Event('input'))`);
await evalJs(`document.querySelector('[data-cat="Comercio"]')?.click(); document.querySelector('[data-loc="Tunuyán"]')?.click(); document.querySelector('[data-mod="Presencial"]')?.click(); document.querySelector('[data-type="Tiempo completo"]')?.click()`);
await evalJs(`document.querySelector('#wizard-next')?.click()`);
await sleep(500);
await shot('18-wizard-paso2.png', { full: true });
await evalJs(`document.querySelector('#j-description').value='Buscamos una persona con buena atención al público para sumarse al equipo de un local céntrico. El puesto combina atención, reposición y cierre de caja en un ambiente de trabajo cercano.'`);
await evalJs(`document.querySelector('[data-template="atencion"]')?.click()`);
await evalJs(`document.querySelector('#wizard-next')?.click()`);
await sleep(400);
await shot('19-wizard-paso3.png', { full: true });
await evalJs(`document.querySelector('#wizard-next')?.click()`);
await sleep(500);
await shot('20-wizard-paso4.png', { full: true });

/* --- persona --- */
await logout();
await go(`${BASE}/acceder?rol=empleado`);
await login({ email: 'martina@demo.workuco', password: 'demo12345' }, 'candidate');
await go(`${BASE}/mi-perfil`);
await shot('21-mi-perfil.png', { full: true });
await evalJs(`document.querySelector('[data-tab="apps"]').click()`);
await sleep(300);
await shot('22-mis-postulaciones.png', { full: true });
await go(`${BASE}/oferta/jdemo003`);
await evalJs(`document.querySelector('#open-apply')?.click()`);
await sleep(400);
await shot('22b-postular-con-perfil.png');
await go(`${BASE}/mi-perfil`, { width: 390, height: 844 });
await shot('23-mi-perfil-mobile.png', { full: true, width: 390 });

/* --- admin --- */
await logout();
await go(`${BASE}/admin`);
console.log('login admin', await evalJs(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@workuco.com.ar',password:'workuco2026'})}).then(r=>r.status)`));
await go(`${BASE}/admin`);
await shot('24-admin.png', { full: true });

if (jsErrors.length) console.log('JS ERRORS:', jsErrors.slice(0, 8));
else console.log('Sin errores de JS');
ws.close(); proc.kill(); process.exit(0);
