/**
 * WorkUco — "Empresas para contactar": planilla de empresas del Valle, mensajes por rubro y reglas del texto.
 * El envío lo hace siempre el dueño desde su WhatsApp o su Gmail (nunca automático).
 */
'use strict';
const { normPhone } = require('./importer');

const PUBLISH_URL = 'https://workuco.com.ar/publicar';
const OPT_OUT = 'Si prefieren que no les escribamos más, respondan este mensaje y no los volvemos a contactar.';
const STATUSES = ['pendiente', 'contactada', 'recordatorio', 'registrada', 'no_contactar'];
const MAIL_SUBJECT = 'WorkUco: publiquen sus búsquedas gratis en el Valle de Uco';

/* CSV con comillas ("a, b"), comillas dobles escapadas y fin de línea \n o \r\n */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if (row.some((c) => c.trim())) rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

const clean = (v, n = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
/* fila de la planilla (o del formulario) → empresa; null si no tiene nombre */
function normalizeProspect(r) {
  const get = (...keys) => { for (const k of keys) if (r[k] != null && String(r[k]).trim()) return r[k]; return ''; };
  const name = clean(get('nombre', 'name', 'empresa'), 120);
  if (name.length < 2) return null;
  const email = clean(get('email', 'mail'), 160).toLowerCase();
  const phone = clean(get('telefono', 'phone', 'whatsapp'), 60);
  let web = clean(get('web', 'sitio', 'website'), 200);
  if (web && !/^https?:\/\//i.test(web)) web = `https://${web}`;
  return {
    name, category: clean(get('rubro', 'category'), 60), locality: clean(get('localidad', 'locality'), 60) || 'Tunuyán',
    web: /^https?:\/\/[^\s]+$/i.test(web) ? web : '',
    instagram: clean(get('instagram'), 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, ''),
    email: isEmail(email) ? email : '', phone, phoneNorm: normPhone(phone),
    sourceUrl: clean(get('fuente_url', 'fuente', 'source'), 300), notes: clean(get('notas', 'notes'), 500),
  };
}

/* rubro → grupo, para elegir el mensaje */
function segmentOf(category) {
  const c = String(category || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/bodega|vin|finca|agr|fruta|cosecha|campo|olivo|nogal|vivero/.test(c)) return 'agro';
  if (/hotel|posada|hostel|caba|turis|restaur|resto|bar|cafe|parrilla|gastro|cocina|pizzer|heladeri|panader/.test(c)) return 'turismo';
  if (/constru|obra|corral|arquitect|ingenier|electric|plomer|metal/.test(c)) return 'obra';
  if (/comerc|tienda|ferret|super|almac|kiosco|farmac|libreri|ropa|zapat|mueble|estacion|servicentro|autoservicio|distribu/.test(c)) return 'comercio';
  return 'otros';
}
const SEGMENT_LINE = {
  agro: 'Para la temporada de cosecha, poda o vendimia pueden publicar sus búsquedas (también por día o por temporada) y llegar a gente de la zona que está disponible.',
  turismo: 'Para mozos, cocina, recepción o limpieza, pueden publicar sus búsquedas y recibir los postulantes ordenados, sin perderlos entre mensajes.',
  obra: 'Para obra, oficios o changas, pueden publicar sus búsquedas y encontrar gente de la zona con experiencia.',
  comercio: 'Para atención al público, depósito o reparto, pueden publicar sus búsquedas y recibir los postulantes ordenados en un panel.',
  otros: 'Cuando necesiten sumar a alguien al equipo, pueden publicar su búsqueda y recibir los postulantes ordenados en un panel.',
};

function defaultProspectMessage({ name = '', category = '' }) {
  return `Hola, ¿cómo están? Les escribo de WorkUco, el portal de empleo gratuito del Valle de Uco 😊 Quería contarles que en WorkUco ${name} puede publicar sus búsquedas de personal sin costo, en pocos minutos. ${SEGMENT_LINE[segmentOf(category)]} Si les interesa, pueden registrarse acá: ${PUBLISH_URL}. ¡Muchas gracias por su tiempo! ${OPT_OUT}`;
}

function buildProspectPrompt({ name = '', category = '', locality = '' }) {
  const system = `Escribís un mensaje de WhatsApp o mail de parte de WorkUco, el portal de empleo gratuito del Valle de Uco (Mendoza, Argentina), para presentarle el sitio a una empresa de la zona que todavía no lo conoce.
Tono: respetuoso, profesional y muy amigable, cálido y cercano, en español rioplatense (tratamiento en plural, nunca confianzudo).
El mensaje tiene que:
- Saludar y presentarse como WorkUco en una línea.
- Contar que pueden publicar sus búsquedas de personal gratis y en pocos minutos, y recibir los postulantes ordenados.
- Mencionar un ejemplo que tenga sentido para su rubro (por ejemplo temporada y cosecha para una bodega, mozos y cocina para un restaurante).
- Invitar a registrarse con el marcador {LINK} (no escribas ningún link).
- Agradecer.
Reglas: entre 350 y 650 caracteres; como mucho 1 emoji; no inventes datos de la empresa ni de WorkUco; no prometas resultados ni cantidades de postulantes; no menciones precios ni planes pagos; sin asteriscos ni formato.
Devolvé SOLO JSON: {"mensaje": "..."}`;
  const user = `Empresa: ${name}\nRubro: ${category || 'no especificado'}\nLocalidad: ${locality || 'Valle de Uco'}`;
  return { system, user };
}

/* Texto plano, sin links ajenos, con el link de publicar y siempre con la frase para no recibir más */
function normalizeProspectMessage(raw) {
  let t = typeof raw === 'string' ? raw : String((raw && (raw.mensaje || raw.message)) || '');
  t = t.replace(/```[a-z]*\n?/gi, '').replace(/<[^>]*>/g, '').replace(/\*\*?/g, '').replace(/\r/g, '');
  t = t.replace(/\{LINK\}/g, PUBLISH_URL).replace(/https?:\/\/\S+/g, (u) => (u.startsWith(PUBLISH_URL) ? PUBLISH_URL : ''));
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000);
  if (!t.includes(PUBLISH_URL)) t = `${t}\n${PUBLISH_URL}`;
  if (!/no los volvemos a contactar|no les escribimos más/i.test(t)) t = `${t}\n${OPT_OUT}`;
  return t.trim();
}

module.exports = { parseCsv, normalizeProspect, segmentOf, defaultProspectMessage, buildProspectPrompt, normalizeProspectMessage, STATUSES, MAIL_SUBJECT, PUBLISH_URL, OPT_OUT };
