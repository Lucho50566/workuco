// Auditoría DOM rápida: node tools/audit.mjs <url> [company|candidate|admin]
import { spawn } from 'node:child_process';

const [, , url, role = 'company'] = process.argv;
const PORT = 9800 + Math.floor(Math.random() * 100);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\cdp-audit-${Date.now()}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const t = list.find((x) => x.type === 'page');
    if (t?.webSocketDebuggerUrl) { ws = new WebSocket(t.webSocketDebuggerUrl); break; }
  } catch (_) {}
  await sleep(300);
}
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); let loaded = false; const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.loadEventFired') loaded = true;
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const go = async (u) => {
  loaded = false; await send('Page.navigate', { url: u });
  for (let i = 0; i < 80; i++) { if (loaded) break; await sleep(150); }
  await sleep(1500);
};
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

const creds = role === 'candidate'
  ? { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' }
  : role === 'admin' ? { email: 'admin@workuco.com.ar', password: 'workuco2026' }
  : { role: 'company', email: 'bodega@demo.workuco', password: 'demo12345' };
await go(url.split('/').slice(0, 3).join('/') + '/');
const loginPath = role === 'admin' ? '/api/admin/login' : '/api/auth/login';
const loginBody = role === 'admin' ? { email: creds.email, password: creds.password } : creds;
console.log('login:', await evaluate(`fetch('${loginPath}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(loginBody)})}).then(r=>r.status)`));
await go(url);

const out = await evaluate(`(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { sel, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, scrollH: el.scrollHeight, display: cs.display, margin: cs.margin, padding: cs.padding, overflow: cs.overflow };
  };
  const sels = (${JSON.stringify(process.env.SELS || '')}).split(',').filter(Boolean);
  const rects = (sels.length ? sels : ['.site-header','#panel-app','.panel-side','.panel-main','.panel-head','.panel-head h1','.kpi-grid','.overview-grid','#recent-apps','.footer']).map(pick);
  const rows = [...document.querySelectorAll('.recent-row')].slice(0,4).map(el => {
    const r = el.getBoundingClientRect(); const main = el.querySelector('.recent-main');
    const small = el.querySelector('.recent-main small');
    return { w: Math.round(r.width), h: Math.round(r.height), mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
      smallW: small ? Math.round(small.getBoundingClientRect().width) : null, smallScrollW: small ? small.scrollWidth : null, text: small?.textContent };
  });
  return { scrollY: window.scrollY, bodyH: document.body.scrollHeight, rects, rows,
    activePanels: [...document.querySelectorAll('[data-panel]')].filter(x=>!x.hidden).map(x=>x.dataset.panel),
    loadingHidden: document.querySelector('#panel-loading')?.hidden, gateHidden: document.querySelector('#panel-gate')?.hidden };
})()`);
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('ERRORS', errors);
ws.close(); proc.kill(); process.exit(0);
