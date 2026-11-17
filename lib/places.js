'use strict';
/* Guía del Valle: rubros, validación de fichas, horario y "abierto ahora".
   Funciones puras (sin base ni red), usadas por el servidor y probadas en tools/test-places-lib.js. */
const { normPhone } = require('./importer');
const { LOCALITIES } = require('./store');

const SECTIONS = {
  oficios: {
    label: 'Oficios',
    categories: ['Electricista', 'Gasista', 'Albañil', 'Plomero', 'Pintor', 'Carpintero', 'Herrero', 'Techista',
      'Refrigeración', 'Cerrajero', 'Jardinero', 'Fletes', 'Otro'],
  },
  servicios: {
    label: 'Servicios',
    categories: ['Lavadero', 'Mecánico', 'Gomería', 'Lavadero de autos', 'Peluquería y barbería', 'Estética',
      'Veterinaria', 'Informática y celulares', 'Costura', 'Profesionales', 'Otro'],
  },
  salidas: {
    label: 'Salidas',
    categories: ['Boliche', 'Bar', 'Ciber y gamer', 'Eventos y salones', 'Deportes y canchas', 'Otro'],
  },
  comida: {
    label: 'Comida',
    categories: ['Restaurante', 'Rotisería', 'Pizzería', 'Parrilla', 'Delivery', 'Panadería', 'Heladería', 'Café', 'Otro'],
  },
};

const DAYS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const AR_OFFSET = 3 * 3600e3;

/* { mode: 'horario'|'24h'|'turno', days: { lun: [['09:00','13:00'], …] } } — hasta 2 tramos por día.
   Un tramo con cierre <= apertura pasa la medianoche (boliche 23:00–06:00). */
function normalizeHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.mode === '24h' || raw.mode === 'turno') return { mode: raw.mode, days: {} };
  const days = {};
  let any = false;
  for (const d of DAYS) {
    const list = Array.isArray(raw.days && raw.days[d]) ? raw.days[d] : [];
    days[d] = list
      .filter((r) => Array.isArray(r) && HHMM.test(String(r[0])) && HHMM.test(String(r[1])) && r[0] !== r[1])
      .slice(0, 2)
      .map((r) => [String(r[0]), String(r[1])]);
    if (days[d].length) any = true;
  }
  return any ? { mode: 'horario', days } : null;
}

/* Estado según la hora de Argentina: abierto (hasta cuándo), cerrado (cuándo abre hoy), siempre, con turno o sin dato. */
function openStatus(hours, nowMs = Date.now()) {
  if (!hours) return { state: 'unknown', until: null, opens: null };
  if (hours.mode === '24h') return { state: 'always', until: null, opens: null };
  if (hours.mode === 'turno') return { state: 'appointment', until: null, opens: null };
  const ar = new Date(nowMs - AR_OFFSET);
  const day = ar.getUTCDay();
  const m = ar.getUTCHours() * 60 + ar.getUTCMinutes();
  const today = (hours.days && hours.days[DAYS[day]]) || [];
  const yesterday = (hours.days && hours.days[DAYS[(day + 6) % 7]]) || [];
  for (const [o, c] of yesterday) {
    if (toMin(c) <= toMin(o) && m < toMin(c)) return { state: 'open', until: c, opens: null };
  }
  for (const [o, c] of today) {
    const om = toMin(o); const cm = toMin(c);
    if (cm > om ? m >= om && m < cm : m >= om) return { state: 'open', until: c, opens: null };
  }
  const next = today.map(([o]) => o).filter((o) => toMin(o) > m).sort()[0] || null;
  return { state: 'closed', until: null, opens: next };
}

/* Handle de Instagram: acepta "@x", "x" o la URL del perfil. */
function normInstagram(v) {
  let s = String(v || '').trim();
  const url = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (url) s = url[1];
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : '';
}

function waLink(phone) {
  const n = normPhone(phone);
  return n && n.length === 10 ? `https://wa.me/549${n}` : '';
}

const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMulti = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const phoneOk = (p) => normPhone(p).length === 10;

function validatePlace(b = {}, { admin = false } = {}) { // eslint-disable-line no-unused-vars
  const errors = {};
  const name = cleanText(b.name, 80);
  const section = Object.prototype.hasOwnProperty.call(SECTIONS, b.section) ? b.section : '';
  const category = section && SECTIONS[section].categories.includes(b.category) ? b.category : '';
  const localities = [...new Set((Array.isArray(b.localities) ? b.localities : []).filter((l) => LOCALITIES.includes(l)))];
  const description = cleanMulti(b.description, 1500);
  const whatsapp = cleanText(b.whatsapp, 40);
  const phone = cleanText(b.phone, 40);
  const website = /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(String(b.website || '').trim()) ? String(b.website).trim().slice(0, 200) : '';

  if (name.length < 2) errors.name = 'Poné el nombre (al menos 2 letras)';
  if (!section) errors.section = 'Elegí una sección';
  else if (!category) errors.category = 'Elegí un rubro de la lista';
  if (!localities.length) errors.localities = 'Elegí al menos una localidad';
  if (description.length < 20) errors.description = 'Contá qué hacés en al menos 20 caracteres';
  if (whatsapp && !phoneOk(whatsapp)) errors.whatsapp = 'Revisá el WhatsApp (con característica, ej. 2622 555123)';
  if (phone && !phoneOk(phone)) errors.phone = 'Revisá el teléfono (con característica)';
  if (!whatsapp && !phone) errors.whatsapp = 'Poné un WhatsApp o un teléfono para que te contacten';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      name, section, category, localities,
      address: cleanText(b.address, 120),
      homeService: section === 'oficios' && (b.homeService === true || b.homeService === 1 || b.homeService === '1'),
      description,
      whatsapp: phoneOk(whatsapp) ? whatsapp : '',
      phone: phoneOk(phone) ? phone : '',
      instagram: normInstagram(b.instagram),
      website,
      hours: normalizeHours(b.hours),
    },
  };
}

module.exports = { SECTIONS, DAYS, normalizeHours, openStatus, normInstagram, waLink, validatePlace };
