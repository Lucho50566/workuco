'use strict';
/* Certificados de trabajo: reglas puras (código, validación y textos). */
const crypto = require('crypto');
const { hasContactData } = require('./vecinos');

/* sin letras que se confunden: 0/O, 1/I/L */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const MAX_POSITION = 80;
const MAX_COMMENT = 280;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function newCode(randomBytes = crypto.randomBytes) {
  return [...randomBytes(CODE_LEN)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

function normCode(s) {
  const c = String(s == null ? '' : s).toUpperCase().replace(/[\s-]/g, '');
  return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch)) ? c : '';
}

const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/* AAAA-MM-DD que existe de verdad (2026-02-30 no) */
function realDate(s) {
  const v = String(s == null ? '' : s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v ? v : '';
}
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/* Datos que carga la empresa al dar el certificado. */
function validateIssue(b = {}, { appliedDate, today, defaultPosition = '' } = {}) {
  const errors = {};
  const position = String(b.position == null || b.position === '' ? defaultPosition : b.position).replace(/\s+/g, ' ').trim();
  if (!position) errors.position = 'Escribí el puesto';
  else if (position.length > MAX_POSITION) errors.position = `Hasta ${MAX_POSITION} caracteres`;
  const startDate = realDate(b.startDate);
  const endDate = realDate(b.endDate);
  if (!startDate) errors.startDate = 'Elegí una fecha válida';
  else if (appliedDate && startDate < addDays(appliedDate, -1)) errors.startDate = 'No puede ser anterior a la postulación';
  if (!endDate) errors.endDate = 'Elegí una fecha válida';
  else if (today && endDate > today) errors.endDate = 'El trabajo tiene que haber terminado';
  else if (startDate && endDate < startDate) errors.endDate = 'Tiene que ser igual o posterior a "desde"';
  const comment = String(b.comment == null ? '' : b.comment).replace(/[ \t]+/g, ' ').trim();
  if (comment.length > MAX_COMMENT) errors.comment = `Hasta ${MAX_COMMENT} caracteres`;
  else if (comment && hasContactData(comment)) errors.comment = 'Sin teléfonos, mails ni links';
  return Object.keys(errors).length ? { errors } : { value: { position, startDate, endDate, comment } };
}

const dateLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MONTHS[m - 1]} de ${y}`; };
const periodLabel = (start, end) => (start === end ? `el ${dateLabel(start)}` : `del ${dateLabel(start)} al ${dateLabel(end)}`);

module.exports = { ALPHABET, CODE_LEN, MAX_POSITION, MAX_COMMENT, newCode, normCode, formatCode, validateIssue, periodLabel, dateLabel };
