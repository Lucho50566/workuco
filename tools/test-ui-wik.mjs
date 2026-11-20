// Prueba en Chrome sin ventana del botón flotante de Wik Works en el celular.
// Levanta su propio servidor de demo en un puerto libre (datos temporales).
//   node tools/test-ui-wik.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRV = 4711;
const BASE = `http://127.0.0.1:${SRV}`;
const DATA = path.join(os.tmpdir(), `workuco-wik-${Date.now()}`);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };

const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(SRV), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_MAIL_FAKE: '1', PUBLIC_URL: '' } });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) {} await sleep(150); }
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\cdp-wik-${PORT}-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable');
const size = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 800 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 800 });
const go = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(1500); };
const visible = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || el.hidden) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.5 && r.width > 0 && r.top < innerHeight; })()`);

try {
  await size(390);
  await go('/');
  check('celular: el botón aparece en el inicio', await visible('[data-wik-fab]'));
  check('lleva a Wik Works', await ev(`document.querySelector('[data-wik-fab] a, a[data-wik-fab]')?.getAttribute('href')`) === '/flyers');
  check('la primera vez muestra el nombre', await ev(`!!document.querySelector('[data-wik-fab]')?.classList.contains('is-labeled')`));
  check('no tapa: queda dentro de la pantalla y sin desbordar', await ev('document.documentElement.scrollWidth <= innerWidth + 1'));
  await go('/buscar');
  check('aparece en buscar', await visible('[data-wik-fab]'));
  check('la segunda vez ya no muestra el nombre', !(await ev(`!!document.querySelector('[data-wik-fab]')?.classList.contains('is-labeled')`)));
  await ev('window.scrollTo(0, 0)'); await sleep(200);
  await ev('window.scrollTo(0, 900); window.dispatchEvent(new Event("scroll"))'); await sleep(500);
  check('al bajar la página se esconde', !(await visible('[data-wik-fab]')));
  await ev('window.scrollTo(0, 400); window.dispatchEvent(new Event("scroll"))'); await sleep(500);
  check('al subir vuelve', await visible('[data-wik-fab]'));
  for (const p of ['/flyers', '/publicar', '/acceder', '/panel']) {
    await go(p);
    check(`no aparece en ${p}`, !(await ev(`!!document.querySelector('[data-wik-fab]')`)));
  }
  await size(1440); await go('/');
  check('en la compu no se ve', !(await visible('[data-wik-fab]')));
  await size(390); await go('/');
  await ev(`document.querySelector('[data-wik-hide]').click()`); await sleep(400);
  check('la ✕ lo oculta', !(await ev(`!!document.querySelector('[data-wik-fab]')`)));
  check('…y avisa cómo volver a activarlo', /volver a activar desde el menú/.test(await ev('document.body.innerText')));
  await go('/buscar');
  check('queda oculto al cambiar de página', !(await ev(`!!document.querySelector('[data-wik-fab]')`)));
  check('el menú tiene el interruptor apagado', await ev(`document.querySelector('[data-wik-toggle]')?.getAttribute('aria-pressed')`) === 'false');
  await ev(`document.querySelector('[data-wik-toggle]').click()`); await sleep(300);
  check('el interruptor lo vuelve a prender', await ev(`!!document.querySelector('[data-wik-fab]')`) && await ev(`document.querySelector('[data-wik-toggle]').getAttribute('aria-pressed')`) === 'true');
  await go('/');
  check('prendido sigue prendido', await visible('[data-wik-fab]'));
  check('sin errores de JavaScript', errors.length === 0, errors.join(' | '));
} catch (e) { fail++; console.error('ERROR:', e); } finally {
  ws.close(); proc.kill(); server.kill(); await sleep(300);
  fs.rmSync(DATA, { recursive: true, force: true });
}
console.log(`\n${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
