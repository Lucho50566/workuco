/**
 * Ningún aviso aparece "guardado" sin haberlo guardado (bug: .map(jobCard) pasaba el índice como "guardado").
 * Levanta un servidor de demo y revisa el inicio, Buscar y Wik Works con Chrome/Edge sin ventana (DevTools).
 *   node tools/test-corazones.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = 4651;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-corazones-'));
const BROWSER = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));

let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* cuenta corazones llenos en una página, sin sesión */
async function filledHearts(url) {
  const out = path.join(DATA, `dom-${Date.now()}.html`);
  const p = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--virtual-time-budget=6000', '--dump-dom', url], { stdio: ['ignore', 'pipe', 'ignore'] });
  let html = '';
  p.stdout.on('data', (d) => { html += d; });
  await new Promise((r) => p.on('close', r));
  fs.writeFileSync(out, html);
  const hearts = html.match(/class="(act-btn|fround)[^"]*"[^>]*data-(act|feed)-save=/g) || [];
  return { total: hearts.length, filled: hearts.filter((h) => /is-on/.test(h)).length };
}

const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1' } });
try {
  if (!BROWSER) { console.log('  (sin Chrome/Edge: prueba salteada)'); } else {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) { /* arrancando */ } await wait(150); }
    for (const [name, url] of [['inicio', '/'], ['Buscar', '/buscar'], ['Wik Works', '/flyers']]) {
      const h = await filledHearts(BASE + url);
      check(`${name}: hay corazones y ninguno lleno sin sesión`, h.total > 1 && h.filled === 0, JSON.stringify(h));
    }
  }
} finally {
  server.kill();
  await wait(300);
  fs.rmSync(DATA, { recursive: true, force: true });
}
console.log(`\n${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
