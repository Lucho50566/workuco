// Actualiza los <head> de todas las páginas con el favicon y el manifest de marca.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public');

const oldBlock = '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">';
const newBlock = `  <link rel="icon" href="/favicon.png" type="image/png" sizes="64x64">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">`;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  const p = path.join(dir, file);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  if (s.includes(oldBlock)) s = s.replace(oldBlock, newBlock);
  s = s.split('content="#14884a"').join('content="#0ba37c"');
  if (s !== before) {
    fs.writeFileSync(p, s, 'utf8');
    console.log('ok', file);
  } else {
    console.log('sin cambios', file);
  }
}
