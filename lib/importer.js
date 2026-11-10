/**
 * Workuco — importador de avisos pegados o fotografiados de canales de WhatsApp.
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
  /* "2622 15 555123": el 15 móvil va después de la característica de 4 dígitos */
  if (d.length === 12 && d.slice(4, 6) === '15') d = d.slice(0, 4) + d.slice(6);
  if (d.length === 12 && d.slice(3, 5) === '15') d = d.slice(0, 3) + d.slice(5);
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
    'Respondé SOLO con JSON válido con esta forma:',
    '{"avisos":[{"title":"","companyName":"","locality":"","category":"","type":"","modality":"","description":"","requirements":"","salaryMin":0,"salaryMax":0,"salaryPeriod":"mes","gig":false,"startDate":"","duration":"","positions":1,"contactPhone":"","contactEmail":"","skills":[]}]}',
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

function normalizeDrafts(raw, meta, sourceText = '') {
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
      warnings,
    };
  });
  return { drafts, warnings: [] };
}

module.exports = { normPhone, normName, buildImportPrompt, normalizeDrafts };
