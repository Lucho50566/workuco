// Repara texto UTF-8 que pasó por Get-Content/Set-Content de PowerShell 5.1.
// Uso: node tools/fix-encoding.js <archivo>
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const dec = new TextDecoder('windows-1252');
const map = new Map();
for (let b = 0; b < 256; b++) {
  const ch = dec.decode(Uint8Array.from([b]));
  if (ch && !map.has(ch)) map.set(ch, b);
}
const bytes = [];
for (const ch of text) {
  if (map.has(ch)) bytes.push(map.get(ch));
  else {
    // Caracteres fuera de cp1252: conservar como UTF-8
    for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);
  }
}
const fixed = Buffer.from(bytes).toString('utf8');
if (fixed.includes('\uFFFD')) {
  console.error('No se pudo reparar sin pérdida; abortando.');
  process.exit(1);
}
fs.writeFileSync(file, fixed, 'utf8');
console.log('Reparado:', file);
