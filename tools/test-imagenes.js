/**
 * Carga rápida con señal débil: miniaturas WebP para las listas, y código/estilos guardados en el celular.
 *   node tools/test-imagenes.js
 * Si no hay cwebp ni ffmpeg con WebP, las pruebas de generación se saltean (la página sigue andando sin miniaturas).
 */
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* PNG de w×h de un color, hecho a mano */
function png(w, h, rgb = [200, 60, 90]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', raw), chunk('IEND', Buffer.alloc(0))]);
}

async function unidad() {
  console.log('— Tamaño de imágenes —');
  const img = require('../lib/images');
  const p = png(640, 400);
  check('PNG: ancho y alto', JSON.stringify(img.imageSize(p)) === JSON.stringify({ width: 640, height: 400 }), JSON.stringify(img.imageSize(p)));
  check('algo que no es imagen: null', img.imageSize(Buffer.from('hola')) === null);
  check('nombre de la miniatura', img.thumbName('flyer-abc123.jpg') === 'flyer-abc123-t.webp' && img.isThumb('flyer-abc123-t.webp') && !img.isThumb('flyer-abc123.jpg'));
  const tool = await img.tool();
  console.log(`  (herramienta de WebP: ${tool || 'ninguna'})`);
  if (!tool) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-img-'));
  try {
    const src = path.join(dir, 'grande.png'); fs.writeFileSync(src, png(1200, 1500));
    const dst = path.join(dir, 'grande-t.webp');
    check('genera la miniatura', await img.makeThumb(src, dst) === true && fs.existsSync(dst));
    const t = fs.readFileSync(dst);
    const s = img.imageSize(t);
    check('la miniatura es WebP', t.toString('latin1', 0, 4) === 'RIFF' && t.toString('latin1', 8, 12) === 'WEBP');
    check('480 de ancho, mismas proporciones', s && s.width === 480 && Math.abs(s.height - 600) <= 1, JSON.stringify(s));
    const chica = path.join(dir, 'chica.png'); fs.writeFileSync(chica, png(300, 200));
    await img.makeThumb(chica, path.join(dir, 'chica-t.webp'));
    const sc = img.imageSize(fs.readFileSync(path.join(dir, 'chica-t.webp')));
    check('una imagen chica no se agranda', sc && sc.width === 300, JSON.stringify(sc));
    /* JPEG real (si ffmpeg está) para probar el lector de JPEG */
    try {
      const jpg = path.join(dir, 'foto.jpg');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=800x600', '-frames:v', '1', jpg]);
      check('JPEG: ancho y alto', JSON.stringify(img.imageSize(fs.readFileSync(jpg))) === JSON.stringify({ width: 800, height: 600 }));
    } catch (_) { console.log('  (sin ffmpeg: salteo el JPEG)'); }
    return tool;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function servidor(tool) {
  console.log('— Página —');
  const PORT = 4654;
  const BASE = `http://127.0.0.1:${PORT}`;
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-img-srv-'));
  const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
  const client = () => {
    let cookie = '';
    return async (p, method = 'GET', body) => {
      const h = {}; if (cookie) h.Cookie = cookie; if (body !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('wk_sess=')) cookie = kv; }
      return r;
    };
  };
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '0', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass } });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/meta`)).ok) break; } catch (_) { /* arrancando */ } await wait(150); }
    /* código y estilos con versión: quedan guardados en el celular */
    const html = await (await fetch(`${BASE}/`)).text();
    const m = html.match(/\/app\.js\?v=([a-f0-9]{8,})/);
    check('el HTML pide los archivos con versión', !!m && /\/styles\.css\?v=[a-f0-9]{8,}/.test(html) && /\/valle\.css\?v=[a-f0-9]{8,}/.test(html));
    const js = await fetch(`${BASE}/app.js?v=${m && m[1]}`);
    check('con versión: guardado un año', /max-age=31536000/.test(js.headers.get('cache-control') || '') && /immutable/.test(js.headers.get('cache-control') || ''), js.headers.get('cache-control'));
    check('sin versión: se revalida', /no-cache/.test((await fetch(`${BASE}/app.js`)).headers.get('cache-control') || ''));
    check('el service worker nunca queda guardado', /no-cache/.test((await fetch(`${BASE}/sw.js`)).headers.get('cache-control') || ''));
    check('la página HTML no queda guardada', /no-cache|no-store/.test((await fetch(`${BASE}/`)).headers.get('cache-control') || ''));

    /* flyer de un aviso: lista con miniatura, detalle con el tamaño completo */
    const admin = client(); await admin('/api/admin/login', 'POST', { email: ADMIN.email, password: ADMIN.pass });
    const emp = client();
    await emp('/api/auth/register', 'POST', { role: 'company', name: 'Finca Liviana', email: 'liviana@test.workuco', phone: '2622 460460', password: 'clave12345', acceptTerms: true });
    const flyer = `data:image/png;base64,${png(1200, 1500).toString('base64')}`;
    const job = (await (await emp('/api/company/jobs', 'POST', { title: 'Tractorista', description: 'Manejo de tractor y tareas generales de la finca, turno mañana, con experiencia.', locality: 'Tunuyán', category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', contactEmail: 'liviana@test.workuco', flyers: [flyer] })).json()).job;
    await admin(`/api/admin/jobs/${job.id}`, 'PATCH', { status: 'approved' });
    let item = null;
    for (let i = 0; i < 40; i++) { item = ((await (await fetch(`${BASE}/api/jobs`)).json()).jobs || []).find((j) => j.id === job.id); if (!tool || (item && item.flyerThumb && item.flyerThumb !== item.flyer)) break; await wait(150); }
    check('la lista trae flyer y miniatura', !!item && !!item.flyer && !!item.flyerThumb, JSON.stringify(item && { f: item.flyer, t: item.flyerThumb }));
    if (tool) {
      check('la miniatura es otra imagen, WebP', /-t\.webp$/.test(item.flyerThumb) && item.flyerThumb !== item.flyer, item.flyerThumb);
      const t = await fetch(BASE + item.flyerThumb);
      const tb = Buffer.from(await t.arrayBuffer());
      const full = Buffer.from(await (await fetch(BASE + item.flyer)).arrayBuffer());
      check('la miniatura pesa mucho menos', t.status === 200 && tb.length < full.length / 3, `${tb.length} vs ${full.length}`);
      check('imágenes subidas: guardadas un año (nombre único)', /immutable/.test(t.headers.get('cache-control') || ''), t.headers.get('cache-control'));
    } else {
      check('sin herramienta: la miniatura es el mismo flyer', item.flyerThumb === item.flyer);
    }
    const det = (await (await fetch(`${BASE}/api/jobs/${job.id}`)).json()).job;
    check('el detalle sigue con el flyer completo', det.flyers[0] === item.flyer && !/-t\.webp$/.test(det.flyers[0]));
  } catch (e) { fail++; console.error('ERROR:', e); } finally {
    server.kill(); await wait(300); fs.rmSync(DATA, { recursive: true, force: true });
  }
}

(async () => {
  let tool = null;
  try { tool = await unidad(); } catch (e) { fail++; console.error('ERROR:', e); }
  await servidor(tool);
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
