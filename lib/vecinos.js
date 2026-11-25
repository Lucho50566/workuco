/* Changas de vecinos: pedidos de particulares (cortar el pasto, ordenar el patio...).
   Reglas puras (sin base de datos): rubros, validación y textos. */
'use strict';

const LOCALITIES = ['San Carlos', 'Tunuyán', 'Tupungato'];
const CATEGORIES = [
  ['jardin', 'Jardín y pasto'],
  ['limpieza', 'Limpieza y orden'],
  ['mudanza', 'Mudanzas y fletes'],
  ['arreglos', 'Arreglos de la casa'],
  ['pintura', 'Pintura'],
  ['mascotas', 'Mascotas'],
  ['otro', 'Otro'],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);
const PAY_UNITS = { trabajo: 'por el trabajo', hora: 'por hora', dia: 'por día' };
const MAX_OPEN_PER_PERSON = 3;
const DEFAULT_TTL_DAYS = 14;

const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const cleanText = (s, n) => String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

/* Nada de teléfonos, mails ni links en el texto público: el contacto pasa siempre por "Me interesa". */
function hasContactData(text) {
  const s = String(text || '');
  if (/(https?:\/\/|www\.|wa\.me|\.com\b|\.ar\b)/i.test(s)) return true;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)) return true;
  return (s.replace(/[\s().-]/g, '').match(/\d{7,}/) || []).length > 0;
}

const todayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/* Valida y normaliza un pedido. Devuelve { value } o { errors } (por campo, en criollo). */
function validateRequest(b = {}) {
  const errors = {};
  const title = clean(b.title, 90);
  const description = cleanText(b.description, 600);
  const category = CATEGORY_LABEL[b.category] ? b.category : '';
  const locality = LOCALITIES.includes(b.locality) ? b.locality : '';
  const area = clean(b.area, 40);
  /* una fecha real (2026-02-30 o 2026-99-99 no pasan) */
  const rawDate = String(b.whenDate || '');
  const whenDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(`${rawDate}T12:00:00Z`))
    && new Date(`${rawDate}T12:00:00Z`).toISOString().slice(0, 10) === rawDate ? rawDate : '';
  if (rawDate && !whenDate) return { errors: { whenDate: 'Esa fecha no existe' } };
  const whenNote = clean(b.whenNote, 40);
  const payUnit = PAY_UNITS[b.payUnit] ? b.payUnit : 'trabajo';
  const payRaw = String(b.pay == null ? '' : b.pay).replace(/[.\s$]/g, '');
  const pay = payRaw === '' ? 0 : Math.round(Number(payRaw));

  if (title.length < 8) errors.title = 'Contá en una frase qué necesitás (por ejemplo: "Cortar el pasto del fondo")';
  if (!category) errors.category = 'Elegí un rubro';
  if (!locality) errors.locality = 'Elegí la localidad';
  if (!Number.isFinite(pay) || pay < 0 || pay > 5000000) errors.pay = 'Poné un monto válido o dejalo vacío para "a convenir"';
  if (whenDate) {
    const t = todayAR();
    if (whenDate < t) errors.whenDate = 'La fecha ya pasó';
    else if (whenDate > addDays(t, 60)) errors.whenDate = 'Elegí una fecha dentro de los próximos 2 meses';
  }
  for (const [k, v] of [['title', title], ['description', description], ['area', area], ['whenNote', whenNote]]) {
    if (!errors[k] && hasContactData(v)) errors[k] = 'Sin teléfonos, mails ni links: los interesados te contactan por WorkUco';
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { title, description, category, locality, area, whenDate, whenNote, pay, payUnit } };
}

const payLabel = (r) => (r.pay > 0 ? `$ ${Number(r.pay).toLocaleString('es-AR')} ${PAY_UNITS[r.payUnit || r.pay_unit] || ''}`.trim() : 'A convenir');

/* Mensaje que abre el WhatsApp del vecino hacia la persona interesada. */
function waMessage({ ownerFirstName, personFirstName, title }) {
  return `Hola ${personFirstName || ''}, soy ${ownerFirstName || 'quien publicó el pedido'}. Te escribo por tu interés en "${title}" en WorkUco. ¿Coordinamos?`.replace(/\s+/g, ' ');
}
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

module.exports = { LOCALITIES, CATEGORIES, CATEGORY_LABEL, PAY_UNITS, MAX_OPEN_PER_PERSON, DEFAULT_TTL_DAYS, validateRequest, hasContactData, payLabel, waMessage, firstName };
