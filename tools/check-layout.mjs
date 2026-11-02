// Uso: node tools/check-layout.mjs <url> [390 844] [1366 900]
// Verifica desbordes horizontales y errores de JS en varios anchos.
import { spawn } from 'node:child_process';

const [, , url, ...sizes] = process.argv;
const pairs = (sizes.length ? sizes : ['390', '844', '768', '1024', '1366', '900']).reduce((acc, v, i, arr) => {
  if (i % 2 === 0) acc.push([Number(v), Number(arr[i + 1] || 900)]);
  return acc;
}, []);
const PORT = 9555 + Math.floor(Math.random() * 100);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\cdp-check-${PORT}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
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
const events = [];
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id; pending.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');

for (const [width, height] of pairs) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 800,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 800 });
  await send('Page.navigate', { url });
  events.length = 0;
  for (let i = 0; i < 60; i++) { if (events.includes('Page.loadEventFired')) break; await sleep(200); }
  await sleep(1800);
  const expr = `(() => {
    const vw = window.innerWidth, doc = document.documentElement;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && r.left < vw) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        bad.push((el.tagName + (el.className ? '.' + String(el.className).split(' ').join('.') : '')).slice(0, 70) + ' @' + Math.round(r.right));
      }
    }
    return { vw, scrollWidth: doc.scrollWidth, overflow: bad.slice(0, 8),
      cards: document.querySelectorAll('.job-card').length,
      height: doc.scrollHeight, title: document.title };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify({ width, ...r.result.result.value }, null, 2));
}
if (errors.length) console.log('JS ERRORS:', errors.slice(0, 5));
ws.close(); proc.kill(); process.exit(0);
