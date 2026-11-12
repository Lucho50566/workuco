/**
 * WorkUco — integración con IA para analizar CV y generar descripciones.
 *
 * La empresa elige proveedor y pega su propia API key. Soportamos:
 *   - OpenAI (y cualquier API compatible: Groq, Mistral, DeepSeek, OpenRouter…)
 *   - Google Gemini
 *   - Anthropic (Claude)
 *
 * La key se guarda sólo en la base local y nunca se devuelve al navegador.
 */
'use strict';

const DEFAULTS = {
  openai: { model: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
  gemini: { model: 'gemini-2.5-flash', base: 'https://generativelanguage.googleapis.com/v1beta' },
  anthropic: { model: 'claude-sonnet-4-5', base: 'https://api.anthropic.com/v1' },
  custom: { model: '', base: '' },
};

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', hint: 'También sirve para Groq, DeepSeek, Mistral u OpenRouter (API compatible).', needsBase: false },
  { id: 'gemini', name: 'Google Gemini', hint: 'Modelo recomendado: gemini-2.5-flash.', needsBase: false },
  { id: 'anthropic', name: 'Anthropic Claude', hint: 'Modelo recomendado: claude-sonnet-4-5.', needsBase: false },
  { id: 'custom', name: 'Otro (API compatible OpenAI)', hint: 'Pegá la URL base, por ejemplo https://api.groq.com/openai/v1', needsBase: true },
];

function configOf(company) {
  const provider = ['openai', 'gemini', 'anthropic', 'custom'].includes(company.ai_provider) ? company.ai_provider : '';
  return {
    provider,
    apiKey: company.ai_key || '',
    model: company.ai_model || (DEFAULTS[provider] ? DEFAULTS[provider].model : ''),
    baseUrl: company.ai_base_url || (DEFAULTS[provider] ? DEFAULTS[provider].base : ''),
    enabled: !!company.ai_enabled,
    auto: company.ai_auto !== 0,
  };
}

function parseJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(t); } catch (_) { /* sigue */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* sigue */ }
  }
  throw new Error('La IA devolvió una respuesta que no pudimos leer. Probá de nuevo.');
}

/* Config de IA del administrador para importar avisos (sólo por variables de entorno). */
function importConfig(env = process.env) {
  const provider = ['openai', 'gemini', 'anthropic', 'custom'].includes(env.WORKUCO_IMPORT_AI_PROVIDER) ? env.WORKUCO_IMPORT_AI_PROVIDER : '';
  const apiKey = env.WORKUCO_IMPORT_AI_KEY || '';
  if (!provider || !apiKey) return null;
  return {
    provider, apiKey,
    model: env.WORKUCO_IMPORT_AI_MODEL || DEFAULTS[provider].model,
    baseUrl: env.WORKUCO_IMPORT_AI_BASE || DEFAULTS[provider].base,
  };
}

