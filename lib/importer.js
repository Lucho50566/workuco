/**
 * WorkUco — importador de avisos pegados o fotografiados de canales de WhatsApp.
 * Funciones puras: armar el prompt para la IA y normalizar lo que devuelve.
 * Nunca publica nada: sólo produce borradores que el admin revisa.
 */
'use strict';

const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const clean = (s, n = 500) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const multiline = (s, n = 8000) => String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n);

/* Teléfono argentino → 10 dígitos (característica + número), para comparar. */
function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length > 10) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  /* el 15 móvil va después de la característica (4, 3 o 2 dígitos: 2622, 261, 11) */
  for (const a of [4, 3, 2]) {
    if (d.length === 12 && d.slice(a, a + 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break; }
  }
  if (d.length < 8) return '';
  return d.slice(-10);
}

/* Nombre de empresa → forma comparable. */
function normName(s) {
  return strip(s).toLowerCase()
    .replace(/\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?)\s*$/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function buildImportPrompt(meta) {
  const system = [
    'Sos un asistente que convierte mensajes de canales de empleo de WhatsApp del Valle de Uco (Mendoza, Argentina) en avisos estructurados.',
    'Recibís texto pegado y/o imágenes (flyers). Puede haber varios avisos mezclados: devolvé uno por cada búsqueda laboral distinta.',
    'Regla principal: no inventes datos. Si algo no está en el mensaje, dejalo vacío ("" o 0).',
    'Ignorá mensajes que no sean ofertas de trabajo (saludos, publicidad, personas buscando trabajo).',
    `Localidad: una de ${meta.localities.join(', ')}, o "" si no es del Valle o no se dice.`,
    `Categoría: una de ${meta.categories.join(', ')}.`,
    `Tipo: uno de ${meta.types.join(', ')}. Modalidad: una de ${meta.modalities.join(', ')}.`,
    'Sueldo: números enteros en pesos (salaryMin, salaryMax) y salaryPeriod "mes", "día" u "hora".',
    'gig = true si es una changa o trabajo por día/temporada (cosecha, poda, eventos). startDate en formato AAAA-MM-DD sólo si se dice.',
    'Si recibís imágenes, imageIndex es el número (empezando en 0) de la imagen de la que sale cada aviso; si sale del texto, -1.',
    'contactEmail: si en el flyer o el texto aparece un mail (gmail, hotmail, yahoo, outlook o de la empresa), copialo exacto, letra por letra, tal cual se ve. Si no aparece ninguno, dejalo vacío: nunca lo inventes ni lo armes con el nombre de la empresa.',
    'Respondé SOLO con JSON válido con esta forma:',
    '{"avisos":[{"title":"","companyName":"","locality":"","category":"","type":"","modality":"","description":"","requirements":"","salaryMin":0,"salaryMax":0,"salaryPeriod":"mes","gig":false,"startDate":"","duration":"","positions":1,"contactPhone":"","contactEmail":"","skills":[],"imageIndex":-1}]}',
  ].join('\n');
  return { system, user: 'Convertí estos mensajes en avisos:' };
}

const pick = (value, list, fallback) => {
  const v = strip(value).toLowerCase().trim();
  if (!v) return fallback;
  return list.find((x) => strip(x).toLowerCase() === v) || fallback;
};
const money = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(/[^\d]/g, ''));
  return Math.min(99999999, Math.max(0, Math.round(n || 0)));
};
const PERIOD = { mes: 'mes', mensual: 'mes', month: 'mes', dia: 'día', día: 'día', diario: 'día', jornada: 'día', hora: 'hora', horario: 'hora', hour: 'hora' };
const truthy = (v) => v === true || /^(true|si|sí|1|yes)$/i.test(String(v || '').trim());

function toList(raw) {
  let v = raw;
  if (typeof v === 'string') {
    const t = v.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    try { v = JSON.parse(t); } catch (_) {
      const a = t.indexOf('{'); const b = t.lastIndexOf('}');
      try { v = a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : null; } catch (_e) { v = null; }
    }
  }
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.avisos)) return v.avisos;
  return [];
}

