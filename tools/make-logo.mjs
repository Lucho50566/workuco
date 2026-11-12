// Genera los íconos PNG de Workuco a partir del logo en SVG, con Chrome headless.
// Uso: node tools/make-logo.mjs
// El logo: una línea que es la W de Workuco, los picos de la cordillera del Valle de Uco y,
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
fs.rmSync(tmp, { recursive: true, force: true });
