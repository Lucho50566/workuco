/**
 * Pruebas end-to-end de los avisos importados (v4): importación del admin,
 * fichas sin reclamar, reclamo, borrado y lista de "no importar".
 * Usa una IA falsa (WORKUCO_IMPORT_AI_FAKE=1): no sale a internet.
 *
 *   node tools/test-v4.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4597;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-v4-${Date.now()}`);
const ADMIN = { email: 'admin@workuco.com.ar', pass: 'workuco2026' };
const PASS = 'demo12345';

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
function client() {
  let cookie = '';
  async function req(p, { method = 'GET', body } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const kv = c.split(';')[0];
      if (kv.startsWith('wk_sess=')) cookie = kv;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, data: data || {}, text, type: res.headers.get('content-type') || '' };
  }
  return { get: (p) => req(p), post: (p, b = {}) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }), del: (p) => req(p, { method: 'DELETE' }) };
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('El servidor no arrancó');
}
const todayPlus = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400000).toISOString().slice(0, 10);

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1', WORKUCO_IMPORT_AI_FAKE: '1',
      WORKUCO_CONTACT_WA: '2622 400000', WORKUCO_ADMIN_EMAIL: ADMIN.email, WORKUCO_ADMIN_PASS: ADMIN.pass },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitServer();
    const pub = client(); const admin = client(); const martina = client(); const bodega = client();
    await admin.post('/api/admin/login', { email: ADMIN.email, password: ADMIN.pass });
    await martina.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: PASS });
    await bodega.post('/api/auth/login', { email: 'bodega@demo.workuco', password: PASS });

    console.log('\n— Importación (admin) —');
    for (const [m, p] of [['get', '/api/admin/import/config'], ['post', '/api/admin/import/parse'], ['post', '/api/admin/import/publish'], ['get', '/api/admin/import']]) {
      check(`${p} exige admin`, (await pub[m](p)).status === 401 && (await bodega[m](p)).status === 401);
    }
    const cfg = await admin.get('/api/admin/import/config');
    check('config con IA lista y sin la key', cfg.status === 200 && cfg.data.aiReady === true && !/key/i.test(JSON.stringify(cfg.data)));
    check('meta trae el WhatsApp de contacto', (await pub.get('/api/meta')).data.contactWa === '2622 400000');

    const source = 'SE BUSCA MOZO para Resto El Álamo, Tunuyán, turno noche. Escribir al 2622 15-555123.\n---\nFinca Las Pircas busca cosechadores de manzana, $30.000 por día. +54 9 2622 444777';
    const parsed = await admin.post('/api/admin/import/parse', { text: source });
    const drafts = parsed.data.drafts || [];
    check('parse devuelve 2 borradores', parsed.status === 200 && drafts.length === 2, JSON.stringify(parsed.data).slice(0, 200));
    check('texto demasiado largo: 413', (await admin.post('/api/admin/import/parse', { text: 'x'.repeat(20001) })).status === 413);
    check('más de 6 imágenes: 400', (await admin.post('/api/admin/import/parse', { images: Array.from({ length: 7 }, () => ({ mime: 'image/png', base64: 'aaaa' })) })).status === 400);
    check('parse vacío: 400', (await admin.post('/api/admin/import/parse', {})).status === 400);

    const pub1 = await admin.post('/api/admin/import/publish', { draft: drafts[0], sourceName: 'Empleos Tunuyán (WhatsApp)', sourceText: source });
    const job1 = pub1.data.job || {}; const co1 = pub1.data.company || {};
    check('publicar crea el aviso aprobado e importado', pub1.status === 201 && job1.status === 'approved' && job1.sourceKind === 'importado' && job1.sourceName === 'Empleos Tunuyán (WhatsApp)', JSON.stringify(pub1.data).slice(0, 200));
    check('vence a los 30 días', job1.closesAt === todayPlus(30), job1.closesAt);
    check('la ficha queda sin reclamar', co1.claimed === false && co1.name === 'Resto El Álamo');

    const otro = { ...drafts[0], title: 'Bachero para el turno noche', contactPhone: '02622 555123' };
    const pub2 = await admin.post('/api/admin/import/publish', { draft: otro, sourceName: 'Empleos Tunuyán (WhatsApp)', sourceText: 'otro' });
    check('mismo teléfono en otro formato reusa la ficha', pub2.status === 201 && pub2.data.company.id === co1.id);

    const dup = await admin.post('/api/admin/import/publish', { draft: drafts[0], sourceName: 'X', sourceText: source });
    check('aviso repetido: 409 duplicate', dup.status === 409 && dup.data.code === 'duplicate');
    const forced = await admin.post('/api/admin/import/publish', { draft: drafts[0], sourceName: 'X', sourceText: source, force: true });
    check('con force se publica igual', forced.status === 201);

    const bad = await admin.post('/api/admin/import/publish', { draft: { ...drafts[1], title: 'ab' }, sourceName: 'X' });
    check('borrador sin título válido: 400', bad.status === 400 && bad.data.fields && !!bad.data.fields.title);
    const noLoc = await admin.post('/api/admin/import/publish', { draft: { ...drafts[1], locality: '' }, sourceName: 'X' });
    check('borrador sin localidad: 400', noLoc.status === 400 && !!noLoc.data.fields.locality);
    const early = await admin.post('/api/admin/import/publish', { draft: { ...drafts[1], closesAt: todayPlus(5) }, sourceName: 'Canal Valle', sourceText: 'cosecha' });
    const job2 = early.data.job || {}; const co2 = early.data.company || {};
    check('una fecha de cierre anterior se respeta', early.status === 201 && job2.closesAt === todayPlus(5) && job2.gig === true);

    const ov = await admin.get('/api/admin/import');
    const row = (ov.data.companies || []).find((c) => c.id === co1.id) || {};
    check('el admin ve la ficha con link y estado', /\/reclamar\/[a-f0-9]{48}$/.test(row.claimUrl || '') && row.notifyStatus === 'sin_avisar' && row.jobs.length === 3, JSON.stringify(row).slice(0, 300));
    check('el WhatsApp va al teléfono de la empresa con el link', /^https:\/\/wa\.me\/5492622555123\?text=/.test(row.waUrl || '') && decodeURIComponent(row.waUrl).includes(row.claimUrl) && decodeURIComponent(row.waUrl).includes('Mozo para restaurante'));
    check('el admin ve el texto original', JSON.stringify(row).includes('turno noche'));
    check('marcar como avisada', (await admin.post(`/api/admin/import/companies/${co1.id}/notified`)).status === 200
      && ((await admin.get('/api/admin/import')).data.companies.find((c) => c.id === co1.id) || {}).notifyStatus === 'avisado');
    const token1 = row.claimUrl.split('/').pop();
    const token2 = ((ov.data.companies || []).find((c) => c.id === co2.id) || {}).claimUrl.split('/').pop();

    check('una ficha sin reclamar no puede iniciar sesión', (await client().post('/api/auth/login', { email: `sin-reclamar+${co1.id}@import.workuco`, password: '!' })).status === 401);

    console.log('\n— Público y privacidad —');
    const leaks = [await pub.get('/api/jobs?limit=30'), await pub.get(`/api/jobs/${job1.id}`), await pub.get('/api/companies'), await pub.get(`/api/companies/${co1.id}`),
      await pub.get(`/empresa/${co1.id}`), await pub.get(`/oferta/${job1.id}`)];
    check('el código de reclamo no aparece en nada público', leaks.every((r) => !r.text.includes(token1) && !r.text.includes(token2)));
    check('el texto original no aparece en nada público', leaks.every((r) => !r.text.includes('Escribir al 2622 15-555123')));
    const det = await pub.get(`/api/jobs/${job1.id}`);
    check('el detalle dice de qué canal salió', det.data.job.sourceKind === 'importado' && det.data.job.sourceName === 'Empleos Tunuyán (WhatsApp)');
    check('la ficha pública dice que no está reclamada', (await pub.get(`/api/companies/${co1.id}`)).data.company.claimed === false);
    check('persona se postula a un importado', (await martina.post(`/api/jobs/${job1.id}/apply`, {})).status === 201);
    await martina.post(`/api/jobs/${job2.id}/apply`, {});
    check('las fichas sin reclamar no tienen insignia de respuesta', (await pub.get(`/api/companies/${co1.id}`)).data.company.response === null);

    console.log('\n— Reclamo —');
    const view = await pub.get(`/api/claim/${token1}`);
    check('ver el reclamo: empresa, avisos y cantidad de postulantes', view.status === 200 && view.data.company.name === 'Resto El Álamo' && view.data.jobs.length === 3 && view.data.applicationsCount === 1);
    check('el reclamo no muestra datos de postulantes', !/martina|512345/i.test(view.text));
    check('código inventado: 404', (await pub.get(`/api/claim/${'0'.repeat(48)}`)).status === 404);
    const owner = client();
    const taken = await owner.post(`/api/claim/${token1}/accept`, { email: 'bodega@demo.workuco', password: 'clave12345' });
    check('reclamar con un email ya registrado: 409', taken.status === 409 && (await pub.get(`/api/companies/${co1.id}`)).data.company.claimed === false);
    check('contraseña corta: 400', (await owner.post(`/api/claim/${token1}/accept`, { email: 'elalamo@test.workuco', password: '123' })).status === 400);
    const acc = await owner.post(`/api/claim/${token1}/accept`, { email: 'elalamo@test.workuco', password: 'clave12345' });
    check('reclamar: 200 y queda logueada', acc.status === 200 && (await owner.get('/api/me')).data.user.role === 'company');
    const dash = await owner.get('/api/company/dashboard');
    check('la empresa ve a quien se postuló', dash.status === 200 && dash.data.applications.some((a) => a.name === 'Martina Salinas'));
    check('la ficha ya figura como reclamada', (await pub.get(`/api/companies/${co1.id}`)).data.company.claimed === true);
    check('el mismo código no sirve dos veces', (await pub.get(`/api/claim/${token1}`)).status === 404 && (await client().post(`/api/claim/${token1}/accept`, { email: 'otra@test.workuco', password: 'clave12345' })).status === 404);
    const notes = (await martina.get('/api/notifications')).data.items || [];
    check('la persona se entera de que la empresa ya administra el aviso', notes.some((n) => /ya administra/.test(n.title + n.body)));
    check('el admin la ve como reclamada', ((await admin.get('/api/admin/import')).data.companies.find((c) => c.id === co1.id) || {}).claimed === true);

    console.log('\n— Borrado y lista de "no importar" —');
    const delr = await pub.post(`/api/claim/${token2}/delete`);
    check('borrar: 200', delr.status === 200);
    check('sus avisos ya no están', !(await pub.get('/api/jobs?limit=30')).data.jobs.some((j) => j.id === job2.id) && (await pub.get(`/api/jobs/${job2.id}`)).status === 404);
    check('la ficha ya no existe', (await pub.get(`/api/companies/${co2.id}`)).status === 404);
    const notes2 = (await martina.get('/api/notifications')).data.items || [];
    check('la persona se entera de que el aviso fue retirado', notes2.some((n) => /retirado/.test(n.title + n.body)));
    const again = await admin.post('/api/admin/import/publish', { draft: drafts[1], sourceName: 'X', sourceText: 'x' });
    check('no se puede volver a importar: 409 blocked', again.status === 409 && again.data.code === 'blocked');
    const otherPhone = await admin.post('/api/admin/import/publish', { draft: { ...drafts[1], contactPhone: '2622 111222' }, sourceName: 'X' });
    check('tampoco con otro teléfono y el mismo nombre', otherPhone.status === 409 && otherPhone.data.code === 'blocked');
    check('el admin ve que la empresa pidió borrarse', ((await admin.get('/api/admin/import')).data.removed || []).some((r) => /las pircas/i.test(r.name)));
    check('el código del borrado ya no sirve', (await pub.get(`/api/claim/${token2}`)).status === 404);

    console.log('\n— Admin borra una ficha —');
    const p3 = await admin.post('/api/admin/import/publish', { draft: { ...drafts[0], title: 'Cajero para el resto', companyName: 'Parrilla Don Tito', contactPhone: '2622 999888' }, sourceName: 'X' });
    check('el admin puede borrar una ficha importada', (await admin.del(`/api/admin/import/companies/${p3.data.company.id}`)).status === 200 && (await pub.get(`/api/companies/${p3.data.company.id}`)).status === 404);
    check('borrar desde el admin no bloquea reimportar', (await admin.post('/api/admin/import/publish', { draft: { ...drafts[0], title: 'Cajero para el resto', companyName: 'Parrilla Don Tito', contactPhone: '2622 999888' }, sourceName: 'X' })).status === 201);
    check('el admin no borra empresas propias por esta vía', (await admin.del('/api/admin/import/companies/cdemo01bodega')).status === 404);

    console.log('\n— Páginas y límites —');
    const page = await pub.get('/reclamar/abc123');
    check('la página de reclamo responde HTML', page.status === 200 && page.type.includes('text/html') && !page.text.includes('{{'));
    const spam = client();
    let blockedAt = 0;
    for (let i = 1; i <= 10 && !blockedAt; i++) if ((await spam.get(`/api/claim/${'f'.repeat(48)}`)).status === 429) blockedAt = i;
    check('muchos códigos inventados seguidos: 429', blockedAt > 0 && blockedAt <= 10, `en el intento ${blockedAt}`);
  } catch (e) {
    fail++; console.error('ERROR en las pruebas:', e);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