function normalizeDrafts(raw, meta, sourceText = '', imageCount = 0) {
  const list = toList(raw).filter((x) => x && typeof x === 'object');
  if (!list.length) return { drafts: [], warnings: ['La IA no encontró avisos'] };
  const src = multiline(sourceText, 8000);
  const drafts = list.slice(0, 30).map((a) => {
    const warnings = [];
    const locality = pick(a.locality, meta.localities, '');
    if (!locality) warnings.push('Sin localidad');
    let description = multiline(a.description, 8000);
    if (description.length < 60 && src.length >= 60) {
      description = src;
      warnings.push('Descripción tomada del texto original');
    } else if (description.length < 60) warnings.push('Descripción corta');
    let salaryMin = money(a.salaryMin);
    let salaryMax = money(a.salaryMax);
    if (!salaryMin && salaryMax) { salaryMin = salaryMax; salaryMax = 0; }
    if (salaryMax && salaryMax < salaryMin) salaryMax = 0;
    const contactPhone = clean(a.contactPhone, 60);
    const contactEmail = clean(a.contactEmail, 160).toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail);
    const contactPhoneNorm = normPhone(contactPhone);
    if (!contactPhoneNorm && !emailOk) warnings.push('Sin contacto');
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.startDate || '')) ? a.startDate : '';
    return {
      title: clean(a.title, 120),
      companyName: clean(a.companyName, 120),
      locality,
      category: pick(a.category, meta.categories, 'Otros'),
      type: pick(a.type, meta.types, 'Tiempo completo'),
      modality: pick(a.modality, meta.modalities, 'Presencial'),
      description,
      requirements: multiline(a.requirements, 4000),
      salaryMin, salaryMax,
      salaryPeriod: PERIOD[strip(a.salaryPeriod).toLowerCase().trim()] || 'mes',
      gig: truthy(a.gig),
      startDate,
      duration: clean(a.duration, 60),
      positions: Math.min(99, Math.max(1, Number(a.positions) || 1)),
      contactPhone, contactPhoneNorm,
      contactEmail: emailOk ? contactEmail : '',
      skills: (Array.isArray(a.skills) ? a.skills : []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 8),
      imageIndex: Number.isInteger(Number(a.imageIndex)) && a.imageIndex !== '' && a.imageIndex !== null && Number(a.imageIndex) >= 0 && Number(a.imageIndex) < imageCount ? Number(a.imageIndex) : -1,
      warnings,
    };
  });
  /* una sola imagen y un solo aviso: es su flyer aunque la IA no lo haya dicho */
  if (imageCount === 1 && drafts.length === 1 && drafts[0].imageIndex < 0) drafts[0].imageIndex = 0;
  return { drafts, warnings: [] };
}

/* ---------------------------------------------------------------------------
 * Verificación de los borradores (para no publicar datos mal leídos):
 *  - crossCheck: compara lo que leyeron dos IA distintas del mismo mensaje.
 *  - groundDrafts: el sueldo y el teléfono tienen que estar escritos en el texto original.
 * Nada se descarta: sólo se avisa qué revisar antes de publicar.
 * ------------------------------------------------------------------------- */
