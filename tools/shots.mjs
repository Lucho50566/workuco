// Capturas de Workuco con Chrome headless + CDP.
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
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.loadEventFired') loaded = true;
};
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id; pending.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');

async function evalJs(expression) {
  return send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
}

async function go(url, { width = 1366, height = 900, wait = 1600 } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 800 });
  loaded = false;
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) { if (loaded) break; await sleep(150); }
  await sleep(wait);
}

async function shot(name, { full = false, width = 1366, height = 900 } = {}) {
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
  const file = path.join(OUT, name);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('OK', name);
}

async function login(creds, path = '/api/auth/login') {
  const res = await evalJs(`fetch('${path}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(creds)})}).then(async r=>r.status+' '+await r.text())`);
  console.log('login', res.result.result.value);
}

/* --- público --- */
await go(`${BASE}/`);
await shot('01-home-desktop.png', { full: true, height: 1000 });
await go(`${BASE}/`, { width: 390, height: 844 });
await shot('02-home-mobile.png', { full: true, width: 390 });

await go(`${BASE}/buscar`);
await shot('03-buscar-desktop.png', { full: true });
await go(`${BASE}/buscar?category=Gastronom%C3%ADa`, { width: 390, height: 844 });
await shot('04-buscar-mobile.png', { full: true, width: 390 });

await go(`${BASE}/oferta/jdemo001`);
await shot('05-oferta-desktop.png', { full: true });
await go(`${BASE}/oferta/jdemo001`, { width: 390, height: 844 });
await shot('06-oferta-mobile.png', { full: true, width: 390 });

/* --- empresa demo --- */
await go(`${BASE}/acceder`);
await shot('07-acceso.png');

await go(`${BASE}/acceder`);
await login({ email: 'bodega@demo.workuco', password: 'demo12345' });
await go(`${BASE}/panel`);
await shot('08-panel.png', { full: true });

await go(`${BASE}/publicar`);
await shot('09-publicar.png', { full: true });

/* --- admin --- */
await go(`${BASE}/admin`);
await shot('10-admin-login.png');
await login({ email: 'admin@workuco.com.ar', password: 'workuco2026' }, '/api/admin/login');
await go(`${BASE}/admin`);
await shot('11-admin.png', { full: true });
await evalJs(`document.querySelector('[data-tab="companies"]').click()`);
await sleep(700);
await shot('12-admin-empresas.png', { full: true });

ws.close(); proc.kill(); process.exit(0);
