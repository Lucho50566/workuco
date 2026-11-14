// Genera los íconos PNG de WorkUco a partir del logo en SVG, con Chrome headless.
// Uso: node tools/make-logo.mjs
// El logo: una línea que es la W de WorkUco, los picos de la cordillera del Valle de Uco y,
// con el punto (cabeza / sol), una persona con los brazos en alto.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const PUB = path.join(ROOT, 'public');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NIGHT = '#0b1612'; const CREAM = '#f5f1e6'; const LIME = '#c8f560';

/* rounded: esquinas redondeadas (favicon / ícono común); sin redondear para "maskable" y Apple (el sistema recorta) */
const svg = ({ rounded, scale, size }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}" style="display:block">
  <rect width="40" height="40" rx="${rounded ? 9 : 0}" fill="${NIGHT}"/>
  <g transform="translate(20 20.5) scale(${scale}) translate(-20 -20.5)">
    <path d="M7 13 13.5 30 20 17.5 26.5 30 33 13" fill="none" stroke="${CREAM}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="20" cy="10.5" r="3.4" fill="${LIME}"/>
  </g>
</svg>`;

const out = [
  { file: 'favicon.png', size: 64, rounded: true, scale: 0.78 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.66 },
  { file: 'icon-192.png', size: 192, rounded: true, scale: 0.7 },
  { file: 'icon-512.png', size: 512, rounded: false, scale: 0.6 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-logo-'));
for (const o of out) {
  const html = path.join(tmp, `${o.size}.html`);
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svg(o)}</body></html>`);
  const dest = path.join(PUB, o.file);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'p')}`,
    '--default-background-color=00000000', `--window-size=${o.size},${o.size}`, `--screenshot=${dest}`, `file:///${html.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  console.log(o.file, fs.statSync(dest).size, 'bytes');
}
/* Imagen general para compartir (WhatsApp, Facebook): 1200×630 */
const share = path.join(tmp, 'og.html');
fs.writeFileSync(share, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@500&display=block">
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(120% 90% at 15% 0%, #1b3229, ${NIGHT} 62%); color: ${CREAM}; font-family: Inter, sans-serif; position: relative; }
  .word { position: absolute; left: 96px; top: 150px; font: 800 150px/1 'Bricolage Grotesque', sans-serif; letter-spacing: -.045em; white-space: nowrap; }
  .word svg { width: 1.036em; height: .888em; vertical-align: baseline; overflow: visible; margin-right: -.03em; }
  .word b { color: ${LIME}; font-weight: inherit; }
  .tag { position: absolute; left: 100px; top: 360px; font-size: 42px; font-weight: 500; color: #e8efe9; }
  .loc { position: absolute; left: 100px; top: 425px; font-size: 30px; color: #a9bcb1; }
  .ridge { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 150px; }
</style></head><body>
  <div class="word"><svg viewBox="4.6 6.6 30.8 26.4"><path d="M7 13 13.5 30 20 17.5 26.5 30 33 13" fill="none" stroke="${CREAM}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="10.5" r="3.4" fill="${LIME}"/></svg>ork<b>Uco</b></div>
  <div class="tag">Empleos y changas en el Valle de Uco</div>
  <div class="loc">San Carlos · Tunuyán · Tupungato</div>
  <svg class="ridge" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 70 L50 40 L90 62 L140 22 L190 58 L240 30 L290 64 L340 34 L400 56 V120 H0Z" fill="#17302a"/><path d="M0 96 L60 76 L120 92 L180 72 L250 94 L320 74 L400 90 V120 H0Z" fill="#12241d"/></svg>
</body></html>`);
const ogDest = path.join(PUB, 'og-default.png');
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'p')}`,
  '--virtual-time-budget=4000', '--window-size=1200,630', `--screenshot=${ogDest}`, `file:///${share.replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('og-default.png', fs.statSync(ogDest).size, 'bytes');
fs.rmSync(tmp, { recursive: true, force: true });