const words = (s) => new Set(strip(s).toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function titleSimilarity(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
const pesos = (n) => `$ ${Number(n || 0).toLocaleString('es-AR')}`;

function crossCheck(primary, secondary) {
  const warnings = [];
  if (primary.length !== secondary.length) {
    warnings.push(`La otra IA encontró ${secondary.length} aviso${secondary.length === 1 ? '' : 's'} y esta ${primary.length}: revisá si falta o sobra alguno.`);
  }
  const used = new Set();
  const drafts = primary.map((d) => {
    /* la pareja: el borrador de la otra IA con el puesto más parecido que no se usó todavía */
    let best = -1; let score = 0;
    secondary.forEach((s, i) => { if (used.has(i)) return; const sc = titleSimilarity(d.title, s.title); if (sc > score) { score = sc; best = i; } });
    if (best < 0 || score < 0.5) return { ...d, checked: 'review', warnings: [...d.warnings, 'La otra IA no encontró este aviso: revisalo bien'] };
    used.add(best);
    const s = secondary[best];
    const diffs = [];
    if (d.salaryMin !== s.salaryMin || d.salaryMax !== s.salaryMax || (d.salaryMin && d.salaryPeriod !== s.salaryPeriod)) {
      diffs.push(`Revisá el sueldo: la otra IA leyó ${s.salaryMin ? `${pesos(s.salaryMin)}${s.salaryMax ? ` a ${pesos(s.salaryMax)}` : ''} por ${s.salaryPeriod}` : 'que no dice sueldo'}`);
    }
    if (d.contactPhoneNorm !== s.contactPhoneNorm) diffs.push(`Revisá el teléfono: la otra IA leyó ${s.contactPhone || 'que no hay teléfono'}`);
    if (d.locality !== s.locality) diffs.push(`Revisá la localidad: la otra IA leyó ${s.locality || 'que no se dice'}`);
    if (normName(d.companyName) !== normName(s.companyName)) diffs.push(`Revisá la empresa: la otra IA leyó "${s.companyName || 'sin nombre'}"`);
    if (d.gig !== s.gig) diffs.push(`Revisá si es changa: la otra IA leyó que ${s.gig ? 'sí' : 'no'}`);
    return { ...d, checked: diffs.length ? 'review' : 'ok', warnings: [...d.warnings, ...diffs] };
  });
  return { drafts, warnings };
}

/* teléfonos escritos en el texto, normalizados */
function phonesIn(text) {
  return new Set((String(text).match(/\+?\d[\d\s().-]{6,}\d/g) || []).map(normPhone).filter(Boolean));
}

function groundDrafts(drafts, sourceText) {
  const src = String(sourceText || '');
  if (!src.trim()) return drafts;
  const digits = src.replace(/\D/g, '');
  const phones = phonesIn(src);
  return drafts.map((d) => {
    if (d.imageIndex >= 0) return d; /* sale de un flyer: no se puede comparar con el texto */
    const w = [];
    for (const n of [d.salaryMin, d.salaryMax]) {
      if (n && !digits.includes(String(n))) { w.push(`El sueldo no figura tal cual en el mensaje (${pesos(n)}): revisalo`); break; }
    }
    if (d.contactPhoneNorm && !phones.has(d.contactPhoneNorm)) w.push(`El teléfono no figura en el mensaje (${d.contactPhone}): revisalo`);
    if (d.contactEmail && !src.toLowerCase().includes(String(d.contactEmail).toLowerCase())) w.push(`El mail no figura en el mensaje (${d.contactEmail}): revisalo`);
    return w.length ? { ...d, checked: 'review', warnings: [...d.warnings, ...w] } : d;
  });
}

/* ------------------------------------------------------------------ */
/* Mensaje para avisarle a la empresa que publicamos su aviso           */
/* ------------------------------------------------------------------ */
/* El texto de siempre: respaldo cuando la IA no está o falla. */
function defaultClaimMessage({ jobTitle = '', sourceName = '', applications = 0, claimUrl = '' }) {
  const ya = applications ? ` (ya tienen ${applications} postulante${applications === 1 ? '' : 's'})` : '';
  return `Hola, ¿cómo están? Les escribo de WorkUco, el portal de empleo del Valle de Uco. Vimos su búsqueda "${jobTitle}" en ${sourceName || 'un canal de empleo'} y la publicamos para que llegue a más gente de la zona. Si quieren, pueden reclamarla gratis para manejar sus postulantes${ya}, o pedir que la borremos con un toque: ${claimUrl}. ¡Gracias!`;
}

function buildClaimMessagePrompt({ name = '', jobTitle = '', jobs = [], locality = '', sourceName = '', applications = 0 }) {
  const system = `Escribís mensajes de WhatsApp de parte de WorkUco, el portal de empleo del Valle de Uco (Mendoza, Argentina), para avisarle a una empresa que publicamos su búsqueda de personal, que vimos en un canal o grupo público de empleo.
Tono: respetuoso, profesional y muy amigable, cálido y cercano, en español rioplatense con voseo ("pueden", "quieren"; tratamiento en plural o de usted según convenga, nunca confianzudo).
El mensaje tiene que:
- Saludar y presentarse como WorkUco en una línea.
- Contar que vimos su búsqueda (nombrá el puesto) y la publicamos gratis para que llegue a más gente de la zona.
- Si ya hay postulantes, decirlo con el número exacto.
- Ofrecer dos opciones claras: reclamarla gratis para ver y manejar sus postulantes, o pedir que la borremos con un toque.
- Terminar agradeciendo y con el marcador {LINK} solo, donde va el link (no escribas ningún link).
Reglas: entre 400 y 700 caracteres; como mucho 1 emoji; no inventes datos que no estén abajo; no prometas resultados (ni "les conseguimos personal" ni plazos); no menciones precios ni planes pagos; sin asteriscos ni formato.
Devolvé SOLO JSON: {"mensaje": "..."}`;
  const lista = (jobs.length ? jobs : [jobTitle]).filter(Boolean).join(', ');
  const user = `Empresa: ${name}
Búsqueda(s): ${lista || 'sin título'}
Localidad: ${locality || 'Valle de Uco'}
Dónde la vimos: ${sourceName || 'un canal de empleo de la zona'}
Postulantes hasta ahora: ${applications || 0}`;
  return { system, user };
}

/* Texto plano, sin links ajenos y siempre con el link real de reclamo. */
function normalizeClaimMessage(raw, claimUrl) {
  let t = typeof raw === 'string' ? raw : String((raw && (raw.mensaje || raw.message || raw.texto)) || '');
  t = t.replace(/```[a-z]*\n?/gi, '').replace(/<[^>]*>/g, '').replace(/\*\*?/g, '').replace(/\r/g, '');
  t = t.replace(/\{LINK\}/g, claimUrl).replace(/https?:\/\/\S+/g, (u) => (u.startsWith(claimUrl) ? claimUrl : ''));
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!t.includes(claimUrl)) t = `${t.slice(0, 900).trim()}\n${claimUrl}`;
  else if (t.length > 900 + claimUrl.length) t = `${t.replace(claimUrl, '').slice(0, 900).trim()}\n${claimUrl}`;
  return t.trim();
}

module.exports = { normPhone, normName, buildImportPrompt, normalizeDrafts, crossCheck, groundDrafts, defaultClaimMessage, buildClaimMessagePrompt, normalizeClaimMessage };
