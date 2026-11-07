/**
 * Extracción de texto de CV en PDF, sin dependencias.
 *
 * Descomprime los streams (FlateDecode), lee los operadores de texto Tj/TJ y
 * usa las tablas /ToUnicode que incluyen los PDF exportados desde Word, Google
 * Docs, Canva o Chrome. Si no hay tabla, cae a Latin-1.
 *
 * No es un visor PDF: alcanza para que una IA lea el contenido de un CV.
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const MAX_OUT = 60000;

/* ------------------------------------------------------------------ */
/* Bytes y CMaps                                                       */
/* ------------------------------------------------------------------ */
function literalToBytes(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') { out.push(raw.charCodeAt(i) & 0xFF); continue; }
    const n = raw[++i];
    if (n === undefined) break;
    if (n === 'n') out.push(10);
    else if (n === 'r') out.push(13);
    else if (n === 't') out.push(9);
    else if (n === 'b') out.push(8);
    else if (n === 'f') out.push(12);
    else if (n === '\n') { /* salto de línea escapado */ }
    else if (n === '\r') { if (raw[i + 1] === '\n') i++; }
    else if (n >= '0' && n <= '7') {
      let oct = n;
      for (let k = 0; k < 2; k++) {
        const d = raw[i + 1];
        if (d >= '0' && d <= '7') { oct += d; i++; } else break;
      }
      out.push(parseInt(oct, 8) & 0xFF);
    } else out.push(n.charCodeAt(0) & 0xFF);
  }
  return Buffer.from(out);
}

function hexToBytes(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  const padded = clean.length % 2 ? clean + '0' : clean;
  const out = Buffer.alloc(padded.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function hexToUnicode(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const code = parseInt(clean.slice(i, i + 4).padEnd(4, '0'), 16);
    if (code) out += String.fromCharCode(code);
  }
  return out || ' ';
}

function parseCMap(text) {
  const map = new Map();
  let twoByte = false;
  if (/begincodespacerange[\s\S]*?<0000>\s*<FFFF>/i.test(text)) twoByte = true;

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/gi) || [];
  for (const block of charBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m;
    while ((m = re.exec(block))) {
      const code = parseInt(m[1], 16);
      map.set(code, hexToUnicode(m[2]));
      if (code > 255) twoByte = true;
    }
  }
  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/gi) || [];
  for (const block of rangeBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m;
    while ((m = re.exec(block))) {
      const start = parseInt(m[1], 16);
      const end = parseInt(m[2], 16);
      const dst = parseInt(m[3], 16);
      if (end < start || end - start > 65535) continue;
      for (let c = start; c <= end; c++) {
        map.set(c, String.fromCharCode(dst + (c - start)));
        if (c > 255) twoByte = true;
      }
    }
  }
  return { map, twoByte };
}

function mergeCMaps(maps) {
  const merged = new Map();
  let twoByte = false;
  for (const { map, twoByte: tb } of maps) {
    twoByte = twoByte || tb;
    for (const [k, v] of map) if (!merged.has(k)) merged.set(k, v);
  }
  return { map: merged, twoByte };
}

/* ------------------------------------------------------------------ */
/* Texto de un stream de contenido                                     */
/* ------------------------------------------------------------------ */
function decodeBytes(buf, cmap, twoByte) {
  if (!cmap || cmap.size === 0) return buf.toString('latin1');
  let out = '';
  if (twoByte) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const code = (buf[i] << 8) | buf[i + 1];
      const v = cmap.get(code);
      if (v) out += v;
      else if (code >= 32 && code < 0xD800) out += String.fromCharCode(code);
    }
  } else {
    for (let i = 0; i < buf.length; i++) {
      const v = cmap.get(buf[i]);
      out += v || (buf[i] >= 32 ? String.fromCharCode(buf[i]) : '');
    }
  }
  return out;
}

