/**
 * Genera los logos de demostración (SVG) de las empresas ficticias.
 *   node tools/make-demo-logos.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const brands = [
  ['logo-bodega', 'AU', '#6b2f3a', '#8c4552'],
  ['logo-finca', 'LN', '#3f6b45', '#54875a'],
  ['logo-cafe', 'CP', '#8a5a3f', '#a87350'],
  ['logo-posada', 'PV', '#2f5d5a', '#3f7a75'],
  ['logo-obra', 'AS', '#4a5568', '#5f6b80'],
  ['logo-estudio', 'EV', '#334e68', '#456580'],
  ['logo-tienda', 'TU', '#6b7f3a', '#86994f'],
];

const out = path.join(__dirname, '..', 'public', 'demo');
fs.mkdirSync(out, { recursive: true });
for (const [name, initials, c1, c2] of brands) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Logo ${initials}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="58" fill="url(#g)"/>
  <circle cx="198" cy="58" r="70" fill="#ffffff" opacity=".07"/>
  <circle cx="52" cy="206" r="52" fill="#ffffff" opacity=".06"/>
  <text x="128" y="150" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="92" font-weight="700" letter-spacing="-4" fill="#ffffff">${initials}</text>
  <path d="M86 186 H170" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".55"/>
</svg>
`;
  fs.writeFileSync(path.join(out, `${name}.svg`), svg, 'utf8');
}
console.log(`${brands.length} logos generados en public/demo`);
