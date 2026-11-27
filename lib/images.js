'use strict';
/* Miniaturas WebP para que las listas carguen rápido con señal débil (sin dependencias de npm).
   Usa la herramienta del sistema que haya: cwebp (paquete "webp") o ffmpeg con libwebp.
   Si no hay ninguna, no pasa nada: las listas muestran la imagen original, como antes. */
const { execFile } = require('child_process');

const THUMB_WIDTH = 480;   // las tarjetas miden ~240 px: 480 alcanza para pantallas de doble densidad
const THUMB_QUALITY = 80;

const thumbName = (file) => `${String(file).replace(/\.[a-z0-9]+$/i, '')}-t.webp`;
const isThumb = (file) => /-t\.webp$/i.test(String(file));

/* Ancho y alto leyendo la cabecera (PNG, JPEG, WebP). null si no es una imagen conocida. */
function imageSize(b) {
  if (!Buffer.isBuffer(b) || b.length < 24) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      /* SOF0..SOF15 (menos DHT, JPG y DAC) traen el tamaño */
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

const run = (cmd, args, timeout = 60000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}` }));
});

let toolPromise = null;
/* 'cwebp' | 'ffmpeg' | null (se averigua una sola vez) */
function tool() {
  if (!toolPromise) {
    toolPromise = (async () => {
      if (process.env.WORKUCO_NO_THUMBS === '1') return null;
      if ((await run('cwebp', ['-version'], 10000)).ok) return 'cwebp';
      const f = await run('ffmpeg', ['-hide_banner', '-encoders'], 10000);
      if (f.ok && /libwebp\b/.test(f.out)) return 'ffmpeg';
      return null;
    })();
  }
  return toolPromise;
}

/* Arma la miniatura de src en dst (WebP, hasta THUMB_WIDTH de ancho, sin agrandar). true si salió bien. */
async function makeThumb(src, dst, { width = THUMB_WIDTH, quality = THUMB_QUALITY } = {}) {
  const t = await tool();
  if (!t) return false;
  if (t === 'cwebp') {
    let w = 0;
    try { const s = imageSize(require('fs').readFileSync(src)); w = s ? s.width : 0; } catch (_) { return false; }
    const args = ['-quiet', '-q', String(quality), '-metadata', 'none'];
    if (w > width) args.push('-resize', String(width), '0');
    return (await run('cwebp', [...args, src, '-o', dst])).ok;
  }
  return (await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale='min(${width},iw)':-2`, '-c:v', 'libwebp', '-quality', String(quality), '-frames:v', '1', dst])).ok;
}

module.exports = { THUMB_WIDTH, imageSize, tool, makeThumb, thumbName, isThumb };