function textFromContent(buf, cmap, twoByte) {
  const s = buf.toString('latin1');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') {
      let depth = 1; let j = i + 1; let raw = '';
      while (j < s.length && depth > 0) {
        const c = s[j];
        if (c === '\\') { raw += c + (s[j + 1] || ''); j += 2; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        raw += c; j++;
      }
      const rest = s.slice(j + 1, j + 12);
      if (/^\s*(Tj|TJ|'|")/.test(rest)) {
        out += decodeBytes(literalToBytes(raw), cmap, twoByte) + ' ';
      }
      i = j + 1; continue;
    }
    if (ch === '<' && s[i + 1] !== '<') {
      const close = s.indexOf('>', i + 1);
      if (close > i) {
        const hex = s.slice(i + 1, close);
        if (/^[0-9a-fA-F\s]+$/.test(hex)) {
          out += decodeBytes(hexToBytes(hex), cmap, twoByte) + ' ';
          i = close + 1; continue;
        }
      }
    }
    if (ch === 'T' && s[i + 1] === 'd') out += '\n';
    if (ch === 'T' && s[i + 1] === 'D') out += '\n';
    if (ch === 'E' && s[i + 1] === 'T') out += '\n';
    i++;
  }
  return out;
}

function inflate(buf) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync, zlib.unzipSync]) {
    try { return fn(buf); } catch (_) { /* siguiente */ }
  }
  return null;
}

function scoreText(text) {
  if (!text) return 0;
  const letters = (text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const spaces = (text.match(/\s/g) || []).length;
  const weird = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  return letters + spaces * 0.5 - weird * 4;
}

function cleanText(text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_OUT);
}

function extractPdf(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (_) { return { text: '', ok: false, reason: 'No se pudo leer el archivo' }; }
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { text: '', ok: false, reason: 'No es un PDF' };

  const raw = buf.toString('latin1');
  const streams = [];
  let idx = 0;
  while (idx < raw.length && streams.length < 100) {
    const start = raw.indexOf('stream', idx);
    if (start < 0) break;
    let dataStart = start + 6;
    if (raw[dataStart] === '\r') dataStart++;
    if (raw[dataStart] === '\n') dataStart++;
    const end = raw.indexOf('endstream', dataStart);
    if (end < 0) break;
    const chunk = Buffer.from(raw.slice(dataStart, end), 'latin1');
    const decoded = inflate(chunk);
    if (decoded) streams.push(decoded);
    idx = end + 9;
  }

  /* primero juntamos las tablas ToUnicode */
  const maps = [];
  for (const s of streams) {
    const t = s.toString('latin1');
    if (/beginbfchar|beginbfrange/.test(t)) maps.push(parseCMap(t));
  }
  const merged = mergeCMaps(maps);

  /* extraer en ambos modos y quedarnos con el que más se parece a un texto */
  let best = { text: '', score: -1 };
  const modes = maps.length ? [merged.twoByte, !merged.twoByte] : [false];
  for (const mode of modes) {
    const parts = [];
    for (const s of streams) {
      const t = s.toString('latin1');
      if (/beginbfchar|beginbfrange/.test(t)) continue;
      const txt = textFromContent(s, merged.map, mode);
      if (txt && txt.trim()) parts.push(txt);
    }
    const text = cleanText(parts.join('\n'));
    const score = scoreText(text);
    if (score > best.score) best = { text, score };
  }

  const letters = (best.text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const good = letters >= 60 && letters / Math.max(1, best.text.length) > 0.4;
  return {
    text: good ? best.text : '',
    ok: good,
    reason: good ? '' : 'El PDF no tiene texto seleccionable (puede ser una imagen escaneada)',
  };
}

function readPlain(file, maxBytes = 400000) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, b, 0, maxBytes, 0);
    fs.closeSync(fd);
    return b.subarray(0, n).toString('utf8');
  } catch (_) { return ''; }
}

function extractCv(file) {
  if (!file) return { text: '', ok: false, reason: 'Sin archivo' };
  const ext = String(file).toLowerCase();
  if (ext.endsWith('.pdf')) return extractPdf(file);
  return { text: readPlain(file), ok: true, reason: '' };
}

module.exports = { extractCv, extractPdf };