/* images: [{ mime, base64 }] — capturas o flyers que la IA tiene que leer */
async function callProvider(cfg, { system, user, images = [], maxTokens = 1600 }) {
  if (!cfg.provider) throw new Error('Elegí un proveedor de IA primero');
  if (!cfg.apiKey) throw new Error('Falta la API key del proveedor');
  const timeout = AbortSignal.timeout(60000);

  if (cfg.provider === 'gemini') {
    const base = (cfg.baseUrl || DEFAULTS.gemini.base).replace(/\/+$/, '');
    const model = cfg.model || DEFAULTS.gemini.model;
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST', signal: timeout,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.base64 } }))] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw providerError(res.status, data && data.error && data.error.message);
    const text = (((data.candidates || [])[0] || {}).content || {}).parts?.map((p) => p.text).join('') || '';
    return parseJson(text);
  }

  if (cfg.provider === 'anthropic') {
    const base = (cfg.baseUrl || DEFAULTS.anthropic.base).replace(/\/+$/, '');
    const res = await fetch(`${base}/messages`, {
      method: 'POST', signal: timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model || DEFAULTS.anthropic.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: `${system}\nRespondé únicamente con JSON válido, sin texto extra.`,
        messages: [{ role: 'user', content: images.length
          ? [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.base64 } })), { type: 'text', text: user }]
          : user }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw providerError(res.status, data && data.error && data.error.message);
    const text = ((data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')) || '';
    return parseJson(text);
  }

  /* openai / custom (compatible) */
  const base = (cfg.baseUrl || DEFAULTS.openai.base).replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal: timeout,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model || DEFAULTS.openai.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: images.length
          ? [{ type: 'text', text: user }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.base64}` } }))]
          : user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw providerError(res.status, data && data.error && data.error.message);
  const text = (((data.choices || [])[0] || {}).message || {}).content || '';
  return parseJson(text);
}

function providerError(status, msg) {
  const detail = msg ? `: ${String(msg).slice(0, 180)}` : '';
  if (status === 401 || status === 403) return new Error(`La API key fue rechazada${detail}`);
  if (status === 429) return new Error(`El proveedor de IA está sin cuota o recibió muchas solicitudes${detail}`);
  if (status === 404) return new Error(`No encontramos el modelo indicado${detail}`);
  return new Error(`El proveedor de IA respondió con error ${status}${detail}`);
}

/* ------------------------------------------------------------------ */
/* Analizar un CV / postulante                                         */
/* ------------------------------------------------------------------ */
async function analyzeApplication({ company, job, application, cvText }) {
  const cfg = configOf(company);
  const profile = application.candidate || {};
  const profileText = [
    `Nombre: ${application.name}`,
    profile.headline ? `Titular: ${profile.headline}` : '',
    profile.locality ? `Localidad: ${profile.locality}` : '',
    profile.about ? `Sobre la persona: ${profile.about}` : '',
    (profile.skills || []).length ? `Habilidades declaradas: ${profile.skills.join(', ')}` : '',
    profile.experience ? `Experiencia: ${profile.experience}` : '',
    profile.education ? `Formación: ${profile.education}` : '',
    profile.availability ? `Disponibilidad: ${profile.availability}` : '',
    application.message ? `Mensaje de presentación: ${application.message}` : '',
  ].filter(Boolean).join('\n');

  const system = `Sos un asistente de selección de personal para PyMEs del Valle de Uco, Mendoza (Argentina).
Tu trabajo es leer la postulación y devolver un análisis breve, concreto y útil para el dueño de la empresa.
No inventes datos que no estén en el CV o el perfil. Si falta información, decilo.
Sé respetuoso: evaluá idoneidad para el puesto, nunca edad, género, apariencia, nacionalidad ni otros datos sensibles.
Respondé en español rioplatense neutro. Devolvé SOLO un objeto JSON con esta forma:
{
  "score": 0-100,
  "summary": "2 o 3 frases sobre el perfil y su encaje con el puesto",
  "strengths": ["máximo 4 puntos fuertes concretos"],
  "gaps": ["máximo 3 faltantes o dudas (no defectos personales)"],
  "skills": ["máximo 8 habilidades detectadas"],
  "seniority": "sin experiencia | junior | semi senior | senior | no determinado",
  "recommendation": "avanzar | entrevistar | dudar | descartar"
}`;

  const user = `PUESTO
Título: ${job.title}
Localidad: ${job.locality} · ${job.modality} · ${job.type}
Descripción: ${String(job.description || '').slice(0, 2500)}
Requisitos: ${String(job.requirements || '').slice(0, 1500) || 'No especificados'}
Experiencia pedida: ${job.experience || 'No especificada'}

POSTULANTE
${profileText}

TEXTO DEL CV${cvText && cvText.ok ? '' : ' (no disponible o ilegible)'}
${cvText && cvText.ok ? cvText.text.slice(0, 14000) : 'Sin texto extraíble del PDF. Usá el perfil de arriba.'}`;

  const out = await callProvider(cfg, { system, user, maxTokens: 1400 });
  const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
  const arr = (v, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : []);
  return {
    score,
    summary: String(out.summary || '').slice(0, 900),
    strengths: arr(out.strengths, 4),
    gaps: arr(out.gaps, 3),
    skills: arr(out.skills, 8),
    seniority: String(out.seniority || '').slice(0, 60),
    recommendation: ['avanzar', 'entrevistar', 'dudar', 'descartar'].includes(out.recommendation) ? out.recommendation : 'dudar',
  };
}

/* ------------------------------------------------------------------ */
/* Generar descripción de oferta                                       */
/* ------------------------------------------------------------------ */
async function generateJob({ company, inputs }) {
  const cfg = configOf(company);
  const system = `Sos redactor de avisos de empleo para PyMEs del Valle de Uco, Mendoza.
Escribí en español rioplatense, claro y humano, sin exageraciones ni lenguaje corporativo vacío.
No inventes beneficios, sueldos ni requisitos que no estén en los datos.
Devolvé SOLO JSON:
{
  "description": "2 párrafos breves (máx 900 caracteres), en texto plano",
  "responsibilities": ["4 a 6 tareas concretas"],
  "requirements": ["3 a 6 requisitos concretos"],
  "experience": "texto corto, ej: '1 año en atención al público' o 'No excluyente'",
  "schedule": "texto corto de jornada, si se puede inferir",
  "salary": "texto corto o 'A convenir'"
}`;
  const user = `Empresa: ${company.name}
Rubro: ${inputs.category}
Puesto: ${inputs.title}
Localidad: ${inputs.locality}
Modalidad: ${inputs.modality}
Tipo de empleo: ${inputs.type}
Pistas del empleador: ${inputs.notes || 'ninguna'}
Beneficios elegidos: ${(inputs.benefits || []).join(', ') || 'ninguno'}
Cantidad de puestos: ${inputs.positions || 1}`;

  const out = await callProvider(cfg, { system, user, maxTokens: 1200 });
  const arr = (v, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : []);
  return {
    description: String(out.description || '').trim().slice(0, 2000),
    responsibilities: arr(out.responsibilities, 6),
    requirements: arr(out.requirements, 6),
    experience: String(out.experience || '').slice(0, 160),
    schedule: String(out.schedule || '').slice(0, 160),
    salary: String(out.salary || '').slice(0, 120),
  };
}

async function testConnection(company) {
  const cfg = configOf(company);
  const out = await callProvider(cfg, {
    system: 'Respondé únicamente JSON válido.',
    user: 'Devolvé {"ok": true, "saludo": "hola"} sin nada más.',
    maxTokens: 60,
  });
  return out;
}

module.exports = { analyzeApplication, generateJob, testConnection, configOf, PROVIDERS, DEFAULTS, callProvider, parseJson, importConfig };
