/**
 * Pruebas del análisis de CV con IA usando un proveedor "OpenAI compatible"
 * simulado en localhost. No usa internet ni claves reales.
 *
 *   node tools/test-ai.js
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractCv } = require('../lib/cvtext');

const ROOT = path.join(__dirname, '..');
const PORT = 4621;
const AI_PORT = 4622;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `workuco-ai-${Date.now()}`);
const PDF = path.join(__dirname, 'fixtures', 'cv-ejemplo.pdf');

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
    let data = null; try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  }
  return { req, get: (p) => req(p), post: (p, b) => req(p, { method: 'POST', body: b }), patch: (p, b) => req(p, { method: 'PATCH', body: b }) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/meta`); if (r.ok) return; } catch (_) {}
    await sleep(150);
  }
  throw new Error('El servidor no arrancó');
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });

  /* --- proveedor de IA simulado --- */
  const seen = [];
  const auths = [];
  const mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      auths.push(req.headers.authorization || '');
      let body = {};
      try { body = JSON.parse(raw); } catch (_) {}
      const user = ((body.messages || []).find((m) => m.role === 'user') || {}).content || '';
      const system = ((body.messages || []).find((m) => m.role === 'system') || {}).content || '';
      seen.push({ user, system });
      const isAnalysis = /PUESTO/.test(user) && /POSTULANTE/.test(user);
      const content = isAnalysis
        ? JSON.stringify({
          score: 88,
          summary: 'Perfil con experiencia directa en bodega y disponibilidad inmediata para la vendimia.',
          strengths: ['Cuatro vendimias en bodega boutique', 'Conoce fraccionamiento y etiquetado'],
          gaps: ['No menciona manejo de montacargas'],
          skills: ['Fraccionamiento', 'Etiquetado', 'Excel', 'Control de stock'],
          seniority: 'semi senior',
          recommendation: 'avanzar',
        })
        : JSON.stringify({
          description: 'Buscamos una persona para atención al público en un local céntrico, con buen trato y ganas de aprender.\n\nEl equipo es chico y el trabajo es presencial.',
          responsibilities: ['Atender a los clientes', 'Reponer mercadería', 'Cerrar la caja'],
          requirements: ['Buena comunicación', 'Disponibilidad los sábados', 'Secundario completo'],
          experience: '6 meses en atención al público',
          schedule: 'Lunes a sábado de 9 a 17 h',
          salary: 'A convenir',
        });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    });
  });
  await new Promise((r) => mock.listen(AI_PORT, '127.0.0.1', r));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WORKUCO_DATA: DATA, WORKUCO_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitServer();

    console.log('— Extractor de CV —');
    const cv = extractCv(PDF);
    check('extrae texto de un PDF real', cv.ok && cv.text.length > 80);
    check('lee acentos y contenido', /Sofía Herrera/.test(cv.text) && /cuatro vendimias/.test(cv.text));

    const company = client();
    const cand = client();
    const compLogin = await company.post('/api/auth/login', { email: 'bodega@demo.workuco', password: 'demo12345' });
    check('login de empresa demo', compLogin.status === 200);

    const candLogin = await cand.post('/api/auth/login', { role: 'candidate', email: 'martina@demo.workuco', password: 'demo12345' });
    check('login de persona demo', candLogin.status === 200);
    const cvUpload = await cand.patch('/api/candidate/profile', {
      cv: { name: 'cv-martina.pdf', data: fs.readFileSync(PDF).toString('base64') },
    });
    check('sube CV al perfil de la persona', cvUpload.status === 200 && cvUpload.data.candidate.hasCv);

    const cfg = await company.patch('/api/company/ai', {
      provider: 'custom', apiKey: 'test-key', model: 'mock-model',
      baseUrl: `http://127.0.0.1:${AI_PORT}/v1`, enabled: true, auto: false,
    });
    check('configura proveedor compatible', cfg.status === 200 && cfg.data.ai.hasKey);

    console.log('\n— Analizar CV —');
    const dashboard = await company.get('/api/company/dashboard');
    const martina = dashboard.data.applications.find((a) => a.email === 'martina@demo.workuco');
    check('postulación demo disponible', !!martina);
    const analysis = await company.post(`/api/company/applications/${martina.id}/analyze`);
    check('analiza la postulación', analysis.status === 200, JSON.stringify(analysis.data));
    check('devuelve puntaje y resumen', analysis.data.application.aiScore === 88 && /bodega/.test(analysis.data.application.aiSummary));
    check('devuelve puntos fuertes y dudas', analysis.data.application.aiStrengths.length === 2 && analysis.data.application.aiGaps.length === 1);
    check('recomendación válida', analysis.data.application.aiRecommendation === 'avanzar');

    const analysisPrompt = seen.find((s) => /PUESTO/.test(s.user))?.user || '';
    check('la IA recibe el texto del CV', /cuatro vendimias/.test(analysisPrompt));
    check('la IA recibe los datos del puesto', /Operario de bodega/.test(analysisPrompt));
    check('envía la API key como Bearer', auths.includes('Bearer test-key'));

    console.log('\n— Generar aviso —');
    const draft = await company.post('/api/company/ai/describe', {
      title: 'Vendedor/a', category: 'Comercio', locality: 'Tunuyán', modality: 'Presencial',
      type: 'Tiempo completo', benefits: ['Comida incluida'], positions: 1,
    });
    check('genera borrador de aviso', draft.status === 200 && /atención al público/.test(draft.data.draft.description));
    check('genera responsabilidades y requisitos', draft.data.draft.responsibilities.length === 3 && draft.data.draft.requirements.length === 3);

    console.log('\n— Análisis automático —');
    await company.patch('/api/company/ai', { auto: true });
    const nuevo = client();
    const email = `auto-${Date.now()}@test.com`;
    await nuevo.post('/api/auth/register', { role: 'candidate', name: 'Postulante Auto', email, phone: '2622009999', password: 'clave12345', acceptTerms: true });
    const applied = await nuevo.post('/api/jobs/jdemo001/apply', { message: 'Me interesa la vendimia.' });
    check('postulación nueva', applied.status === 201);
    let auto = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const d = await company.get('/api/company/dashboard');
      auto = d.data.applications.find((a) => a.email === email);
      if (auto && auto.aiScore != null) break;
    }
    check('el análisis automático se guarda solo', auto && auto.aiScore === 88);

    console.log('\n— Errores del proveedor —');
    const bad = client();
    await bad.post('/api/auth/login', { email: 'cafe@demo.workuco', password: 'demo12345' });
    await bad.patch('/api/company/ai', { provider: 'custom', apiKey: 'x', model: 'm', baseUrl: 'http://127.0.0.1:9/v1', enabled: true });
    const d2 = await bad.get('/api/company/dashboard');
    const app2 = d2.data.applications[0];
    const badResult = await bad.post(`/api/company/applications/${app2.id}/analyze`);
    check('error de red devuelve mensaje claro', badResult.status === 502 && /IA/i.test(badResult.data.error));
  } finally {
    child.kill(); mock.close();
    await sleep(300);
    fs.rmSync(DATA, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok · ${fail} fail`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
