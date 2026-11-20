/**
 * WorkUco — Portal de empleo del Valle de Uco
 * Servidor HTTP sin dependencias: API JSON + SQLite + frontend estático.
 *
 *   node server.js            -> http://localhost:4250
 *   PORT=8080 node server.js
 *   WORKUCO_DATA=/ruta/data node server.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  Store, uid, now, jparse, IMPORT_REASONS,
  LOCALITIES, CATEGORIES, TYPES, MODALITIES, BENEFITS, STAGES, STAGE_LABEL, SALARY_PERIODS, MONTH_FACTOR,
} = require('./lib/store');
const { matchScore, norm } = require('./lib/match');
const { TEMPLATES } = require('./lib/templates');
const { normPhone, normName, buildImportPrompt, normalizeDrafts, crossCheck, groundDrafts, defaultClaimMessage, buildClaimMessagePrompt, normalizeClaimMessage } = require('./lib/importer');
const demo = require('./lib/demo');
const ai = require('./lib/ai');
const { extractCv } = require('./lib/cvtext');
const legal = require('./lib/legal');
const seo = require('./lib/seo');
const placesLib = require('./lib/places');
const servicesLib = require('./lib/services');
const mp = require('./lib/mp');
const cvpro = require('./lib/cvpro');
const { createMailer, emailHtml, emailText } = require('./lib/mail');
const DEMO = process.env.WORKUCO_DEMO === '1';

const ROOT = __dirname;
const WEB = path.join(ROOT, 'public');
const DATA = process.env.WORKUCO_DATA ? path.resolve(process.env.WORKUCO_DATA) : path.join(ROOT, 'data');
const CV_DIR = path.join(DATA, 'cv');
const UP_DIR = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'workuco.sqlite');
const PORT = Number(process.env.PORT || 4250);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const ADMIN_EMAIL = (process.env.WORKUCO_ADMIN_EMAIL || 'admin@workuco.com.ar').toLowerCase();
const ADMIN_PASS = process.env.WORKUCO_ADMIN_PASS || 'workuco2026';
const INVITE_LIMIT = Number(process.env.WORKUCO_INVITE_LIMIT) || 20; // invitaciones por empresa por día
const MAX_ALERTS = 10;
const MAX_FLYERS = 5;
const IMPORT_FAKE = process.env.WORKUCO_IMPORT_AI_FAKE === '1'; // sólo para pruebas: IA simulada
const CONTACT_WA = process.env.WORKUCO_CONTACT_WA || '';
/* lanzamiento: mientras valga 1 (por defecto), destacar avisos es gratis y el panel lo dice */
const LAUNCH_FREE = process.env.WORKUCO_LAUNCH_FREE !== '0';
const FEATURED_DAYS = [7, 15, 30];
const IMPORT_FAKE_REPLY = { avisos: [
  { title: 'Mozo para restaurante', companyName: 'Resto El Álamo', locality: 'Tunuyán', category: 'Gastronomía', type: 'Medio tiempo', modality: 'Presencial',
    description: 'Resto El Álamo busca mozo o moza para el turno noche en el centro de Tunuyán. Se valora experiencia en salón y buena atención.', contactPhone: '2622 15-555123' },
  { title: 'Cosechadores de manzana', companyName: 'Finca Las Pircas', locality: 'Tunuyán', category: 'Agricultura', type: 'Temporal', modality: 'Presencial', gig: true,
    salaryMin: 30000, salaryPeriod: 'día', duration: '3 semanas',
    description: 'Finca Las Pircas busca cosechadores de manzana para la temporada. Pago por jornada y traslado desde la plaza de Tunuyán.', contactPhone: '+54 9 2622 444777' },
] };
/* Fecha AR + n días (AAAA-MM-DD) */
const addDaysAR = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400000).toISOString().slice(0, 10);

fs.mkdirSync(CV_DIR, { recursive: true });
fs.mkdirSync(UP_DIR, { recursive: true });
const store = new Store(DB_FILE);
store.cleanSessions();

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const send = (res, code, obj, headers = {}) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
};
const clean = (s, n = 500) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const cleanMultiline = (s, n = 5000) => String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
const phoneOk = (s) => String(s || '').replace(/\D/g, '').length >= 6;
const arrOf = (v, max = 20, len = 40) => (Array.isArray(v) ? v : [])
  .map((x) => clean(x, len)).filter(Boolean).slice(0, max);

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('El archivo o formulario es demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const raw = part.slice(i + 1).trim();
      try { out[k] = decodeURIComponent(raw); } catch (_) { out[k] = raw; }
    }
  }
  return out;
}

/* Fecha local de Argentina (UTC-3), independiente del TZ del servidor. */
const todayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/* Solo URLs http(s) en el sitio web de la empresa. */
const cleanUrl = (s) => {
  const v = clean(s, 200);
  return /^https?:\/\//i.test(v) ? v : '';
};

function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pass), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(pass, stored) {
  try {
    const [alg, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt' || !salt || !hash) return false;
    const test = crypto.scryptSync(String(pass), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return test.length === expected.length && crypto.timingSafeEqual(test, expected);
  } catch (_) { return false; }
}

const SESSION_TTL = 30 * 24 * 3600e3;
function setSession(res, role, req, ids = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  store.createSession(token, role, ids.companyId || null, SESSION_TTL, ids.candidateId || null);
  const secure = /https/i.test(req.headers['x-forwarded-proto'] || '') || /^https:/.test(PUBLIC_URL) ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `wk_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL / 1000)};${secure}`);
  return token;
}
function clearSession(req, res) {
  const token = parseCookies(req).wk_sess;
  if (token) store.deleteSession(token);
  res.setHeader('Set-Cookie', 'wk_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* Imágenes: se guardan como archivo, nunca como base64 en la base. */
const IMG_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', magic: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png', mime: 'image/png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', magic: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];
function parseDataUrl(v) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(v || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) return null;
  const type = IMG_TYPES.find((t) => t.magic(buf));
  if (!type) return null;
  return { buf, ext: type.ext, mime: type.mime };
}
function saveImage(dataUrl, prefix = 'img') {
  const img = parseDataUrl(dataUrl);
  if (!img) { const e = new Error('La imagen no es válida (usá JPG, PNG o WebP)'); e.status = 400; throw e; }
  if (img.buf.length > 5 * 1024 * 1024) { const e = new Error('La imagen supera los 5 MB'); e.status = 413; throw e; }
  const name = `${prefix}-${uid('')}.${img.ext}`;
  fs.writeFileSync(path.join(UP_DIR, name), img.buf);
  return name;
}
const mediaUrl = (f) => (f ? (/^https?:|^\//.test(f) ? f : `/media/${f}`) : null);
const galleryUrls = (list) => jparse(list, []).map(mediaUrl).filter(Boolean);

function publicCompany(c, { privateView = false } = {}) {
  if (!c) return null;
  const out = {
    id: c.id, name: c.name, email: privateView ? c.email : undefined,
    phone: c.phone || '', website: c.website || '', description: c.description || '',
    locality: c.locality || '', verified: !!c.verified, plan: c.plan, claimed: c.claimed !== 0,
    logo: mediaUrl(c.logo_file), gallery: galleryUrls(c.gallery),
    createdAt: c.created_at,
  };
  if (privateView) {
    out.employees = c.employees || '';
    out.serviceInterest = servicesLib.interestOf(c);
    out.mailNotices = !c.mail_opt_out;
    out.prefs = prefsOf('company', c);
    const cfg = ai.configOf(c);
    out.ai = {
      provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl,
      enabled: cfg.enabled, auto: cfg.auto, hasKey: !!cfg.apiKey,
      keyMask: cfg.apiKey ? `${cfg.apiKey.slice(0, 3)}••••${cfg.apiKey.slice(-4)}` : '',
    };
  }
  return out;
}

function publicCandidate(c, { privateView = false } = {}) {
  if (!c) return null;
  const out = {
    id: c.id, name: c.name, phone: privateView ? c.phone : '',
    locality: c.locality || '', headline: c.headline || '', about: c.about || '',
    skills: jparse(c.skills, []), experience: c.experience || '', education: c.education || '',
    availability: c.availability || '', linkedin: c.linkedin || '',
    photo: c.photo_file ? `/api/photo/c/${c.id}` : null,
    hasCv: !!c.cv_file, cvName: c.cv_name || '',
    openToWork: !!c.open_to_work, categories: jparse(c.categories, []),
    createdAt: c.created_at,
  };
  if (privateView) {
    out.email = c.email; out.cvUrl = c.cv_file ? `/api/cv/c/${c.id}` : null;
    out.salaryMin = c.salary_min || 0; out.isPublic = !!c.is_public; out.publicSlug = c.public_slug || '';
    out.mailNotices = !c.mail_opt_out;
    out.prefs = prefsOf('candidate', c);
  }
  return out;
}

function current(req) {
  const token = parseCookies(req).wk_sess;
  if (!token) return null;
  const s = store.session(token);
  if (!s) return null;
  if (s.role === 'admin') return { role: 'admin', email: ADMIN_EMAIL };
  if (s.role === 'company') {
    const c = store.company(s.company_id);
    if (!c) return null;
    return { role: 'company', company: publicCompany(c, { privateView: true }) };
  }
  if (s.role === 'candidate') {
    const c = store.candidate(s.candidate_id);
    if (!c) return null;
    return { role: 'candidate', candidate: publicCandidate(c, { privateView: true }) };
  }
  return null;
}

/* Anti fuerza bruta en logins */
const fails = new Map();
const throttleKey = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').toString().split(',')[0];
function throttled(req) {
  const f = fails.get(throttleKey(req));
  return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0;
}
function loginFailed(req) {
  const k = throttleKey(req);
  const f = fails.get(k) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 8) { f.until = now() + 10 * 60000; f.n = 0; }
  fails.set(k, f);
}

/* CSRF básico: si el navegador manda Origin, debe coincidir con el host. */
function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === (req.headers['x-forwarded-host'] || req.headers.host); }
  catch (_) { return false; }
}

/* Validación de una oferta */
function validateJob(b, { hasFlyer = false } = {}) {
  const errors = {};
  const title = clean(b.title, 120);
  const description = cleanMultiline(b.description, 8000);
  const locality = LOCALITIES.includes(b.locality) ? b.locality : '';
  const category = CATEGORIES.includes(b.category) ? b.category : '';
  const type = TYPES.includes(b.type) ? b.type : '';
  const modality = MODALITIES.includes(b.modality) ? b.modality : '';
  if (title.length < 5) errors.title = 'El puesto debe tener al menos 5 caracteres';
  const minDesc = hasFlyer ? 20 : 60;
  if (description.length < minDesc) errors.description = `Describí el puesto con al menos ${minDesc} caracteres`;
  if (!locality) errors.locality = 'Elegí una localidad';
  if (!category) errors.category = 'Elegí una categoría';
  if (!type) errors.type = 'Elegí el tipo de empleo';
  if (!modality) errors.modality = 'Elegí la modalidad';
  const contactEmail = clean(b.contactEmail, 160).toLowerCase();
  if (!isEmail(contactEmail)) errors.contactEmail = 'Email de contacto inválido';
  const closesAt = clean(b.closesAt, 10);
  if (closesAt && !/^\d{4}-\d{2}-\d{2}$/.test(closesAt)) errors.closesAt = 'Fecha de cierre inválida';
  const amount = (v) => Math.min(99999999, Math.max(0, Math.round(Number(v) || 0)));
  let salaryMin = amount(b.salaryMin);
  const salaryMax = amount(b.salaryMax);
  if (!salaryMin && salaryMax) salaryMin = salaryMax;
  if (salaryMax && salaryMax < salaryMin) errors.salaryMax = 'El máximo no puede ser menor que el mínimo';
  const startDate = clean(b.startDate, 10);
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.startDate = 'Fecha de inicio inválida';
  return {
    ok: Object.keys(errors).length === 0, errors,
    data: {
      title, description, locality, category, type, modality,
      responsibilities: cleanMultiline(b.responsibilities, 4000),
      requirements: cleanMultiline(b.requirements, 4000),
      experience: clean(b.experience, 160),
      schedule: clean(b.schedule, 160),
      salary: clean(b.salary, 120),
      contactEmail,
      contactPhone: clean(b.contactPhone, 60),
      closesAt,
      benefits: arrOf(b.benefits, 12, 40),
      positions: Math.min(99, Math.max(1, Number(b.positions) || 1)),
      salaryMin, salaryMax,
      salaryPeriod: SALARY_PERIODS.includes(b.salaryPeriod) ? b.salaryPeriod : 'mes',
      skills: arrOf(b.skills, 8, 30),
      gig: b.gig === true || b.gig === 1 || b.gig === '1',
      startDate, duration: clean(b.duration, 60),
    },
  };
}

/* Resumen público de una oferta (listados, recomendadas, invitaciones). */
function jobSummary(j) {
  return {
    id: j.id, title: j.title, companyId: j.companyId, companyName: j.companyName, companyVerified: j.companyVerified,
    companyLogo: j.companyLogo, companyGallery: j.companyGallery,
    locality: j.locality, category: j.category, type: j.type, modality: j.modality,
    salary: j.salary, salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryPeriod: j.salaryPeriod, salaryLabel: j.salaryLabel,
    skills: j.skills, gig: j.gig, startDate: j.startDate, duration: j.duration, positions: j.positions,
    sourceKind: j.sourceKind, sourceName: j.sourceName, flyer: j.flyer, flyers: j.flyers,
    featured: j.featured, featuredUntil: j.featured ? j.featuredUntil : null, createdAt: j.createdAt, publishedAt: j.publishedAt, closesAt: j.closesAt,
    cosecha: !!j.cosecha,
  };
}

/* Compatibilidad entre una persona (fila de la base) y una oferta. null si el perfil está vacío. */
function matchFor(c, j, audience = 'candidate') {
  if (!c || !j) return null;
  const f = MONTH_FACTOR[j.salaryPeriod] || 1;
  const m = matchScore({
    skills: jparse(c.skills, []), locality: c.locality, localities: jparse(c.pref_localities, []), headline: c.headline, experience: c.experience,
    availability: c.availability, categories: jparse(c.categories, []), salaryMin: c.salary_min || 0,
  }, { ...j, salaryMin: j.salaryMin * f, salaryMax: j.salaryMax * f }, { audience });
  return m.score == null ? null : m;
}
const byMatchDesc = (a, b) => ((b.match ? b.match.score : -1) - (a.match ? a.match.score : -1));

/* Suma la compatibilidad a cada postulación que vino de un perfil. */
function withMatch(applications) {
  const jobs = new Map();
  const jobOf = (id) => { if (!jobs.has(id)) jobs.set(id, store.job(id)); return jobs.get(id); };
  return applications.map((a) => (a.candidateId
    ? { ...a, match: matchFor(store.candidate(a.candidateId), jobOf(a.jobId), 'company') } : a));
}

/* Las notificaciones nunca pueden hacer fallar la acción que las origina. */
/* ---------- mails (Resend) ---------- */
const MAILER = createMailer({
  apiKey: process.env.RESEND_API_KEY || '',
  from: process.env.WORKUCO_MAIL_FROM || 'WorkUco <onboarding@resend.dev>',
  replyTo: legal.legalInfo().email,
  fakeFile: process.env.WORKUCO_MAIL_FAKE === '1' ? path.join(DATA, 'outbox.jsonl') : '',
});
/* Los links de los mails salen SIEMPRE de PUBLIC_URL, nunca del Host del pedido
   (si no, alguien podría pedir un "recuperar contraseña" que apunte a otro sitio). */
const mailOrigin = () => PUBLIC_URL || `http://localhost:${PORT}`;
/* direcciones de ejemplo o de fichas importadas: no se les escribe */
const mailable = (email) => !!email && isEmail(email) && !/@(demo\.workuco|import\.workuco)$/i.test(email);

/* avisar por Gmail a una empresa importada: se abre la cuenta de Gmail del admin con todo cargado */
const IMPORT_MAIL_SUBJECT = 'Publicamos su búsqueda en WorkUco';
const gmailCompose = (email, message) => (email && message
  ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(IMPORT_MAIL_SUBJECT)}&body=${encodeURIComponent(message)}` : '');
function importEmailOf(companyId) {
  const r = store.one("SELECT contact_email FROM jobs WHERE company_id=? AND contact_email IS NOT NULL AND contact_email<>'' ORDER BY created_at DESC LIMIT 1", companyId);
  const e = r ? String(r.contact_email).trim().toLowerCase() : '';
  return isEmail(e) ? e : '';
}

function sendMail(to, { subject, title, body, cta, why }) {
  if (!mailable(to)) return Promise.resolve({ ok: false, error: 'dirección no habilitada' });
  const footer = `${why ? `${why} ` : ''}WorkUco · Empleos en el Valle de Uco · <a href="${mailOrigin()}/privacidad" style="color:#56615a">Privacidad</a>`;
  return MAILER.send({
    to, subject: subject || title,
    html: emailHtml({ title, body, cta, footer }),
    text: emailText({ title, body, cta, footerText: `${why || ''} WorkUco · ${mailOrigin()}`.trim() }),
  });
}

/* Tipos de aviso que cada cuenta puede prender o apagar por mail (la campanita recibe todo). */
const MAIL_TYPES = { candidate: ['postulaciones', 'invitaciones', 'alertas', 'guia'], company: ['postulantes', 'avisos', 'guia'] };
const MAIL_KIND = {
  candidate: { etapa: 'postulaciones', invitacion: 'invitaciones', alerta: 'alertas', guia: 'guia' },
  company: { postulacion: 'postulantes', oferta: 'avisos', guia: 'guia' },
};
const parseObj = (v) => { try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (_) { return {}; } };
function mailPrefsOf(role, row) {
  const saved = parseObj(row && row.mail_prefs);
  return Object.fromEntries((MAIL_TYPES[role] || []).map((t) => [t, !(row && row.mail_opt_out) && saved[t] !== false]));
}
function prefsOf(role, row) {
  const mail = mailPrefsOf(role, row);
  if (role !== 'candidate') return { mail };
  return {
    localities: jparse(row.pref_localities, []), types: jparse(row.pref_types, []),
    modalities: jparse(row.pref_modalities, []), gigs: row.pref_gigs !== 0, mail,
  };
}

/* Cada aviso de la campanita también llega por mail, salvo que la cuenta haya apagado ese tipo. */
function mailNotice(type, id, data) {
  const row = type === 'candidate' ? store.candidate(id) : type === 'company' ? store.company(id) : null;
  if (!row || row.mail_opt_out || (type === 'company' && row.claimed === 0)) return;
  const kindType = (MAIL_KIND[type] || {})[data.kind];
  if (kindType && mailPrefsOf(type, row)[kindType] === false) return;
  const settings = type === 'candidate' ? '/mi-perfil' : '/panel#empresa';
  /* el asunto puede verse en la pantalla bloqueada: sin el nombre de quien se postuló */
  const msg = data.kind === 'postulacion'
    ? { title: `Nueva postulación para "${data.body}"`, body: 'Entrá a tu panel para ver el perfil, el mensaje y el CV.' }
    : { title: data.title, body: data.body || '' };
  sendMail(row.email, {
    title: msg.title, body: msg.body,
    cta: data.link ? { label: 'Ver en WorkUco', url: `${mailOrigin()}${data.link}` } : null,
    why: `Te llega porque tenés una cuenta en WorkUco. Podés apagar estos avisos en ${mailOrigin()}${settings} ("Tus datos").`,
  }).catch(() => {});
}

function tryNotify(type, id, data) {
  try { store.notify(type, id, data); } catch (e) { console.warn('Notificación:', e.message); }
  try { mailNotice(type, id, data); } catch (e) { console.warn('Aviso por mail:', e.message); }
}

/* ---------- cobro de destacados (Mercado Pago) ---------- */
/* precios y "cobrar sí/no" se manejan desde el panel de admin; la clave de Mercado Pago, en el servidor */
function payConfig() {
  const prices = {};
  for (const d of FEATURED_DAYS) {
    const v = Number(store.adminMeta(`price_${d}`)) || 0;
    if (v > 0) prices[d] = v;
  }
  const charge = store.adminMeta('charge_featured') === '1';
  /* Mercado Pago avisa y vuelve por https: sin una dirección pública https no se cobra */
  const enabled = mp.connected() && charge && mp.isPublicHttps(PUBLIC_URL) && Object.keys(prices).length > 0;
  return { charge, prices, enabled };
}

/* ---------- CV Pro ---------- */
const CV_PRICE_DEFAULT = 5000;
const CV_MAX_VERSIONS = 3; // antes de pagar (la primera incluida)
const CV_MAX_DAILY = 3; // análisis por día por cuenta
/* la IA del CV Pro es la del servidor (la misma del importador) */
const cvProAi = () => !!(IMPORT_FAKE || ai.importConfig());
function cvSettings() {
  return { cvPrice: Number(store.adminMeta('price_cv')) || CV_PRICE_DEFAULT, sellCv: store.adminMeta('sell_cv') === '1' };
}
/* ---------- Pack Cosecha ---------- */
const COSECHA_DAYS = 30;
const COSECHA_INVITES = 100; // invitaciones por día con el pack
function cosechaConfig() {
  const price = Number(store.adminMeta('price_cosecha')) || 0;
  const sell = store.adminMeta('sell_cosecha') === '1';
  return { price, sell, enabled: sell && price > 0 && mp.connected() && mp.isPublicHttps(PUBLIC_URL) };
}
const inviteLimit = (companyId) => (store.cosechaActive(companyId) ? COSECHA_INVITES : INVITE_LIMIT);
function cosechaState(companyId) {
  const c = store.company(companyId);
  const cfg = cosechaConfig();
  const active = store.cosechaActive(companyId);
  return {
    active, until: active ? c.cosecha_until : null, requested: !!c.cosecha_req_at,
    eligible: store.cosechaEligible(companyId).length, featured: store.cosechaFeaturedCount(companyId),
    price: cfg.price, payEnabled: cfg.enabled, launchFree: LAUNCH_FREE, inviteLimit: inviteLimit(companyId),
    days: COSECHA_DAYS, maxJobs: 5,
  };
}
function activateCosechaFor(companyId, days, body) {
  const r = store.activateCosecha(companyId, days);
  if (r) {
    tryNotify('company', companyId, {
      kind: 'oferta', title: 'Tu Pack Cosecha está activo',
      body: body || `Hasta el ${new Date(r.until - 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/')}: tus avisos de cosecha salen arriba y podés invitar hasta ${COSECHA_INVITES} personas por día.`,
      link: '/panel',
    });
  }
  return r;
}

function cvProConfig() {
  const s = cvSettings();
  const enabled = cvProAi();
  return { enabled, price: s.cvPrice, canPay: enabled && s.sellCv && mp.connected() && mp.isPublicHttps(PUBLIC_URL) };
}
/** Pide algo a la IA del servidor y devuelve el JSON (o la respuesta simulada en pruebas). */
async function cvAi(prompt, { images = [], fake }) {
  if (IMPORT_FAKE) return fake();
  const cfg = ai.importConfig();
  if (!cfg) { const e = new Error('El servicio no está disponible en este momento'); e.status = 503; throw e; }
  const out = await ai.callProvider(cfg, { ...prompt, images, maxTokens: 4000 });
  return ai.parseJson(out);
}
/** Lo que la persona dio (perfil), en texto: sirve para la IA y para el control anti-invención. */
function cvProfileOf(c) {
  return {
    name: c.name, email: c.email, phone: c.phone || '', locality: c.locality || '', headline: c.headline || '', about: c.about || '',
    skills: jparse(c.skills, []), experience: c.experience || '', education: c.education || '', availability: c.availability || '',
  };
}
/** Lo que ve la persona: sin el texto original; antes de pagar, el CV recortado. */
function cvOrderOut(o) {
  const { sourceText, candidateId, ...rest } = o;
  return { ...rest, cv: o.cv ? (o.status === 'pagado' ? o.cv : cvpro.previewCv(o.cv)) : null };
}
async function cvGenerate(order, cand, { inputs, request }) {
  const extracted = (order.analysis && order.analysis.extracted) || {};
  const raw = await cvAi(cvpro.generatePrompt({ extracted, inputs, request }), { fake: () => cvpro.fakeCv(extracted) });
  const corpus = cvpro.allowedCorpus(order.sourceText, extracted, inputs, cvProfileOf(cand));
  return cvpro.normalizeCv(raw, corpus);
}
/**
 * Aplica un pago de Mercado Pago: lo consulta con nuestra clave (nunca se cree el aviso tal cual),
 * controla referencia, estado, moneda y monto, y lo aplica una sola vez según el tipo:
 * 'destacado' → destaca el aviso; 'cv' → marca pagada la orden de CV Pro.
 * Con ownerId (y kind), sólo lo aplica si el pago es de esa cuenta y de ese tipo (si no, devuelve null).
 */
async function settlePayment(mpPaymentId, { companyId = null, kind = null } = {}) {
  const p = await mp.getPayment(mpPaymentId);
  const row = store.payment(p.external_reference);
  if (!row || (companyId && row.company_id !== companyId) || (kind && ![].concat(kind).includes(row.kind))) return null;
  if (p.status === 'approved') {
    if (p.currency_id !== 'ARS' || Number(p.transaction_amount) < row.amount) {
      store.setPaymentStatus(row.id, 'monto_incorrecto', p.id);
      console.warn(`Pago ${p.id}: monto o moneda distintos (${p.transaction_amount} ${p.currency_id}, esperado ${row.amount} ARS)`);
    } else if (store.approvePayment(row.id, p.id)) {
      /* approvePayment devuelve true sólo la primera vez: lo que sigue pasa una sola vez por pago */
      if (row.kind === 'cosecha') {
        activateCosechaFor(row.company_id, row.days || COSECHA_DAYS, `Pago aprobado por $ ${row.amount.toLocaleString('es-AR')}. Tus avisos de cosecha salen arriba y podés invitar hasta ${COSECHA_INVITES} personas por día.`);
      } else if (row.kind === 'cv') {
        if (row.ref_id && store.payCvOrder(row.ref_id, p.id)) {
          tryNotify('candidate', row.company_id, {
            kind: 'cvpro', title: 'Tu CV Pro ya está listo para descargar',
            body: `Pago aprobado por $ ${row.amount.toLocaleString('es-AR')}. Podés bajarlo y ajustarlo cuando quieras.`, link: `/cv-pro/${row.ref_id}`,
          });
        }
      } else {
        const j = store.job(row.job_id);
        /* si ya estaba destacado, los días se suman a los que le quedaban; uno sin vencimiento queda igual */
        if (j && !(j.featured && j.featuredUntil == null)) {
          const base = Math.max(Date.now(), j.featured && j.featuredUntil ? j.featuredUntil : 0);
          store.setJobFeatured(j.id, base + row.days * 86400000);
        }
        tryNotify('company', row.company_id, {
          kind: 'oferta', title: `Tu aviso quedó destacado por ${row.days} días`,
          body: `${row.job_title} — pago aprobado por $ ${row.amount.toLocaleString('es-AR')}`, link: '/panel#ofertas',
        });
      }
    }
  } else if (['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(p.status)) {
    store.setPaymentStatus(row.id, p.status, p.id);
  }
  return store.payment(row.id);
}

/* recuperar contraseña: código aleatorio por mail; en la base sólo queda su hash */
const RESET_TTL = 60 * 60 * 1000;
const forgotByIp = new Map();
function forgotLimited(req) {
  const key = throttleKey(req);
  const recent = (forgotByIp.get(key) || []).filter((t) => t > Date.now() - 60 * 60 * 1000);
  recent.push(Date.now());
  forgotByIp.set(key, recent);
  if (forgotByIp.size > 5000) forgotByIp.clear();
  return recent.length > 10;
}
const resetHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

const STAGE_NOTICE = {
  revisado: (c, t) => ['Tu postulación está en revisión', `${c} está mirando tu perfil para ${t}.`],
  entrevista: (c, t) => ['¡Te quieren entrevistar!', `${c} quiere conocerte por el puesto de ${t}. Estate atento/a al teléfono.`],
  ofrecido: (c, t) => ['¡Recibiste una oferta!', `${c} te hizo una propuesta por el puesto de ${t}.`],
  contratado: (c, t) => ['¡Felicitaciones, quedaste!', `${c} te eligió para el puesto de ${t}.`],
  descartado: (c, t) => ['Novedades de tu postulación', `${c} siguió con otros perfiles para ${t}. Gracias por postularte: hay más búsquedas para vos.`],
};

/* una alerta puede tener una localidad o varias ("San Carlos,Tunuyán", de las preferencias) */
const alertLocs = (a) => String(a.locality || '').split(',').filter(Boolean);
function alertLabel(a) {
  return [a.q ? `"${a.q}"` : '', a.gig ? 'Changas' : '', a.category, alertLocs(a).join(' o '), a.type, a.modality].filter(Boolean).join(' · ');
}
function alertMatches(a, j) {
  if (alertLocs(a).length && !alertLocs(a).includes(j.locality)) return false;
  if (a.category && a.category !== j.category) return false;
  if (a.type && a.type !== j.type) return false;
  if (a.modality && a.modality !== j.modality) return false;
  if (a.gig && !j.gig) return false;
  if (a.q && !norm(`${j.title} ${j.description} ${j.companyName}`).includes(norm(a.q))) return false;
  return true;
}
/* Al publicarse una oferta: avisa a la empresa y a cada persona con una alerta que coincide (una vez). */
function announceJob(j) {
  tryNotify('company', j.companyId, { kind: 'oferta', title: 'Tu aviso ya está publicado', body: j.title, link: `/oferta/${j.id}` });
  if (!store.claimAnnouncement(j.id)) return; // ya se avisó a las alertas: no repetir al reaprobar
  try {
    const seen = new Set();
    for (const a of store.allAlerts()) {
      if (seen.has(a.candidateId) || !alertMatches(a, j)) continue;
      seen.add(a.candidateId);
      tryNotify('candidate', a.candidateId, {
        kind: 'alerta', title: `Nueva oferta para tu alerta: ${j.title}`,
        body: `${j.companyName} · ${j.locality}${j.salaryLabel ? ` · ${j.salaryLabel}` : ''}`, link: `/oferta/${j.id}`,
      });
    }
  } catch (e) { console.warn('Alertas:', e.message); }
}

/* Una empresa puede ver datos de una persona sólo si esa persona se le postuló. */
const companyHasApplicant = (companyId, candidateId) => !!store.one(`SELECT 1 AS x FROM applications a
  JOIN jobs j ON j.id=a.job_id WHERE a.candidate_id=? AND j.company_id=? LIMIT 1`, candidateId, companyId);

/* ------------------------------------------------------------------ */
/* Páginas                                                             */
/* ------------------------------------------------------------------ */
const NAV_ITEMS = [
  ['/', 'Inicio'],
  ['/buscar', 'Buscar empleo'],
  ['/changas', 'Changas'],
  ['/flyers', 'Wik Works'],
  ['/guia', 'Guía'],
  ['/publicar', 'Para empresas'],
];

/* Logo de marca: "la W que se tilda". Una W cuyo último trazo se cierra como un tilde ✓:
   en WorkUco conseguís trabajo. La W toma el color del texto; el tilde, el acento (--brand-dot). */
const brandMark = () => `<svg class="brand-svg" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
  <path d="M6.8 15.6 12.4 28.4 18 18" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="brand-dot" d="M18 18 22.8 26.8 33.2 11.6" fill="none" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* Tipografías propias (antes Google Fonts: dos conexiones más antes de mostrar texto en el celular).
   Se precargan las dos de letras latinas, que son las que usa la página. */
const HEAD_EXTRA = `<link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/valle.css">
  <link rel="manifest" href="/manifest.webmanifest">
  <script src="/pwa.js" defer></script>`;

/* ícono del botón "Instalar app" (flecha hacia un celular) */
const APP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7"/><path d="m9 11 3 3 3-3"/><path d="M10.5 18.5h3"/></svg>';

/* Animación de inicio: se dibuja la W del logo, se cierra el tilde y se completa "WorkUco".
   Una vez por visita (sessionStorage), se saltea con un toque o una tecla y no se muestra
   con "reducir movimiento". Sin JS queda oculta, así nunca tapa la página. */
const INTRO_HTML = `<div class="wk-intro" id="wk-intro" aria-hidden="true" hidden>
  <p class="wk-intro-word"><svg class="wk-intro-w" viewBox="4.7 9.5 30.6 21"><path pathLength="1" d="M6.8 15.6 12.4 28.4 18 18"/><path class="wk-intro-tick" pathLength="1" d="M18 18 22.8 26.8 33.2 11.6"/></svg><span class="wk-intro-rest">ork<b>Uco</b></span></p>
</div>
<script>(function(){var el=document.getElementById('wk-intro');try{if((window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)||sessionStorage.getItem('wk-intro'))return el.remove();sessionStorage.setItem('wk-intro','1');}catch(e){return el.remove();}el.hidden=false;var t,out=function(){clearTimeout(t);if(el.classList.contains('is-out'))return;el.classList.add('is-out');setTimeout(function(){el.remove();},340);};t=setTimeout(out,1700);el.addEventListener('pointerdown',out);document.addEventListener('keydown',out,{once:true});})();</script>`;

function navHtml(active) {
  const links = NAV_ITEMS.map(([href, label]) =>
    `<a class="nav-link${active === href ? ' is-active' : ''}" href="${href}">${label}</a>`).join('');
  return `${INTRO_HTML}
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="WorkUco, inicio">
      ${brandMark()}
      <span class="brand-name">Work<b>Uco</b></span>
    </a>
    <nav class="main-nav" aria-label="Principal">${links}</nav>
    <div class="header-actions" data-auth-slot>
      <a class="btn btn-ghost btn-sm" href="/acceder">Ingresar</a>
      <a class="btn btn-primary btn-sm" href="/publicar">Publicar empleo</a>
    </div>
    <button class="app-install" type="button" data-app-install hidden title="Instalar WorkUco en tu celular o compu">${APP_ICON}<span>Instalar app</span></button>
    <button class="menu-toggle" type="button" aria-label="Abrir menú" aria-expanded="false" data-menu-toggle>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu hidden>
    ${NAV_ITEMS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
    <a href="/acceder" data-auth-mobile>Ingresar</a>
    <button class="mobile-install" type="button" data-app-install hidden>${APP_ICON} Instalar la app de WorkUco</button>
    <button class="mobile-wik" type="button" data-wik-toggle aria-pressed="true">
      <span>Botón de Wik Works</span><span class="mobile-wik-state" data-wik-state>Activado</span>
    </button>
  </div>
</header>${process.env.WORKUCO_DEMO === '1' ? '\n<div class="demo-strip" role="note"><span class="ds-long">Modo demostración: las empresas, personas y ofertas que ves son ficticias.</span><span class="ds-short">Demo: empresas y personas ficticias</span></div>' : ''}`;
}

function footerHtml() {
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/">
        ${brandMark()}
        <span class="brand-name">Work<b>Uco</b></span>
      </a>
      <p>El portal de empleo del Valle de Uco. Conectamos talento local con empresas de San Carlos, Tunuyán y Tupungato.</p>
    </div>
    <div class="footer-col">
      <h4>Para personas</h4>
      <a href="/buscar">Buscar empleo</a>
      <a href="/changas">Changas por día</a>
      <a href="/mi-perfil">Mi perfil y postulaciones</a>
      <a href="/acceder?rol=empleado">Crear cuenta</a>
    </div>
    <div class="footer-col">
      <h4>Para empresas</h4>
      <a href="/publicar">Publicar empleo</a>
      <a href="/panel">Panel de empresa</a>
      <a href="/panel#talento">Base de talento</a>
      <a href="/empresas">Empresas del Valle</a>
    </div>
    <div class="footer-col">
      <h4>WorkUco</h4>
      <a href="/acerca">Acerca de</a>
      <a href="/contacto">Contacto</a>
      <a href="/faq">Preguntas frecuentes</a>
      <a href="/terminos">Términos y condiciones</a>
      <a href="/privacidad">Privacidad</a>
      <a href="/baja">Botón de baja</a>
      <button class="footer-install" type="button" data-app-install hidden>${APP_ICON} Instalar la app</button>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>© ${new Date().getFullYear()} WorkUco · Valle de Uco, Mendoza</span>
    <span>Hecho para el Valle de Uco</span>
  </div>
  <div class="container footer-legal">
    <p>${legalIdentity()}</p>
    <p>El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>
  </div>
</footer>`;
}

/* Identificación del responsable (Res. 104/2005, Ley 25.326 art. 6): se completa con variables de entorno. */
function legalIdentity() {
  const l = legal.legalInfo();
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const parts = [l.name ? `Responsable: ${esc(l.name)}` : 'Responsable: WorkUco', l.cuit ? `CUIT ${esc(l.cuit)}` : '', l.address ? `Domicilio: ${esc(l.address)}` : '', `Contacto: ${esc(l.email)}`];
  return parts.filter(Boolean).join(' · ');
}

/* Página no encontrada: a quien navega le mostramos una página amable; a archivos e imágenes, texto plano. */
function notFound(req, res) {
  const p = new URL(req.url || '/', 'http://x').pathname;
  const wantsPage = req.method === 'GET' && (!path.extname(p) || /\.html?$/i.test(p)) && /text\/html|\*\/\*/.test(req.headers.accept || '*/*');
  if (!wantsPage) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
  return renderPage(res, '404.html', { req, title: 'Página no encontrada · WorkUco', status: 404, noindex: true });
}

/* Origen público (https://dominio) para links absolutos en vistas previas y en el mapa del sitio. */
/* En producción se usa PUBLIC_URL (confiable). Sin ella, el Host del pedido se limpia: sólo letras,
   números, puntos, guiones y puerto, para que nadie pueda meter un dominio raro en los links. */
function originOf(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = /https/i.test(String((req && req.headers['x-forwarded-proto']) || '')) ? 'https' : 'http';
  const host = String((req && req.headers.host) || '').toLowerCase();
  return `${proto}://${/^[a-z0-9.-]+(:\d{1,5})?$/.test(host) ? host : 'localhost'}`;
}

/* head: etiquetas propias de la página (aviso, empresa); si no hay, se arman las generales.
   En modo demo nada se indexa: los avisos ficticios no tienen que aparecer en Google. */
function renderPage(res, file, { active = '', title = 'WorkUco', req = null, head = '', status = 200, noindex = false } = {}) {
  fs.readFile(path.join(WEB, file), 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const hidden = noindex || DEMO || /<meta name="robots" content="noindex">/.test(html);
    if (!head && req) {
      const own = /<meta name="description" content="([^"]*)">/.exec(html);
      const pth = new URL(req.url || '/', 'http://x').pathname;
      head = seo.pageMeta({ origin: originOf(req), path: pth, title, description: own ? own[1] : undefined, noindex: hidden });
      /* portada: WorkUco como organización y sitio web con buscador (datos estructurados) */
      if (pth === '/') head += `\n  ${seo.siteLd(originOf(req), { email: legal.legalInfo().email })}`;
    } else if (head && hidden && !/name="robots"/.test(head)) head += '\n  <meta name="robots" content="noindex">';
    if (head) {
      html = html.replace(/\s*<meta name="description" content="[^"]*">/, '').replace(/\s*<meta name="robots" content="noindex">/, '');
      html = html.replace('</head>', () => `  ${head}\n</head>`);
    }
    const out = html
      .replace('{{TITLE}}', () => seo.escAttr(title))
      .replace('{{NAV}}', navHtml(active))
      .replace('{{FOOTER}}', footerHtml())
      .replace(/{{BRAND_MARK}}/g, brandMark())
      .replace('<link rel="stylesheet" href="/styles.css">', HEAD_EXTRA)
      .replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#0b1612">')
      .replace(/\{\{ICON_([A-Z]+)\}\}/g, (_, name) => pageIcon(name));
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}

const INFO_PAGES = {
  '/acerca': 'Acerca de WorkUco',
  '/contacto': 'Contacto',
  '/faq': 'Preguntas frecuentes',
  '/terminos': 'Términos y condiciones',
  '/privacidad': 'Privacidad',
  '/baja': 'Botón de baja',
};

/* Iconos de línea que se usan en las plantillas HTML */
const PAGE_ICONS = {
  BAG: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  BUILDING: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  SEARCH: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  CHECK: '<path d="m5 12 4 4L19 6"/>',
  PIN: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  USERS: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 20a6 6 0 0 0-3-5.2"/>',
  SPARKLES: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="M18 15.5 19 18l2.5 1L19 20l-1 2.5L17 20l-2.5-1L17 18l1-2.5Z"/>',
  ARROW: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  USER: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  IMAGE: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
  FILE: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4M9 13h6M9 17h6"/>',
  MAIL: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  LOCK: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  CLOCK: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  HEART: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
  STAR: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  WAND: '<path d="m4 20 9-9M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z"/>',
  FILTER: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  EYE: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  PLUS: '<path d="M12 5v14M5 12h14"/>',
  X: '<path d="m6 6 12 12M18 6 6 18"/>',
  LEFT: '<path d="m15 6-6 6 6 6"/>',
  RIGHT: '<path d="m9 6 6 6-6 6"/>',
  TRASH: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  EDIT: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  COPY: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  PHONE: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1C10.6 20 4 13.4 4 5a1 1 0 0 1 1-1Z"/>',
  WHATSAPP: '<path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 8.5c0 3 2.5 5.5 5.5 5.5.6 0 1.2-.5 1.2-1.1l-1.7-.9-1 .8a5 5 0 0 1-2-2l.8-1L11 8c-.7 0-1.2.5-1.2 1"/>',
  MONEY: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/>',
  CHART: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  SETTINGS: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  INBOX: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
  UPLOAD: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
};

const pageIcon = (name, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PAGE_ICONS[name] || ''}</svg>`;

/* Analiza una postulación en segundo plano y guarda el resultado. */
async function analyzeAndSave(applicationId, companyId) {
  const company = store.company(companyId);
  const app = store.applicationDetail(applicationId);
  if (!company || !app) return null;
  const job = store.job(app.jobId);
  if (!job) return null;
  const file = app.cvFile || (app.candidate && app.candidate.cvFile) || null;
  let cvText = { text: '', ok: false, reason: 'Sin CV' };
  if (file) {
    const p = path.join(UP_DIR, path.basename(file));
    if (fs.existsSync(p)) cvText = extractCv(p);
  }
  const result = await ai.analyzeApplication({ company, job, application: app, cvText });
  store.setApplicationAi(app.id, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* GUÍA DEL VALLE: fichas de oficios, servicios, salidas y comida       */
/* ------------------------------------------------------------------ */
const MAX_PLACES = 5;
const MAX_PLACE_PHOTOS = 6;
const placeOrigin = (req) => PUBLIC_URL || originOf(req);
const mapsUrl = (p) => (p.address
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address}, ${p.localities[0] || ''}, Mendoza`)}`
  : '');
/* Lo que ve cualquiera en la lista */
function placeSummary(p) {
  return {
    id: p.id, slug: p.slug, name: p.name, section: p.section, category: p.category, localities: p.localities,
    cover: p.photos[0] || null, featured: p.featured, claimed: p.claimed, homeService: p.homeService,
    status: p.status, open: placesLib.openStatus(p.hours), waUrl: placesLib.waLink(p.whatsapp),
    telUrl: ((n) => (n && n.length === 10 ? `tel:+54${n}` : ''))(normPhone(p.phone || p.whatsapp)),
  };
}
/* El detalle; el dueño y el admin ven además estado de moderación y estadísticas */
function placeDetail(p, { owner = false } = {}) {
  const out = {
    ...placeSummary(p), description: p.description, address: p.address, whatsapp: p.whatsapp, phone: p.phone,
    instagram: p.instagram, website: p.website, hours: p.hours, photos: p.photos, mapsUrl: mapsUrl(p),
    imported: p.imported, updatedAt: p.updatedAt,
  };
  if (owner) {
    Object.assign(out, {
      rejectReason: p.rejectReason, featuredUntil: p.featuredUntil,
      ownerType: p.ownerType, consentBy: p.consentBy, consentAt: p.consentAt, stats: store.placeStats(p.id),
    });
  }
  return out;
}
/* sólo para el admin: quién cargó la ficha (persona o empresa) */
function placeOwnerInfo(p) {
  if (!p.ownerType || !p.ownerId) return null;
  const o = p.ownerType === 'candidate' ? store.candidate(p.ownerId) : store.company(p.ownerId);
  return o ? { type: p.ownerType, name: o.name, email: o.email || '', phone: o.phone || '' } : null;
}
function adminPlace(p) { return { ...placeDetail(p, { owner: true }), owner: placeOwnerInfo(p) }; }
function claimPlaceLinks(req, p) {
  if (!p.claimToken) return {};
  const claimUrl = `${placeOrigin(req)}/reclamar-ficha/${p.claimToken}`;
  const msg = `Hola, ¿cómo están? Les escribo de WorkUco, el portal del Valle de Uco. Armamos una ficha de "${p.name}" en la Guía del Valle con los datos que tienen publicados, para que más gente los encuentre. Pueden reclamarla gratis para editarla y ver cuánta gente los contacta, o pedir que la borremos con un toque: ${claimUrl}. ¡Gracias!`;
  const n = normPhone(p.whatsapp || p.phone);
  return { claimUrl, waUrl: n ? `https://wa.me/549${n}?text=${encodeURIComponent(msg)}` : '' };
}
/* Fotos: las que se conservan (URLs propias de la ficha) + las nuevas (data URL) */
function placePhotos(cur, b) {
  const own = new Map(((cur && cur.photoFiles) || []).map((f) => [`/media/${f}`, f]));
  const keep = Array.isArray(b.keepPhotos) ? b.keepPhotos.map((u) => own.get(u)).filter(Boolean) : ((cur && cur.photoFiles) || []);
  const added = Array.isArray(b.photos) ? b.photos.filter(Boolean) : [];
  if (keep.length + added.length > MAX_PLACE_PHOTOS) {
    const e = new Error(`Podés subir hasta ${MAX_PLACE_PHOTOS} fotos`); e.status = 400; e.fields = { photos: `Hasta ${MAX_PLACE_PHOTOS} fotos` }; throw e;
  }
  return { files: [...new Set(keep), ...added.map((f) => saveImage(f, 'place'))], dropped: ((cur && cur.photoFiles) || []).filter((f) => !keep.includes(f)) };
}
function notifyPlaceOwner(p, title, body = '') {
  if (p && p.ownerType && p.ownerId) {
    tryNotify(p.ownerType, p.ownerId, { kind: 'guia', title, body, link: p.ownerType === 'candidate' ? '/mi-perfil?tab=servicios' : '/panel#guia' });
  }
}
/* un toque por IP, ficha y tipo cada 6 horas */
const placeContactSeen = new Map();
function firstContact(req, id, kind) {
  const key = `${throttleKey(req)}|${id}|${kind}`;
  const last = placeContactSeen.get(key);
  if (last && Date.now() - last < 6 * 3600e3) return false;
  if (placeContactSeen.size > 20000) placeContactSeen.clear();
  placeContactSeen.set(key, Date.now());
  return true;
}
const ownerOf = (me) => (me && me.role === 'candidate' ? ['candidate', me.candidate.id] : me && me.role === 'company' ? ['company', me.company.id] : null);

/* Devuelve false si la ruta no es de la guía. */
async function handlePlacesApi(req, res, p, method, q, me) {
  /* ---- públicas ---- */
  if (p === '/api/places' && method === 'GET') {
    const section = Object.prototype.hasOwnProperty.call(placesLib.SECTIONS, q.get('section')) ? q.get('section') : '';
    const category = section && placesLib.SECTIONS[section].categories.includes(q.get('category')) ? q.get('category') : '';
    const locality = LOCALITIES.includes(q.get('locality')) ? q.get('locality') : '';
    const query = clean(q.get('q'), 60);
    const limit = Math.min(24, Math.max(3, Number(q.get('limit')) || 12));
    const page = Math.max(1, Number(q.get('page')) || 1);
    const sections = placesLib.SECTIONS;
    if (q.get('open') === '1') {
      const all = store.searchPlaces({ section, category, locality, q: query, limit: 5000 }).places
        .filter((x) => ['open', 'always'].includes(placesLib.openStatus(x.hours).state));
      const pages = Math.max(1, Math.ceil(all.length / limit));
      return send(res, 200, { places: all.slice((page - 1) * limit, page * limit).map(placeSummary), total: all.length, pages, sections });
    }
    const r = store.searchPlaces({ section, category, locality, q: query, page, limit });
    return send(res, 200, { places: r.places.map(placeSummary), total: r.total, pages: r.pages, sections });
  }
  const contact = p.match(/^\/api\/places\/([a-z0-9]+)\/contact$/);
  if (contact && method === 'POST') {
    const b = await readBody(req);
    if (!['whatsapp', 'calls', 'maps'].includes(b.kind)) return send(res, 400, { error: 'Tipo de contacto inválido' });
    const pl = store.place(contact[1]);
    if (!pl || pl.status !== 'approved') return send(res, 404, { error: 'Ficha no encontrada' });
    if (firstContact(req, pl.id, b.kind)) store.bumpPlaceStat(pl.id, b.kind);
    res.writeHead(204); return res.end();
  }
  const bySlug = p.match(/^\/api\/places\/([a-z0-9-]+)$/);
  if (bySlug && method === 'GET') {
    const pl = store.placeBySlug(bySlug[1]);
    const o = ownerOf(me);
    const isOwner = !!(pl && o && pl.ownerType === o[0] && pl.ownerId === o[1]);
    const isAdmin = !!(me && me.role === 'admin');
    if (!pl || (pl.status !== 'approved' && !isOwner && !isAdmin)) return send(res, 404, { error: 'Ficha no encontrada' });
    if (!isOwner && !isAdmin) store.bumpPlaceStat(pl.id, 'views');
    const out = isAdmin ? adminPlace(pl) : placeDetail(pl, { owner: isOwner });
    if (isAdmin) Object.assign(out, claimPlaceLinks(req, pl));
    return send(res, 200, { place: out, canEdit: isOwner });
  }

  /* ---- dueños (persona o empresa) ---- */
  if (p === '/api/my/places' || p.startsWith('/api/my/places/')) {
    const o = ownerOf(me);
    if (!o) return send(res, 401, { error: 'Iniciá sesión para manejar tus fichas' });
    if (p === '/api/my/places' && method === 'GET') {
      return send(res, 200, { places: store.placesOf(o[0], o[1]).map((x) => placeDetail(x, { owner: true })), max: MAX_PLACES });
    }
    if (p === '/api/my/places' && method === 'POST') {
      if (store.countPlacesOf(o[0], o[1]) >= MAX_PLACES) return send(res, 400, { error: `Llegaste al máximo de ${MAX_PLACES} fichas por cuenta` });
      const b = await readBody(req);
      const v = placesLib.validatePlace(b);
      if (!v.ok) return send(res, 400, { error: 'Revisá los datos de la ficha', fields: v.errors });
      const ph = placePhotos(null, b);
      const pl = store.insertPlace({ ...v.data, photoFiles: ph.files, status: 'pending', ownerType: o[0], ownerId: o[1] });
      return send(res, 201, { place: placeDetail(pl, { owner: true }), message: 'Tu ficha quedó en revisión. Te avisamos cuando esté publicada.' });
    }
    const mine = p.match(/^\/api\/my\/places\/([a-z0-9]+)$/);
    const cur = mine ? store.place(mine[1]) : null;
    if (!cur || cur.ownerType !== o[0] || cur.ownerId !== o[1]) return send(res, 404, { error: 'Ficha no encontrada' });
    if (method === 'DELETE') {
      store.deletePlace(cur.id).forEach(removeUpload);
      return send(res, 200, { ok: true });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const v = placesLib.validatePlace(b);
      if (!v.ok) return send(res, 400, { error: 'Revisá los datos de la ficha', fields: v.errors });
      const ph = placePhotos(cur, b);
      store.updatePlace(cur.id, { ...v.data, photoFiles: ph.files });
      ph.dropped.forEach(removeUpload);
      /* nombre, sección o rubro nuevos (o una ficha rechazada que se corrige) vuelven a revisión */
      const review = v.data.name !== cur.name || v.data.section !== cur.section || v.data.category !== cur.category || cur.status === 'rejected';
      const pl = review ? store.setPlaceStatus(cur.id, 'pending') : store.place(cur.id);
      return send(res, 200, { place: placeDetail(pl, { owner: true }), message: review ? 'Los cambios quedaron en revisión.' : 'Cambios publicados.' });
    }
    return send(res, 405, { error: 'Método no permitido' });
  }

  /* ---- admin ---- */
  if (p === '/api/admin/places' || p.startsWith('/api/admin/places/')) {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    if (p === '/api/admin/places' && method === 'GET') {
      const st = q.get('status') || '';
      const list = st === 'recent' ? store.recentPlaceChanges()
        : st === 'unclaimed' ? store.allPlaces().filter((x) => !x.claimed)
          : ['pending', 'approved', 'rejected', 'hidden'].includes(st) ? store.allPlaces({ status: st }) : store.allPlaces();
      return send(res, 200, { places: list.map((x) => ({ ...adminPlace(x), ...claimPlaceLinks(req, x) })) });
    }
    if (p === '/api/admin/places' && method === 'POST') {
      const b = await readBody(req);
      const v = placesLib.validatePlace(b, { admin: true });
      const fields = { ...v.errors };
      if (v.data.section === 'oficios' && b.consent !== true) fields.consent = 'Para cargar un oficio, la persona tiene que haberte autorizado';
      if (Object.keys(fields).length) return send(res, 400, { error: 'Revisá los datos de la ficha', fields });
      if (store.placeBlocked(normPhone(v.data.whatsapp || v.data.phone), normName(v.data.name))) {
        return send(res, 409, { code: 'blocked', error: 'Este comercio o persona pidió no aparecer en la guía' });
      }
      const ph = placePhotos(null, b);
      const pl = store.insertPlace({
        ...v.data, photoFiles: ph.files, status: 'approved', imported: 1, claimToken: crypto.randomBytes(24).toString('hex'),
        consentBy: b.consent === true ? me.email : null, consentAt: b.consent === true ? now() : null,
      });
      return send(res, 201, { place: placeDetail(pl, { owner: true }), ...claimPlaceLinks(req, pl) });
    }
    const adm = p.match(/^\/api\/admin\/places\/([a-z0-9]+)$/);
    const cur = adm ? store.place(adm[1]) : null;
    if (!cur) return send(res, 404, { error: 'Ficha no encontrada' });
    if (method === 'DELETE') {
      const b = await readBody(req);
      const reason = clean(b.reason, 300);
      store.deletePlace(cur.id).forEach(removeUpload);
      notifyPlaceOwner(cur, `Borramos tu ficha "${cur.name}" de la Guía del Valle`, reason || 'Escribinos si querés saber por qué.');
      return send(res, 200, { ok: true });
    }
    if (method === 'PATCH') {
      const b = await readBody(req);
      let pl = cur;
      if (b.status !== undefined) {
        if (!['approved', 'rejected', 'hidden', 'pending'].includes(b.status)) return send(res, 400, { error: 'Estado inválido' });
        const reason = b.status === 'rejected' ? clean(b.reason, 300) || 'Revisá los datos de la ficha' : null;
        pl = store.setPlaceStatus(cur.id, b.status, reason);
        if (b.status !== cur.status) {
          if (b.status === 'approved') notifyPlaceOwner(pl, `Tu ficha "${pl.name}" ya está en la Guía del Valle`, 'Ya la puede ver todo el Valle.');
          if (b.status === 'rejected') notifyPlaceOwner(pl, `Tu ficha "${pl.name}" necesita cambios`, reason);
          if (b.status === 'hidden') notifyPlaceOwner(pl, `Tu ficha "${pl.name}" quedó oculta`, 'Escribinos si querés saber por qué.');
        }
      }
      if (b.featuredDays !== undefined) {
        const d = b.featuredDays;
        pl = store.setPlaceFeatured(cur.id, d === null ? null : Number(d) === 0 ? 0 : Date.now() + Math.min(365, Math.max(1, Number(d) || 7)) * 86400000);
      }
      return send(res, 200, { place: placeDetail(pl, { owner: true }) });
    }
    return send(res, 405, { error: 'Método no permitido' });
  }

  /* ---- reclamo de fichas cargadas por el admin ---- */
  const cl = p.match(/^\/api\/claim-place\/([a-f0-9]{48})(\/accept|\/delete)?$/);
  if (cl) {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const pl = store.placeByClaimToken(cl[1]);
    if (!pl) { loginFailed(req); return send(res, 404, { error: 'Este link ya se usó o no existe' }); }
    if (!cl[2] && method === 'GET') return send(res, 200, { place: placeDetail(pl) });
    if (cl[2] === '/delete' && method === 'POST') {
      store.addPlaceBlock(normPhone(pl.whatsapp || pl.phone), normName(pl.name), pl.name);
      store.deletePlace(pl.id).forEach(removeUpload);
      return send(res, 200, { ok: true });
    }
    if (cl[2] === '/accept' && method === 'POST') {
      let o = ownerOf(me);
      if (o) {
        if (store.countPlacesOf(o[0], o[1]) >= MAX_PLACES) return send(res, 409, { error: `Ya tenés ${MAX_PLACES} fichas en tu cuenta. Borrá una para sumar esta.` });
      } else {
        const b = await readBody(req);
        const role = b.role === 'company' ? 'company' : 'candidate';
        const name = clean(b.name, 120);
        const email = clean(b.email, 160).toLowerCase();
        const password = String(b.password || '');
        const phone = clean(b.phone, 60);
        const errs = {};
        if (name.length < 2) errs.name = role === 'candidate' ? 'Ingresá tu nombre' : 'Ingresá el nombre de la empresa';
        if (!isEmail(email)) errs.email = 'Email inválido';
        if (password.length < 8) errs.password = 'La contraseña debe tener al menos 8 caracteres';
        if (!phoneOk(phone)) errs.phone = 'Ingresá un teléfono válido';
        if (store.companyByEmail(email) || store.candidateByEmail(email)) errs.email = 'Ya hay una cuenta con ese email: ingresá con ella';
        if (b.acceptTerms !== true) errs.acceptTerms = 'Para crear la cuenta tenés que aceptar los términos y la política de privacidad';
        if (Object.keys(errs).length) return send(res, 400, { error: 'Revisá los datos', fields: errs });
        if (role === 'candidate') {
          const c = store.insertCandidate({ id: uid('u'), name, email, phone, password: hashPassword(password), locality: pl.localities[0] || '' });
          store.acceptTerms('candidates', c.id, legal.TERMS_VERSION);
          o = ['candidate', c.id];
        } else {
          const c = store.insertCompany({ id: uid('c'), name, email, phone, website: '', description: '', password: hashPassword(password), verified: 0, plan: 'free', createdAt: now(), locality: pl.localities[0] || '' });
          store.acceptTerms('companies', c.id, legal.TERMS_VERSION);
          o = ['company', c.id];
        }
        setSession(res, o[0], req, o[0] === 'candidate' ? { candidateId: o[1] } : { companyId: o[1] });
      }
      const done = store.claimPlace(pl.id, o[0], o[1]);
      if (!done) return send(res, 404, { error: 'Este link ya se usó o no existe' });
      notifyPlaceOwner(done, `La ficha "${done.name}" ya es tuya`, 'Podés editarla y ver cuánta gente te contacta.');
      return send(res, 200, { ok: true, role: o[0] });
    }
    return send(res, 405, { error: 'Método no permitido' });
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const q = url.searchParams;

  if (method !== 'GET' && !originOk(req)) return send(res, 403, { error: 'Origen no permitido' });

  /* ---------- metadatos ---------- */
  if (p === '/api/meta' && method === 'GET') {
    return send(res, 200, {
      localities: LOCALITIES, categories: CATEGORIES, types: TYPES, modalities: MODALITIES,
      benefits: BENEFITS, stages: STAGES.map((id) => ({ id, label: STAGE_LABEL[id] })),
      aiProviders: ai.PROVIDERS,
      salaryPeriods: SALARY_PERIODS, templates: TEMPLATES, counts: store.publicCounts(), contactWa: CONTACT_WA,
      launchFree: LAUNCH_FREE,
      payments: ((c) => ({ enabled: c.enabled, options: c.enabled ? FEATURED_DAYS.filter((d) => c.prices[d]).map((d) => ({ days: d, price: c.prices[d] })) : [] }))(payConfig()),
      cvPro: cvProConfig(),
      cosecha: ((c) => ({ price: c.price, payEnabled: c.enabled, days: COSECHA_DAYS }))(cosechaConfig()),
      contactWaUrl: normPhone(CONTACT_WA) ? `https://wa.me/549${normPhone(CONTACT_WA)}` : '',
      legal: legal.legalInfo(), discriminationRules: legal.DISCRIMINATION_RULES,
    });
  }

  /* ---------- sesión ---------- */
  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: current(req) });

  if (p === '/api/auth/forgot' && method === 'POST') {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    if (forgotLimited(req)) return send(res, 429, { error: 'Pediste muchos links. Probá de nuevo en un rato.' });
    const b = await readBody(req);
    const email = clean(b.email, 160).toLowerCase();
    if (!isEmail(email)) return send(res, 400, { error: 'Revisá el email', fields: { email: 'Email inválido' } });
    const role = b.role === 'company' ? 'company' : 'candidate';
    const row = role === 'candidate' ? store.candidateByEmail(email) : store.companyByEmail(email);
    /* misma respuesta exista o no la cuenta: no se puede averiguar quién está registrado */
    const answer = { ok: true, message: 'Si hay una cuenta con ese email, te mandamos un link para crear una contraseña nueva. Revisá también el correo no deseado.' };
    if (!row || row.password === '!' || (role === 'company' && row.claimed === 0)) return send(res, 200, answer);
    if (store.recentResets(role, row.id, 60 * 60 * 1000) >= 3) return send(res, 200, answer);
    const token = crypto.randomBytes(32).toString('hex');
    store.createReset(role, row.id, resetHash(token), RESET_TTL);
    sendMail(row.email, {
      title: 'Creá una contraseña nueva',
      body: `Hola, ${row.name}. Pediste recuperar el acceso a tu cuenta de WorkUco.\n\nEl link sirve una sola vez y vence en 1 hora. Si no fuiste vos, ignorá este mail: tu contraseña no cambia.`,
      cta: { label: 'Crear contraseña nueva', url: `${mailOrigin()}/restablecer#t=${token}` },
    }).catch(() => {});
    return send(res, 200, answer);
  }

  if (p === '/api/auth/reset' && method === 'POST') {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const password = String(b.password || '');
    if (password.length < 8) return send(res, 400, { error: 'Revisá la contraseña', fields: { password: 'Tiene que tener al menos 8 caracteres' } });
    const r = /^[a-f0-9]{64}$/.test(String(b.token || '')) ? store.consumeReset(resetHash(b.token)) : null;
    if (!r) { loginFailed(req); return send(res, 400, { error: 'El link venció o ya se usó. Pedí uno nuevo.' }); }
    store.setPassword(r.role, r.account_id, hashPassword(password));
    store.deleteSessionsFor(r.role, r.account_id); /* se cierran las sesiones abiertas en otros equipos */
    const row = r.role === 'candidate' ? store.candidate(r.account_id) : store.company(r.account_id);
    if (row) sendMail(row.email, { title: 'Tu contraseña cambió', body: 'La contraseña de tu cuenta de WorkUco se cambió recién. Si no fuiste vos, escribinos enseguida respondiendo este mail.' }).catch(() => {});
    return send(res, 200, { ok: true, role: r.role });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    if (throttled(req)) return send(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
    const b = await readBody(req);
    const role = b.role === 'candidate' ? 'candidate' : 'company';
    const name = clean(b.name, 120);
    const email = clean(b.email, 160).toLowerCase();
    const password = String(b.password || '');
    const phone = clean(b.phone, 60);
    const errs = {};
    if (name.length < 2) errs.name = role === 'candidate' ? 'Ingresá tu nombre' : 'Ingresá el nombre de la empresa';
    if (!isEmail(email)) errs.email = 'Email inválido';
    if (password.length < 8) errs.password = 'La contraseña debe tener al menos 8 caracteres';
    if (!phoneOk(phone)) errs.phone = 'Ingresá un teléfono válido';
    if (role === 'company' && store.companyByEmail(email)) errs.email = 'Ya existe una cuenta con ese email';
    if (role === 'candidate' && store.candidateByEmail(email)) errs.email = 'Ya existe una cuenta con ese email';
    if (b.acceptTerms !== true) {
      errs.acceptTerms = role === 'candidate'
        ? 'Para crear la cuenta tenés que tener 16 años o más y aceptar los términos y la política de privacidad'
        : 'Para crear la cuenta tenés que aceptar los términos y la política de privacidad';
    }
    if (Object.keys(errs).length) return send(res, 400, { error: 'Revisá los datos', fields: errs });

    if (role === 'candidate') {
      const c = store.insertCandidate({
        id: uid('u'), name, email, phone, password: hashPassword(password),
        locality: LOCALITIES.includes(b.locality) ? b.locality : '',
      });
      store.acceptTerms('candidates', c.id, legal.TERMS_VERSION);
      setSession(res, 'candidate', req, { candidateId: c.id });
      return send(res, 201, { candidate: publicCandidate(c, { privateView: true }), user: { role: 'candidate' } });
    }
    const c = store.insertCompany({
      id: uid('c'), name, email, phone, website: cleanUrl(b.website),
      description: cleanMultiline(b.description, 1000), password: hashPassword(password),
      verified: 0, plan: 'free', createdAt: now(),
      locality: LOCALITIES.includes(b.locality) ? b.locality : '',
    });
    store.acceptTerms('companies', c.id, legal.TERMS_VERSION);
    setSession(res, 'company', req, { companyId: c.id });
    return send(res, 201, { company: publicCompany(c, { privateView: true }) });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const role = b.role === 'candidate' ? 'candidate' : 'company';
    if (role === 'candidate') {
      const c = store.candidateByEmail(b.email);
      if (!c || !verifyPassword(b.password, c.password)) {
        loginFailed(req);
        return send(res, 401, { error: 'Email o contraseña incorrectos' });
      }
      fails.delete(throttleKey(req));
      setSession(res, 'candidate', req, { candidateId: c.id });
      return send(res, 200, { candidate: publicCandidate(c, { privateView: true }) });
    }
    const c = store.companyByEmail(b.email);
    if (!c || !verifyPassword(b.password, c.password)) {
      loginFailed(req);
      return send(res, 401, { error: 'Email o contraseña incorrectos' });
    }
    fails.delete(throttleKey(req));
    setSession(res, 'company', req, { companyId: c.id });
    return send(res, 200, { company: publicCompany(c, { privateView: true }) });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  /* ---------- imágenes ---------- */
  if (p.startsWith('/api/photo/c/') && method === 'GET') {
    const me = current(req);
    const c = store.candidate(p.split('/').pop());
    if (!c || !c.photo_file) return send(res, 404, { error: 'Foto no encontrada' });
    let allowed = me && (me.role === 'admin' || (me.role === 'candidate' && me.candidate.id === c.id));
    if (!allowed && me && me.role === 'company') {
      allowed = !!c.open_to_work || companyHasApplicant(me.company.id, c.id);
    }
    if (!allowed) return send(res, 401, { error: 'Iniciá sesión para ver la foto' });
    return serveFile(res, path.join(UP_DIR, path.basename(c.photo_file)), 'image/*', true);
  }
  if (p.startsWith('/api/cv/c/') && method === 'GET') {
    const me = current(req);
    const c = store.candidate(p.split('/').pop());
    if (!c || !c.cv_file) return send(res, 404, { error: 'CV no encontrado' });
    let allowed = me && (me.role === 'admin' || (me.role === 'candidate' && me.candidate.id === c.id));
    if (!allowed && me && me.role === 'company') {
      allowed = !!store.one(`SELECT 1 AS x FROM applications a JOIN jobs j ON j.id=a.job_id
        WHERE a.candidate_id=? AND j.company_id=? LIMIT 1`, c.id, me.company.id);
    }
    if (!allowed) return send(res, 403, { error: 'Sin permiso' });
    return serveFile(res, path.join(UP_DIR, path.basename(c.cv_file)), 'application/pdf', false, c.cv_name || 'cv.pdf');
  }
  if (p.startsWith('/media/') && method === 'GET') {
    const name = path.basename(decodeURIComponent(p.slice(7)));
    /* sólo imágenes públicas: los CV (PDF) se bajan por /api/cv/... con permiso */
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return send(res, 404, { error: 'Archivo no encontrado' });
    return serveFile(res, path.join(UP_DIR, name), 'image/*', true);
  }

  /* ---------- ofertas públicas ---------- */
  if (p === '/api/jobs' && method === 'GET') {
    const me = current(req);
    const cand = me && me.role === 'candidate' ? store.candidate(me.candidate.id) : null;
    const sort = ['old', 'salary', 'match', 'flyer'].includes(q.get('sort')) ? q.get('sort') : 'recent';
    const byMatch = sort === 'match' && !!cand;
    const limit = Math.min(30, Math.max(3, Number(q.get('limit') || 9)));
    const r = store.searchJobs({
      q: clean(q.get('q'), 80),
      /* una o varias localidades separadas por coma */
      locality: String(q.get('locality') || '').split(',').map((x) => x.trim()).filter((x) => LOCALITIES.includes(x)),
      category: CATEGORIES.includes(q.get('category')) ? q.get('category') : '',
      type: TYPES.includes(q.get('type')) ? q.get('type') : '',
      modality: MODALITIES.includes(q.get('modality')) ? q.get('modality') : '',
      withSalary: q.get('withSalary') === '1',
      gig: q.get('gig') || '',
      cosecha: q.get('cosecha') === '1' ? '1' : '',
      sort: sort === 'match' ? 'recent' : sort,
      /* por compatibilidad se ordena sobre todo el resultado y se pagina después */
      page: byMatch ? 1 : Number(q.get('page') || 1),
      limit: byMatch ? 1000 : limit,
    });
    let jobs = r.jobs.map((j) => (cand ? { ...jobSummary(j), match: matchFor(cand, j) } : jobSummary(j)));
    const out = { total: r.total, page: r.page, pages: r.pages, limit };
    if (byMatch) {
      jobs.sort(byMatchDesc);
      out.pages = Math.max(1, Math.ceil(r.total / limit));
      out.page = Math.min(Math.max(1, Number(q.get('page')) || 1), out.pages);
      jobs = jobs.slice((out.page - 1) * limit, out.page * limit);
    }
    const saved = cand ? store.savedJobs(cand.id).map((s) => s.id) : [];
    return send(res, 200, { ...out, jobs, saved });
  }

  if (p === '/api/companies' && method === 'GET') {
    return send(res, 200, {
      companies: store.companies()
        .filter((c) => c.published > 0)
        .map((c) => ({ ...publicCompany(c), jobs: c.published, applications: c.applications, response: store.responseStats(c.id) })),
    });
  }

  const compPublic = p.match(/^\/api\/companies\/([a-z0-9]+)$/);
  if (compPublic && method === 'GET') {
    const c = store.company(compPublic[1]);
    if (!c) return send(res, 404, { error: 'Empresa no encontrada' });
    const jobs = store.publicJobsForCompany(c.id);
    return send(res, 200, {
      company: { ...publicCompany(c), jobsCount: jobs.length, response: store.responseStats(c.id) },
      jobs: jobs.map(jobSummary),
    });
  }

  const jobMatch = p.match(/^\/api\/jobs\/([a-z0-9]+)$/);
  if (jobMatch && method === 'GET') {
    const j = store.job(jobMatch[1]);
    if (!j || (j.status !== 'approved' && !(current(req) || {}).role)) return send(res, 404, { error: 'Oferta no encontrada' });
    const viewer = current(req);
    const insider = viewer && (viewer.role === 'admin' || (viewer.role === 'company' && viewer.company.id === j.companyId));
    if (!insider) store.bumpViews(j.id);
    const unclaimed = (store.company(j.companyId) || {}).claimed === 0;
    const expired = j.closesAt && j.closesAt < todayAR();
    const me = current(req);
    let applied = false; let saved = false; let match;
    if (me && me.role === 'candidate') {
      match = matchFor(store.candidate(me.candidate.id), j);
      applied = !!store.applicationByCandidate(me.candidate.id, j.id);
      saved = !!store.one('SELECT 1 AS x FROM saved_jobs WHERE candidate_id=? AND job_id=?', me.candidate.id, j.id);
    }
    return send(res, 200, {
      job: {
        id: j.id, title: j.title, companyId: j.companyId, companyName: j.companyName, companyVerified: j.companyVerified,
        companyLogo: j.companyLogo, companyGallery: j.companyGallery,
        companyWebsite: j.companyWebsite, companyDescription: j.companyDescription,
        locality: j.locality, category: j.category, type: j.type, modality: j.modality,
        description: j.description, responsibilities: j.responsibilities, requirements: j.requirements,
        experience: j.experience, schedule: j.schedule, salary: j.salary,
        salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryPeriod: j.salaryPeriod, salaryLabel: j.salaryLabel,
        skills: j.skills, gig: j.gig, startDate: j.startDate, duration: j.duration,
        match, companyResponse: store.responseStats(j.companyId),
        flyer: j.flyer, flyers: j.flyers, sourceKind: j.sourceKind, sourceName: j.sourceName, companyClaimed: !unclaimed,
        benefits: j.benefits, positions: j.positions,
        /* aviso importado sin reclamar: no se difunden teléfono ni mail de terceros (Ley 25.326, minimización); se postula por WorkUco */
        contactEmail: unclaimed ? '' : j.contactEmail, contactPhone: unclaimed ? '' : j.contactPhone,
        closesAt: j.closesAt, createdAt: j.createdAt, publishedAt: j.publishedAt, views: j.views + 1,
      },
      canApply: !expired, applied, saved,
    });
  }

  const applyMatch = p.match(/^\/api\/jobs\/([a-z0-9]+)\/apply$/);
  if (applyMatch && method === 'POST') {
    const j = store.job(applyMatch[1]);
    if (!j || j.status !== 'approved') return send(res, 404, { error: 'Oferta no encontrada' });
    if (j.closesAt && j.closesAt < todayAR()) return send(res, 410, { error: 'La búsqueda está cerrada' });
    const me = current(req);
    const cand = me && me.role === 'candidate' ? store.candidate(me.candidate.id) : null;
    const b = await readBody(req);
    const name = clean(cand ? cand.name : b.name, 120);
    const email = clean(cand ? cand.email : b.email, 160).toLowerCase();
    const phone = clean(cand ? cand.phone : b.phone, 60);
    const errs = {};
    if (name.length < 3) errs.name = 'Ingresá tu nombre y apellido';
    if (!isEmail(email)) errs.email = 'Email inválido';
    if (!phoneOk(phone)) errs.phone = 'Teléfono inválido';
    if (Object.keys(errs).length) return send(res, 400, { error: 'Revisá los datos', fields: errs });

    let cvFile = null; let cvName = '';
    if (b.cv && b.cv.data) {
      const buf = Buffer.from(String(b.cv.data), 'base64');
      if (buf.length > 4 * 1024 * 1024) return send(res, 413, { error: 'El CV supera los 4 MB' });
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(res, 400, { error: 'El CV debe ser un PDF' });
      cvFile = `cv-${uid('')}.pdf`;
      cvName = clean(b.cv.name, 120).replace(/[^\w.\-() ]+/g, '') || 'cv.pdf';
      fs.writeFileSync(path.join(UP_DIR, cvFile), buf);
    } else if (cand && cand.cv_file) {
      cvFile = cand.cv_file; cvName = cand.cv_name || 'cv.pdf';
    }

    const dup = store.one('SELECT id FROM applications WHERE job_id=? AND (lower(email)=lower(?)' +
      (cand ? ' OR candidate_id=?' : '') + ')', ...(cand ? [j.id, email, cand.id] : [j.id, email]));
    if (dup) return send(res, 409, { error: 'Ya te postulaste a esta oferta' });

    const app = store.insertApplication({
      id: uid('a'), jobId: j.id, candidateId: cand ? cand.id : null, name, email, phone,
      message: cleanMultiline(b.message, 2000), cvFile, cvName, createdAt: now(),
    });

    if (cand) store.markInvitationApplied(j.id, cand.id);
    tryNotify('company', j.companyId, {
      kind: 'postulacion', title: `Nueva postulación: ${name}`, body: j.title, link: '/panel#postulantes',
    });

    /* comodidad: si la empresa activó el análisis automático, corre en segundo plano */
    const company = store.company(j.companyId);
    if (company && company.ai_enabled && company.ai_auto && company.ai_key) {
      setImmediate(() => {
        analyzeAndSave(app.id, company.id).catch((e) => console.warn('IA automática:', e.message));
      });
    }
    return send(res, 201, { ok: true, application: { id: app.id } });
  }

  /* ---------- empresa ---------- */
  const me = current(req);

  /* ---------- guía del valle ---------- */
  const placeHandled = await handlePlacesApi(req, res, p, method, q, me);
  if (placeHandled !== false) return placeHandled;

  /* ---------- tus datos: descarga (derecho de acceso) y baja (supresión, "botón de baja") ---------- */
  if (p === '/api/account/export' && method === 'GET') {
    if (!me || (me.role !== 'candidate' && me.role !== 'company')) return send(res, 401, { error: 'Iniciá sesión' });
    const strip = (row) => { const { password, ai_key: aiKey, claim_token: claim, ...rest } = row || {}; return rest; };
    const data = { exportado: new Date().toISOString(), sitio: 'WorkUco' };
    if (me.role === 'candidate') {
      const c = store.candidate(me.candidate.id);
      data.perfil = strip(c);
      data.postulaciones = store.all('SELECT a.id, a.job_id, j.title AS puesto, a.name, a.email, a.phone, a.message, a.cv_name, a.status, a.created_at FROM applications a LEFT JOIN jobs j ON j.id=a.job_id WHERE a.candidate_id=? OR lower(a.email)=lower(?)', c.id, c.email);
      data.guardados = store.all('SELECT job_id, created_at FROM saved_jobs WHERE candidate_id=?', c.id);
      data.alertas = store.all('SELECT * FROM alerts WHERE candidate_id=?', c.id);
      data.invitaciones = store.all('SELECT id, job_id, company_id, message, status, created_at FROM invitations WHERE candidate_id=?', c.id);
      data.cvPro = store.cvOrdersOf(c.id).map(({ sourceText, ...o }) => o);
    } else {
      data.empresa = strip(store.company(me.company.id));
      data.avisos = store.all('SELECT * FROM jobs WHERE company_id=?', me.company.id);
    }
    data.fichas = store.placesOf(me.role, me.role === 'candidate' ? me.candidate.id : me.company.id)
      .map(({ claimToken, photoFiles, ...pl }) => ({ ...pl, estadisticas: store.placeStats(pl.id) }));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="mis-datos-workuco.json"',
    });
    return res.end(JSON.stringify(data, null, 2));
  }
  if (p === '/api/account/password' && method === 'POST') {
    if (!me || (me.role !== 'candidate' && me.role !== 'company')) return send(res, 401, { error: 'Iniciá sesión' });
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const id = me.role === 'candidate' ? me.candidate.id : me.company.id;
    const row = me.role === 'candidate' ? store.candidate(id) : store.company(id);
    if (!row || !verifyPassword(String(b.current || ''), row.password)) {
      loginFailed(req);
      return send(res, 401, { error: 'La contraseña actual no coincide', fields: { current: 'No coincide' } });
    }
    const next = String(b.next || '');
    if (next.length < 8) return send(res, 400, { error: 'Revisá la contraseña nueva', fields: { next: 'Tiene que tener al menos 8 caracteres' } });
    store.setPassword(me.role, id, hashPassword(next));
    store.deleteSessionsFor(me.role, id, parseCookies(req).wk_sess || ''); /* este equipo sigue adentro; los demás, no */
    sendMail(row.email, { title: 'Tu contraseña cambió', body: 'La contraseña de tu cuenta de WorkUco se cambió desde tu perfil. Si no fuiste vos, escribinos enseguida respondiendo este mail.' }).catch(() => {});
    return send(res, 200, { ok: true });
  }
  if (p === '/api/account/prefs' && method === 'PATCH') {
    if (!me || (me.role !== 'candidate' && me.role !== 'company')) return send(res, 401, { error: 'Iniciá sesión' });
    const b = await readBody(req);
    const id = me.role === 'candidate' ? me.candidate.id : me.company.id;
    const types = MAIL_TYPES[me.role];
    if (b.mailNotices === false || b.mailNotices === true) {
      store.setMailPrefs(me.role, id, Object.fromEntries(types.map((t) => [t, b.mailNotices])));
      store.setMailOptOut(me.role, id, b.mailNotices === false);
    }
    if (b.mail && typeof b.mail === 'object') {
      const row = me.role === 'candidate' ? store.candidate(id) : store.company(id);
      const cur = mailPrefsOf(me.role, row);
      for (const t of types) if (typeof b.mail[t] === 'boolean') cur[t] = b.mail[t];
      store.setMailPrefs(me.role, id, cur);
    }
    if (me.role === 'candidate') {
      const pick = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : undefined);
      store.setCandidatePrefs(id, {
        localities: pick(b.localities, LOCALITIES), types: pick(b.types, TYPES), modalities: pick(b.modalities, MODALITIES),
        gigs: typeof b.gigs === 'boolean' ? b.gigs : undefined,
      });
    }
    const row = me.role === 'candidate' ? store.candidate(id) : store.company(id);
    return send(res, 200, { ok: true, prefs: prefsOf(me.role, row), mailNotices: !row.mail_opt_out });
  }
  if (p === '/api/account/delete' && method === 'POST') {
    if (!me || (me.role !== 'candidate' && me.role !== 'company')) return send(res, 401, { error: 'Iniciá sesión' });
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const row = me.role === 'candidate' ? store.candidate(me.candidate.id) : store.company(me.company.id);
    if (!row || !verifyPassword(String(b.password || ''), row.password)) {
      loginFailed(req);
      return send(res, 401, { error: 'La contraseña no coincide', fields: { password: 'La contraseña no coincide' } });
    }
    let files;
    if (me.role === 'candidate') files = store.deleteCandidateCascade(row.id) || [];
    else { files = store.companyFiles(row.id); store.deleteCompanyCascade(row.id); }
    files.forEach(removeUpload);
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/company/profile' && method === 'PATCH') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const c = store.company(me.company.id);
    const b = await readBody(req);
    const patch = {};
    if ('name' in b) {
      patch.name = clean(b.name, 120);
      if (patch.name.length < 2) return send(res, 400, { error: 'Nombre inválido', fields: { name: 'Nombre inválido' } });
    }
    if ('phone' in b) patch.phone = clean(b.phone, 60);
    if ('website' in b) patch.website = cleanUrl(b.website);
    if ('description' in b) patch.description = cleanMultiline(b.description, 1600);
    if ('locality' in b) patch.locality = LOCALITIES.includes(b.locality) ? b.locality : '';
    if ('employees' in b) patch.employees = servicesLib.EMPLOYEES.includes(b.employees) ? b.employees : '';
    if ('logo' in b && b.logo) {
      const f = saveImage(b.logo, 'logo');
      if (c.logo_file) removeUpload(c.logo_file);
      patch.logo_file = f;
    }
    if (b.removeLogo) { if (c.logo_file) removeUpload(c.logo_file); patch.logo_file = null; }
    const updated = store.updateCompany(me.company.id, patch);
    return send(res, 200, { company: publicCompany(updated, { privateView: true }) });
  }

  /* Soluciones para empresas: la empresa marca qué servicio le interesa y si acepta que la contactemos */
  if (p === '/api/company/services' && (method === 'GET' || method === 'PUT')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    if (method === 'PUT') {
      const b = await readBody(req);
      const services = servicesLib.cleanServices(b.services);
      const note = clean(String(b.note == null ? '' : b.note).replace(/<[^>]*>/g, ''), servicesLib.NOTE_MAX);
      const marketingOk = b.marketingOk === true;
      if (services.length && !marketingOk) {
        const msg = 'Para que te escribamos, marcá que aceptás que WorkUco te contacte por estos servicios';
        return send(res, 400, { error: msg, fields: { marketingOk: msg } });
      }
      store.setServiceInterest(me.company.id, { services, note, marketingOk });
    }
    return send(res, 200, { services: servicesLib.SERVICES, interest: servicesLib.interestOf(store.company(me.company.id)) });
  }

  if (p === '/api/company/gallery' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const c = store.company(me.company.id);
    const b = await readBody(req);
    const gallery = jparse(c.gallery, []);
    if (gallery.length >= 8) return send(res, 400, { error: 'Podés subir hasta 8 fotos' });
    if (!b.image) return send(res, 400, { error: 'Falta la imagen' });
    const f = saveImage(b.image, 'foto');
    gallery.push(f);
    const updated = store.updateCompany(c.id, { gallery });
    return send(res, 201, { company: publicCompany(updated, { privateView: true }) });
  }

  if (p === '/api/company/gallery' && method === 'DELETE') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const c = store.company(me.company.id);
    const file = String(q.get('file') || '').split('/').pop();
    const gallery = jparse(c.gallery, []).filter((x) => x !== file);
    if (gallery.length === jparse(c.gallery, []).length) return send(res, 404, { error: 'Foto no encontrada' });
    removeUpload(file);
    const updated = store.updateCompany(c.id, { gallery });
    return send(res, 200, { company: publicCompany(updated, { privateView: true }) });
  }

  if (p === '/api/company/jobs' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    return send(res, 200, { jobs: store.companyJobs(me.company.id), stats: { applications: store.countApplicationsForCompany(me.company.id) } });
  }

  /* sueldo de referencia del rubro, para sugerir al publicar (sólo empresas) */
  if (p === '/api/company/salary-hint' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const cat = String(q.get('category') || ''); const per = String(q.get('period') || 'mes');
    if (!CATEGORIES.includes(cat) || !SALARY_PERIODS.includes(per)) return send(res, 400, { error: 'Rubro o período inválido' });
    return send(res, 200, { hint: store.salaryHint(cat, per) });
  }

  if (p === '/api/company/jobs' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const newFlyers = Array.isArray(b.flyers) ? b.flyers.filter(Boolean) : (b.flyer ? [b.flyer] : []);
    if (newFlyers.length > MAX_FLYERS) return send(res, 400, { error: `Podés subir hasta ${MAX_FLYERS} flyers`, fields: { flyers: `Hasta ${MAX_FLYERS} flyers` } });
    const v = validateJob(b, { hasFlyer: newFlyers.length > 0 });
    if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
    const flyerFiles = newFlyers.map((f) => saveImage(f, 'flyer'));
    const j = store.insertJob({
      id: uid('j'), companyId: me.company.id, ...v.data, flyerFiles, status: 'pending', featured: 0, createdAt: now(),
    });
    return send(res, 201, { job: j, warnings: legal.discriminationHints(j.title, j.description, j.requirements, j.responsibilities) });
  }

  /* rendimiento de un aviso propio: vistas y postulaciones por día, y cuánto rinde destacado */
  const compStats = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)\/stats$/);
  if (compStats && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compStats[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    const perf = store.jobPerformance(j.id, 14);
    /* el promedio de toda la página sólo se muestra con datos suficientes, para no prometer de más */
    const site = store.featuredStats();
    perf.siteRatio = site.ratio && site.ratio > 1 && site.featured.jobs >= 3 && site.normal.jobs >= 3 ? site.ratio : null;
    return send(res, 200, perf);
  }

  const compJob = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)$/);
  if (compJob && (method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compJob[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    if (method === 'DELETE') { store.removeJob(j.id); return send(res, 200, { ok: true }); }
    if (method === 'PATCH') {
      const b = await readBody(req);
      if (!['closed', 'pending', 'approved'].includes(b.status)) return send(res, 400, { error: 'Estado inválido' });
      if (b.status === 'approved') return send(res, 403, { error: 'Sólo administración puede aprobar' });
      const updated = store.updateJob(j.id, { status: b.status });
      return send(res, 200, { job: updated });
    }
    const b = await readBody(req);
    /* flyers: keepFlyers (URLs que ya eran del aviso) + flyers nuevos; "flyer" solo reemplaza todo */
    const own = new Map((j.flyerFiles || []).map((f) => [mediaUrl(f), f]));
    const keep = b.removeFlyer || b.flyer ? []
      : Array.isArray(b.keepFlyers) ? b.keepFlyers.map((u) => own.get(u)).filter(Boolean) : (j.flyerFiles || []);
    const added = Array.isArray(b.flyers) ? b.flyers.filter(Boolean) : (b.flyer ? [b.flyer] : []);
    if (keep.length + added.length > MAX_FLYERS) return send(res, 400, { error: `Podés tener hasta ${MAX_FLYERS} flyers`, fields: { flyers: `Hasta ${MAX_FLYERS} flyers` } });
    const v = validateJob(b, { hasFlyer: keep.length + added.length > 0 });
    if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
    const flyerFiles = [...new Set(keep), ...added.map((f) => saveImage(f, 'flyer'))];
    const updated = store.updateJob(j.id, { ...v.data, flyerFiles, status: 'pending', rejectReason: null, publishedAt: null });
    return send(res, 200, { job: updated, message: 'Los cambios quedaron pendientes de aprobación', warnings: legal.discriminationHints(updated.title, updated.description, updated.requirements, updated.responsibilities) });
  }

  /* ---------- CV Pro (personas) ---------- */
  if (p.startsWith('/api/cvpro')) {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión con tu cuenta de persona' });
    const cand = store.candidate(me.candidate.id);
    if (!cand) return send(res, 401, { error: 'Iniciá sesión con tu cuenta de persona' });
    const conf = cvProConfig();

    if (p === '/api/cvpro' && method === 'GET') {
      return send(res, 200, { orders: store.cvOrdersOf(cand.id).map(cvOrderOut) });
    }

    if (p === '/api/cvpro/analyze' && method === 'POST') {
      if (!conf.enabled) return send(res, 503, { error: 'El servicio no está disponible en este momento' });
      const b = await readBody(req, 24 * 1024 * 1024);
      if (b.consent !== true) return send(res, 400, { error: 'Para analizar tu CV tenés que aceptar que se procese con IA', fields: { consent: 'Obligatorio' } });
      if (!['pdf', 'fotos', 'perfil'].includes(b.source)) return send(res, 400, { error: 'Elegí cómo cargar tu CV' });
      if (b.source === 'fotos' && (!Array.isArray(b.photos) || !b.photos.length || b.photos.length > 3)) return send(res, 400, { error: 'Subí entre 1 y 3 fotos de tu CV' });
      if (store.countCvAnalysesToday(cand.id) >= CV_MAX_DAILY) return send(res, 429, { error: `Podés analizar hasta ${CV_MAX_DAILY} CV por día. Probá mañana.` });
      const profile = cvProfileOf(cand);
      let text = '';
      const images = [];
      if (b.source === 'pdf') {
        const buf = Buffer.from(String((b.pdf && b.pdf.data) || ''), 'base64');
        if (buf.length > 5 * 1024 * 1024) return send(res, 413, { error: 'El PDF supera los 5 MB' });
        /* el archivo no se guarda: se lee el texto y se borra */
        const tmp = path.join(UP_DIR, `tmp-cvpro-${crypto.randomBytes(6).toString('hex')}.pdf`);
        fs.writeFileSync(tmp, buf);
        let r;
        try { r = extractCv(tmp); } finally { fs.rmSync(tmp, { force: true }); }
        if (!r.ok) return send(res, 400, { error: 'No pudimos leer el texto de tu PDF (parece escaneado). Subí fotos de tu CV.' });
        text = r.text.slice(0, 60000);
      } else if (b.source === 'fotos') {
        for (const ph of b.photos) {
          const img = parseDataUrl(ph);
          if (!img) return send(res, 400, { error: 'Alguna foto no es válida (usá JPG, PNG o WebP)' });
          if (img.buf.length > 5 * 1024 * 1024) return send(res, 413, { error: 'Cada foto puede pesar hasta 5 MB' });
          images.push({ mime: img.mime, base64: img.buf.toString('base64') });
        }
      } else {
        text = [profile.headline, profile.about, profile.experience, profile.education, profile.skills.join(', '), profile.availability].filter(Boolean).join('\n');
      }
      let analysis;
      try {
        const raw = await cvAi(cvpro.analyzePrompt({ text, profile }), { images, fake: () => cvpro.fakeAnalysis(text || `${profile.name}\n${profile.experience}`) });
        analysis = cvpro.normalizeAnalysis(raw);
      } catch (e) {
        console.warn('CV Pro (análisis):', e.message);
        return send(res, e.status === 503 ? 503 : 502, { error: 'No pudimos analizar tu CV en este momento. Probá de nuevo en un rato.' });
      }
      /* con fotos no hay texto: lo que la IA leyó de la foto es la base para el control anti-invención */
      const sourceText = text || JSON.stringify(analysis.extracted);
      const order = store.insertCvOrder({ candidateId: cand.id, sourceKind: b.source, sourceText, analysis, price: conf.price });
      return send(res, 201, { order: cvOrderOut(order) });
    }

    if (p === '/api/cvpro/payments/confirm' && method === 'POST') {
      const b = await readBody(req);
      const id = String(b.paymentId || '');
      if (!/^\d{1,20}$/.test(id)) return send(res, 400, { error: 'Número de pago inválido' });
      let row;
      try { row = await settlePayment(id, { companyId: cand.id, kind: 'cv' }); } catch (e) {
        if (e.status === 404) return send(res, 404, { error: 'No encontramos ese pago' });
        console.warn('Mercado Pago:', e.message);
        return send(res, 502, { error: 'No pudimos consultar el pago. Si se aprobó, tu CV se habilita solo en unos minutos.' });
      }
      if (!row) return send(res, 404, { error: 'No encontramos ese pago' });
      return send(res, 200, { status: row.status, orderId: row.ref_id });
    }

    const m = p.match(/^\/api\/cvpro\/(cv[a-f0-9]{16})(\/generate|\/style|\/rewrite|\/checkout)?$/);
    const order = m ? store.cvOrder(m[1]) : null;
    if (!order || order.candidateId !== cand.id) return send(res, 404, { error: 'No encontramos ese CV' });
    const action = m[2] || '';

    if (!action && method === 'GET') return send(res, 200, { order: cvOrderOut(order) });

    if (action === '/generate' && method === 'POST') {
      if (order.status === 'pagado') return send(res, 400, { error: 'Tu CV ya está pago: usá "Reescribir con IA"' });
      if (order.versions >= CV_MAX_VERSIONS) return send(res, 400, { error: `Llegaste a las ${CV_MAX_VERSIONS} versiones de prueba. Elegí una y pagá para descargarla.` });
      const b = await readBody(req);
      const inputs = { ...order.inputs };
      for (const [k, v] of Object.entries(b.inputs && typeof b.inputs === 'object' ? b.inputs : {}).slice(0, 20)) {
        const val = clean(v, 500);
        if (val) inputs[clean(k, 40)] = val;
      }
      let cv;
      try { cv = await cvGenerate(order, cand, { inputs, request: clean(b.request, 300) }); } catch (e) {
        console.warn('CV Pro (generar):', e.message);
        return send(res, 502, { error: 'No pudimos armar tu CV en este momento. Probá de nuevo en un rato.' });
      }
      const up = store.updateCvOrder(order.id, { cv, inputs, versions: order.versions + 1, status: 'generado' });
      return send(res, 200, { order: cvOrderOut(up) });
    }

    if (action === '/style' && method === 'PATCH') {
      if (!order.cv) return send(res, 400, { error: 'Primero generá tu CV' });
      const b = await readBody(req);
      const cv = { ...order.cv };
      if (b.design !== undefined) {
        if (!cvpro.DESIGNS.includes(b.design)) return send(res, 400, { error: 'Diseño inválido' });
        cv.design = b.design;
      }
      if (b.accent !== undefined) {
        if (!cvpro.ACCENTS.some((a) => a.id === b.accent)) return send(res, 400, { error: 'Color inválido' });
        cv.accent = b.accent;
      }
      return send(res, 200, { order: cvOrderOut(store.updateCvOrder(order.id, { cv })) });
    }

    if (action === '/rewrite' && method === 'POST') {
      if (order.status !== 'pagado') return send(res, 400, { error: 'Las reescrituras con IA se habilitan cuando el CV está pago' });
      if (order.rewritesLeft <= 0) return send(res, 400, { error: 'Ya usaste las reescrituras incluidas' });
      const b = await readBody(req);
      let cv;
      try { cv = await cvGenerate(order, cand, { inputs: order.inputs, request: clean(b.request, 300) }); } catch (e) {
        console.warn('CV Pro (reescribir):', e.message);
        return send(res, 502, { error: 'No pudimos reescribir tu CV en este momento. Probá de nuevo en un rato.' });
      }
      return send(res, 200, { order: cvOrderOut(store.updateCvOrder(order.id, { cv, rewritesLeft: order.rewritesLeft - 1 })) });
    }

    if (action === '/checkout' && method === 'POST') {
      if (order.status === 'pagado') return send(res, 409, { error: 'Este CV ya está pago' });
      if (!order.cv) return send(res, 400, { error: 'Primero generá tu CV' });
      if (!conf.canPay) return send(res, 400, { error: 'El pago en línea no está activo en este momento' });
      const row = store.insertPayment({ companyId: cand.id, jobTitle: 'CV Pro', amount: order.price, kind: 'cv', refId: order.id });
      try {
        const pref = await mp.createPreference({ reference: row.id, title: 'CV Pro WorkUco', amount: order.price, publicUrl: PUBLIC_URL, returnPath: `/cv-pro/${order.id}` });
        store.setPaymentPreference(row.id, pref.id);
        return send(res, 200, { url: pref.url });
      } catch (e) {
        console.warn('Mercado Pago:', e.message);
        store.setPaymentStatus(row.id, 'error');
        return send(res, 502, { error: 'No pudimos abrir Mercado Pago. Probá de nuevo en un rato.' });
      }
    }
    return send(res, 405, { error: 'Método no permitido' });
  }

  /* la empresa pide que se destaque su aviso (en el lanzamiento es gratis; lo aprueba el admin) */
  /* pagar un destacado: crea el pago y devuelve el link de Mercado Pago */
  const compCheckout = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)\/checkout$/);
  if (compCheckout && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compCheckout[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    if (j.status !== 'approved') return send(res, 400, { error: 'El aviso tiene que estar publicado para destacarlo' });
    const cfg = payConfig();
    if (!cfg.enabled) return send(res, 400, { error: 'El pago en línea no está activo. Pedí el destacado y te contactamos.' });
    const b = await readBody(req);
    const days = Number(b.days);
    const price = cfg.prices[days];
    if (!FEATURED_DAYS.includes(days) || !price) return send(res, 400, { error: 'Elegí una de las opciones de destacado' });
    const row = store.insertPayment({ companyId: me.company.id, jobId: j.id, jobTitle: j.title, days, amount: price });
    try {
      const pref = await mp.createPreference({
        reference: row.id, title: `Aviso destacado ${days} días: ${j.title}`.slice(0, 120), amount: price, publicUrl: PUBLIC_URL,
      });
      store.setPaymentPreference(row.id, pref.id);
      return send(res, 200, { url: pref.url, reference: row.id });
    } catch (e) {
      console.warn('Mercado Pago:', e.message);
      store.setPaymentStatus(row.id, 'error');
      return send(res, 502, { error: 'No pudimos abrir Mercado Pago. Probá de nuevo en un rato.' });
    }
  }

  /* aviso de Mercado Pago: se responde enseguida y el pago se consulta aparte */
  if (p === '/api/mp/webhook' && method === 'POST') {
    let b = {};
    try { b = await readBody(req, 64 * 1024); } catch (_) {}
    const type = q.get('type') || q.get('topic') || b.type || b.topic || '';
    const id = String(q.get('data.id') || q.get('id') || (b.data && b.data.id) || '');
    /* con la clave secreta de Webhooks cargada, un aviso sin firma válida no se procesa */
    if (!mp.verifySignature(req.headers, id)) return send(res, 401, { error: 'Firma inválida' });
    if ((!type || type === 'payment') && /^\d{1,20}$/.test(id)) {
      settlePayment(id).catch((e) => console.warn(`Webhook de Mercado Pago (${id}):`, e.message));
    }
    return send(res, 200, { ok: true });
  }

  /* al volver de Mercado Pago el panel confirma el pago (por si el aviso todavía no llegó) */
  if (p === '/api/company/payments/confirm' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const id = String(b.paymentId || '');
    if (!/^\d{1,20}$/.test(id)) return send(res, 400, { error: 'Número de pago inválido' });
    let row;
    try { row = await settlePayment(id, { companyId: me.company.id, kind: ['destacado', 'cosecha'] }); } catch (e) {
      if (e.status === 404) return send(res, 404, { error: 'No encontramos ese pago' });
      console.warn('Mercado Pago:', e.message);
      return send(res, 502, { error: 'No pudimos consultar el pago. Si se aprobó, el destacado se activa solo en unos minutos.' });
    }
    if (!row) return send(res, 404, { error: 'No encontramos ese pago' });
    return send(res, 200, { status: row.status, days: row.days, jobId: row.job_id, kind: row.kind });
  }

  /* ---------- Pack Cosecha (lado empresa): siempre sobre la empresa de la sesión ---------- */
  if (p === '/api/company/cosecha' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    return send(res, 200, cosechaState(me.company.id));
  }
  if (p === '/api/company/cosecha/request' && (method === 'POST' || method === 'DELETE')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    if (method === 'POST' && cosechaConfig().enabled) return send(res, 400, { error: 'El Pack Cosecha se paga con Mercado Pago desde tu panel' });
    if (method === 'POST' && store.cosechaActive(me.company.id)) return send(res, 400, { error: 'Ya tenés el Pack Cosecha activo' });
    store.setCosechaRequest(me.company.id, method === 'POST');
    return send(res, 200, cosechaState(me.company.id));
  }
  if (p === '/api/company/cosecha/checkout' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const cfg = cosechaConfig();
    if (!cfg.enabled) return send(res, 400, { error: 'El pago en línea del Pack Cosecha no está activo. Pedilo y te contactamos.' });
    const row = store.insertPayment({ companyId: me.company.id, jobTitle: 'Pack Cosecha', days: COSECHA_DAYS, amount: cfg.price, kind: 'cosecha' });
    try {
      const pref = await mp.createPreference({ reference: row.id, title: `Pack Cosecha WorkUco (${COSECHA_DAYS} días)`, amount: cfg.price, publicUrl: PUBLIC_URL, returnPath: '/panel' });
      store.setPaymentPreference(row.id, pref.id);
      return send(res, 200, { url: pref.url, reference: row.id });
    } catch (e) {
      console.warn('Mercado Pago:', e.message);
      store.setPaymentStatus(row.id, 'error');
      return send(res, 502, { error: 'No pudimos abrir Mercado Pago. Probá de nuevo en un rato.' });
    }
  }

  const compJobFeat = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)\/feature-request$/);
  if (compJobFeat && (method === 'POST' || method === 'DELETE')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compJobFeat[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    if (method === 'POST' && j.featured) return send(res, 400, { error: 'Este aviso ya está destacado' });
    if (method === 'POST' && j.status !== 'approved') return send(res, 400, { error: 'Sólo se pueden destacar avisos publicados' });
    return send(res, 200, { job: store.setFeatureRequest(j.id, method === 'POST') });
  }

  const compJobDup = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)\/duplicate$/);
  if (compJobDup && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compJobDup[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    const copy = store.insertJob({
      ...j, id: uid('j'), title: `${j.title} (copia)`, status: 'pending', featured: 0,
      createdAt: now(), publishedAt: null,
    });
    return send(res, 201, { job: copy });
  }

  const compJobApps = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)\/applications$/);
  if (compJobApps && method === 'GET') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión' });
    const j = store.job(compJobApps[1]);
    if (!j) return send(res, 404, { error: 'Oferta no encontrada' });
    if (me.role === 'company' && j.companyId !== me.company.id) return send(res, 403, { error: 'Sin permiso' });
    return send(res, 200, { applications: store.applicationsForJob(j.id) });
  }

  if (p === '/api/company/applications' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const applications = store.applicationsForCompany(me.company.id, {
      jobId: clean(q.get('job'), 40),
      stage: clean(q.get('stage'), 20),
      q: clean(q.get('q'), 80),
    });
    return send(res, 200, {
      applications: withMatch(applications),
      stages: store.stageCounts(me.company.id),
    });
  }

  if (p === '/api/company/applications.csv' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const rows = store.applicationsForCompany(me.company.id);
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['Nombre', 'Email', 'Teléfono', 'Puesto', 'Etapa', 'Puntaje IA', 'Postulación', 'Mensaje']]
      .concat(rows.map((a) => [
        a.name, a.email, a.phone, a.jobTitle, STAGE_LABEL[a.stage] || a.stage,
        a.aiScore == null ? '' : a.aiScore,
        new Date(a.createdAt).toLocaleDateString('es-AR'), a.message || '',
      ]))
      .map((r) => r.map(cell).join(';'));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="postulantes-workuco.csv"',
      'Cache-Control': 'no-store',
    });
    return res.end(`\uFEFF${lines.join('\r\n')}`);
  }

  if (p === '/api/company/applications' && method === 'POST') {
    /* alta manual de un postulante (para empresas que reciben CV por WhatsApp) */
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const job = store.job(clean(b.jobId, 40));
    if (!job || job.companyId !== me.company.id) return send(res, 404, { error: 'Elegí una oferta válida' });
    const name = clean(b.name, 120);
    const email = clean(b.email, 160).toLowerCase();
    const phone = clean(b.phone, 60);
    if (name.length < 3 || !isEmail(email) || !phoneOk(phone)) {
      return send(res, 400, { error: 'Completá nombre, email y teléfono' });
    }
    let cvFile = null; let cvName = '';
    if (b.cv && b.cv.data) {
      const buf = Buffer.from(String(b.cv.data), 'base64');
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(res, 400, { error: 'El CV debe ser un PDF' });
      cvFile = `cv-${uid('')}.pdf`;
      cvName = clean(b.cv.name, 120) || 'cv.pdf';
      fs.writeFileSync(path.join(UP_DIR, cvFile), buf);
    }
    const app = store.insertApplication({
      id: uid('a'), jobId: job.id, name, email, phone, manual: true,
      message: cleanMultiline(b.message, 2000), cvFile, cvName, createdAt: now(),
    });
    return send(res, 201, { application: store.applicationDetail(app.id) });
  }

  const appOne = p.match(/^\/api\/company\/applications\/([a-z0-9]+)$/);
  if (appOne && (method === 'GET' || method === 'PATCH')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const a = store.applicationDetail(appOne[1]);
    if (!a || a.companyId !== me.company.id) return send(res, 404, { error: 'Postulación no encontrada' });
    if (method === 'GET') return send(res, 200, { application: a });
    const b = await readBody(req);
    const patch = {};
    if ('stage' in b) {
      if (!STAGES.includes(b.stage)) return send(res, 400, { error: 'Etapa inválida' });
      patch.stage = b.stage;
    }
    if ('rating' in b) patch.rating = Math.max(0, Math.min(5, Number(b.rating) || 0));
    if ('notes' in b) patch.notes = cleanMultiline(b.notes, 4000);
    if ('tags' in b) patch.tags = arrOf(b.tags, 10, 30);
    if ('status' in b) { store.setApplicationStatus(a.id, b.status); }
    if (Object.keys(patch).length) store.updateApplication(a.id, patch);
    const after = store.applicationDetail(a.id);
    if (a.candidateId && after.stage !== a.stage && STAGE_NOTICE[after.stage]) {
      const [title, body] = STAGE_NOTICE[after.stage](a.companyName, a.jobTitle);
      tryNotify('candidate', a.candidateId, { kind: 'etapa', title, body, link: '/mi-perfil?tab=postulaciones' });
    }
    return send(res, 200, { application: after });
  }

  const appAnalyze = p.match(/^\/api\/company\/applications\/([a-z0-9]+)\/analyze$/);
  if (appAnalyze && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const a = store.applicationDetail(appAnalyze[1]);
    if (!a || a.companyId !== me.company.id) return send(res, 404, { error: 'Postulación no encontrada' });
    const company = store.company(me.company.id);
    const cfg = ai.configOf(company);
    if (!cfg.provider) return send(res, 400, { error: 'Primero configurá un proveedor de IA en la pestaña IA' });
    if (!cfg.apiKey) return send(res, 400, { error: 'Falta la API key de IA' });
    try {
      const result = await analyzeAndSave(a.id, me.company.id);
      return send(res, 200, { application: store.applicationDetail(a.id), ai: result });
    } catch (e) {
      return send(res, 502, { error: `No pudimos conectar con la IA: ${e.message || 'error desconocido'}` });
    }
  }

  const cvMatch = p.match(/^\/api\/company\/cv\/([a-z0-9]+)$/);
  if (cvMatch && method === 'GET') {
    const a = store.application(cvMatch[1]);
    if (!a || !a.cvFile) return send(res, 404, { error: 'CV no encontrado' });
    const user = current(req);
    const allowed = user && (user.role === 'admin' || (user.role === 'company' && a.companyId === user.company.id)
      || (user.role === 'candidate' && a.candidateId === user.candidate.id));
    if (!allowed) return send(res, user ? 403 : 401, { error: 'Sin permiso' });
    const file = path.join(UP_DIR, path.basename(a.cvFile));
    return serveFile(res, file, 'application/pdf', false, a.cvName || 'cv.pdf');
  }

  /* ---------- panel / IA de empresa ---------- */
  if (p === '/api/company/dashboard' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const jobs = store.companyJobs(me.company.id);
    const applications = withMatch(store.applicationsForCompany(me.company.id));
    const company = store.company(me.company.id);
    return send(res, 200, {
      company: publicCompany(company, { privateView: true }),
      jobs,
      applications,
      stageCounts: store.stageCounts(me.company.id),
      response: store.responseStats(me.company.id),
      kpis: {
        views: jobs.reduce((n, j) => n + (j.views || 0), 0),
        applications: applications.length,
        newApplications: applications.filter((a) => a.stage === 'nuevo').length,
        hired: applications.filter((a) => a.stage === 'contratado').length,
        published: jobs.filter((j) => j.status === 'approved').length,
        pending: jobs.filter((j) => j.status === 'pending').length,
      },
    });
  }

  if (p === '/api/company/ai' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    return send(res, 200, { ai: publicCompany(store.company(me.company.id), { privateView: true }).ai });
  }

  if (p === '/api/company/ai' && method === 'PATCH') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const c = store.company(me.company.id);
    const b = await readBody(req);
    const patch = {};
    if ('provider' in b) {
      if (b.provider && !ai.PROVIDERS.some((x) => x.id === b.provider)) return send(res, 400, { error: 'Proveedor inválido' });
      patch.ai_provider = b.provider || null;
    }
    if ('apiKey' in b) {
      const key = clean(b.apiKey, 300);
      patch.ai_key = key === '' ? null : key;
    }
    if ('model' in b) patch.ai_model = clean(b.model, 120) || null;
    if ('baseUrl' in b) patch.ai_base_url = clean(b.baseUrl, 300) || null;
    if ('enabled' in b) patch.ai_enabled = b.enabled ? 1 : 0;
    if ('auto' in b) patch.ai_auto = b.auto ? 1 : 0;
    const updated = store.updateCompanyAi(c.id, patch);
    return send(res, 200, { ai: publicCompany(updated, { privateView: true }).ai });
  }

  if (p === '/api/company/ai/test' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    try {
      const out = await ai.testConnection(store.company(me.company.id));
      return send(res, 200, { ok: true, reply: out });
    } catch (e) {
      return send(res, 502, { error: `No pudimos conectar con la IA: ${e.message}` });
    }
  }

  if (p === '/api/company/ai/flyer' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const img = parseDataUrl(b.image);
    if (!img) return send(res, 400, { error: 'El flyer tiene que ser una imagen JPG, PNG o WebP' });
    const cfg = ai.configOf(store.company(me.company.id));
    if (!cfg.provider || !cfg.apiKey) return send(res, 400, { error: 'Configurá tu IA en Panel → IA para completar el aviso desde el flyer' });
    try {
      const meta = { localities: LOCALITIES, categories: CATEGORIES, types: TYPES, modalities: MODALITIES };
      const { system, user } = buildImportPrompt(meta);
      const raw = await ai.callProvider(cfg, { system, user, images: [{ mime: img.mime, base64: img.buf.toString('base64') }], maxTokens: 3000 });
      const { drafts } = normalizeDrafts(raw, meta, '', 1);
      return send(res, 200, { draft: drafts[0] || null });
    } catch (e) {
      return send(res, 502, { error: `No pudimos leer el flyer con la IA: ${e.message}` });
    }
  }

  if (p === '/api/company/ai/describe' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const company = store.company(me.company.id);
    const cfg = ai.configOf(company);
    if (!cfg.provider || !cfg.apiKey) return send(res, 400, { error: 'Configurá tu API de IA para generar el aviso' });
    try {
      const out = await ai.generateJob({
        company,
        inputs: {
          title: clean(b.title, 120), category: clean(b.category, 60), locality: clean(b.locality, 60),
          modality: clean(b.modality, 40), type: clean(b.type, 40), notes: cleanMultiline(b.notes, 600),
          benefits: arrOf(b.benefits, 12, 40), positions: Number(b.positions) || 1,
        },
      });
      return send(res, 200, { draft: out });
    } catch (e) {
      return send(res, 502, { error: `No pudimos conectar con la IA: ${e.message}` });
    }
  }

  /* ---------- candidato ---------- */
  if (p === '/api/candidate/profile' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    const c = store.candidate(me.candidate.id);
    return send(res, 200, { candidate: publicCandidate(c, { privateView: true }) });
  }

  if (p === '/api/candidate/profile' && method === 'PATCH') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    const c = store.candidate(me.candidate.id);
    const b = await readBody(req);
    const patch = {};
    if ('name' in b) {
      patch.name = clean(b.name, 120);
      if (patch.name.length < 2) return send(res, 400, { error: 'Nombre inválido', fields: { name: 'Nombre inválido' } });
    }
    if ('phone' in b) {
      patch.phone = clean(b.phone, 60);
      if (!phoneOk(patch.phone)) return send(res, 400, { error: 'Teléfono inválido', fields: { phone: 'Teléfono inválido' } });
    }
    if ('locality' in b) patch.locality = LOCALITIES.includes(b.locality) ? b.locality : '';
    if ('headline' in b) patch.headline = clean(b.headline, 120);
    if ('about' in b) patch.about = cleanMultiline(b.about, 1600);
    if ('skills' in b) patch.skills = arrOf(b.skills, 20, 30);
    if ('experience' in b) patch.experience = cleanMultiline(b.experience, 1200);
    if ('education' in b) patch.education = cleanMultiline(b.education, 800);
    if ('availability' in b) patch.availability = clean(b.availability, 120);
    if ('linkedin' in b) patch.linkedin = cleanUrl(b.linkedin);
    if ('openToWork' in b) patch.open_to_work = b.openToWork ? 1 : 0;
    if ('isPublic' in b) patch.is_public = b.isPublic ? 1 : 0;
    if ('categories' in b) patch.categories = (Array.isArray(b.categories) ? b.categories : []).filter((x) => CATEGORIES.includes(x));
    if ('salaryMin' in b) patch.salary_min = Math.min(99999999, Math.max(0, Math.round(Number(b.salaryMin) || 0)));
    if ('photo' in b && b.photo) {
      const f = saveImage(b.photo, 'perfil');
      if (c.photo_file) removeUpload(c.photo_file);
      patch.photo_file = f;
    }
    if (b.removePhoto) { if (c.photo_file) removeUpload(c.photo_file); patch.photo_file = null; }
    if (b.cv && b.cv.data) {
      const buf = Buffer.from(String(b.cv.data), 'base64');
      if (buf.length > 4 * 1024 * 1024) return send(res, 413, { error: 'El CV supera los 4 MB' });
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(res, 400, { error: 'El CV debe ser un PDF' });
      const f = `cv-${uid('')}.pdf`;
      fs.writeFileSync(path.join(UP_DIR, f), buf);
      if (c.cv_file) removeUpload(c.cv_file);
      patch.cv_file = f; patch.cv_name = clean(b.cv.name, 120) || 'cv.pdf';
    }
    if (b.removeCv) { if (c.cv_file) removeUpload(c.cv_file); patch.cv_file = null; patch.cv_name = ''; }
    const updated = store.updateCandidate(c.id, patch);
    return send(res, 200, { candidate: publicCandidate(updated, { privateView: true }) });
  }

  if (p === '/api/candidate/applications' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    return send(res, 200, { applications: store.applicationsForCandidate(me.candidate.id) });
  }

  if (p === '/api/candidate/saved' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    return send(res, 200, { jobs: store.savedJobs(me.candidate.id) });
  }

  const saveMatch = p.match(/^\/api\/candidate\/saved\/([a-z0-9]+)$/);
  if (saveMatch && method === 'POST') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    return send(res, 200, { saved: store.toggleSaved(me.candidate.id, saveMatch[1]) });
  }

  if (p === '/api/candidate/recommended' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    const c = store.candidate(me.candidate.id);
    const applied = new Set(store.applicationsForCandidate(c.id).map((a) => a.jobId));
    const pr = prefsOf('candidate', c);
    const jobs = store.searchJobs({ limit: 1000 }).jobs
      .filter((j) => !applied.has(j.id))
      /* jornada, modalidad y changas elegidas en Preferencias (sin elegir, no se filtra) */
      .filter((j) => (!pr.types.length || pr.types.includes(j.type)) && (!pr.modalities.length || pr.modalities.includes(j.modality)) && (pr.gigs || !j.gig))
      .map((j) => ({ ...jobSummary(j), match: matchFor(c, j) }))
      .filter((j) => j.match && j.match.score >= 40)
      .sort(byMatchDesc).slice(0, 6);
    return send(res, 200, { jobs });
  }

  /* ---------- alertas de empleo ---------- */
  if (p === '/api/candidate/alerts' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    return send(res, 200, { alerts: store.alertsFor(me.candidate.id), max: MAX_ALERTS });
  }
  if (p === '/api/candidate/alerts' && method === 'POST') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    const b = await readBody(req);
    const a = {
      q: clean(b.q, 60),
      locality: [...new Set(String(b.locality || '').split(',').map((x) => x.trim()).filter((x) => LOCALITIES.includes(x)))].join(','),
      category: CATEGORIES.includes(b.category) ? b.category : '',
      type: TYPES.includes(b.type) ? b.type : '',
      modality: MODALITIES.includes(b.modality) ? b.modality : '',
      gig: b.gig === true || b.gig === '1' || b.gig === 1,
    };
    if (!a.q && !a.locality && !a.category && !a.type && !a.modality && !a.gig) {
      return send(res, 400, { error: 'Elegí al menos un filtro para la alerta' });
    }
    if (store.alertsFor(me.candidate.id).length >= MAX_ALERTS) {
      return send(res, 400, { error: `Podés tener hasta ${MAX_ALERTS} alertas. Borrá alguna para crear otra.` });
    }
    const alert = store.insertAlert({ id: uid('al'), candidateId: me.candidate.id, label: alertLabel(a), ...a });
    return send(res, 201, { alert });
  }
  const alertOne = p.match(/^\/api\/candidate\/alerts\/([a-z0-9]+)$/);
  if (alertOne && method === 'DELETE') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    if (!store.deleteAlert(alertOne[1], me.candidate.id)) return send(res, 404, { error: 'Alerta no encontrada' });
    return send(res, 200, { ok: true });
  }

  /* ---------- invitaciones (lado persona) ---------- */
  if (p === '/api/candidate/invitations' && method === 'GET') {
    if (!me || me.role !== 'candidate') return send(res, 401, { error: 'Iniciá sesión' });
    const invitations = store.invitationsForCandidate(me.candidate.id).map((i) => ({
      id: i.id, job: jobSummary(store.job(i.job_id)), companyName: i.company_name,
      message: i.message || '', status: i.status, createdAt: i.created_at,
    }));
    return send(res, 200, { invitations });
  }

  /* ---------- notificaciones (personas y empresas) ---------- */
  if (p === '/api/notifications' || p === '/api/notifications/read') {
    const who = me && me.role === 'candidate' ? ['candidate', me.candidate.id]
      : me && me.role === 'company' ? ['company', me.company.id] : null;
    if (!who) return send(res, 401, { error: 'Iniciá sesión' });
    if (p === '/api/notifications' && method === 'GET') {
      return send(res, 200, { items: store.notifications(...who), unread: store.unreadCount(...who) });
    }
    if (p === '/api/notifications/read' && method === 'POST') {
      const b = await readBody(req);
      store.markRead(...who, clean(b.id, 40));
      return send(res, 200, { ok: true, unread: store.unreadCount(...who) });
    }
  }

  /* ---------- base de talento e invitaciones (lado empresa) ---------- */
  if (p === '/api/company/talent' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    let job = null;
    if (q.get('jobId')) {
      job = store.job(clean(q.get('jobId'), 40));
      if (!job) return send(res, 404, { error: 'Oferta no encontrada' });
      if (job.companyId !== me.company.id) return send(res, 403, { error: 'Esa oferta no es de tu empresa' });
    }
    const marks = job ? store.jobPeople(job.id) : null;
    const people = store.talent({
      q: clean(q.get('q'), 60),
      locality: LOCALITIES.includes(q.get('locality')) ? q.get('locality') : '',
      category: CATEGORIES.includes(q.get('category')) ? q.get('category') : '',
    }).map((c) => ({
      /* sin teléfono ni mail: el contacto llega recién cuando la persona se postula */
      id: c.id, name: c.name, photo: c.photo_file ? `/api/photo/c/${c.id}` : null,
      headline: c.headline || '', about: c.about || '', locality: c.locality || '',
      skills: jparse(c.skills, []), categories: jparse(c.categories, []),
      availability: c.availability || '', experience: c.experience || '',
      match: job ? matchFor(c, job, 'company') : null,
      invited: marks ? marks.invited.has(c.id) : false,
      applied: marks ? marks.applied.has(c.id) : false,
    }));
    if (job) people.sort(byMatchDesc);
    return send(res, 200, { people, invitesLeft: Math.max(0, inviteLimit(me.company.id) - store.invitationsToday(me.company.id)) });
  }

  if (p === '/api/company/invitations' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const job = store.job(clean(b.jobId, 40));
    if (!job) return send(res, 404, { error: 'Oferta no encontrada' });
    if (job.companyId !== me.company.id) return send(res, 403, { error: 'Esa oferta no es de tu empresa' });
    if (job.status !== 'approved') return send(res, 400, { error: 'Sólo podés invitar a ofertas publicadas' });
    if (job.closesAt && job.closesAt < todayAR()) return send(res, 400, { error: 'Esa búsqueda ya cerró: extendé la fecha de cierre para invitar' });
    const c = store.candidate(clean(b.candidateId, 40));
    if (!c || !c.open_to_work) return send(res, 404, { error: 'Esa persona no está disponible' });
    if (store.applicationByCandidate(c.id, job.id)) return send(res, 409, { error: 'Esa persona ya se postuló a esta oferta' });
    if (store.invitation(job.id, c.id)) return send(res, 409, { error: 'Ya la invitaste a esta oferta' });
    const lim = inviteLimit(me.company.id);
    if (store.invitationsToday(me.company.id) >= lim) {
      return send(res, 429, { error: `Llegaste al límite de ${lim} invitaciones por día` });
    }
    const id = uid('i');
    store.insertInvitation({ id, companyId: me.company.id, jobId: job.id, candidateId: c.id, message: cleanMultiline(b.message, 400) });
    tryNotify('candidate', c.id, {
      kind: 'invitacion', title: `${job.companyName} te invitó a postularte`,
      body: `Puesto: ${job.title}`, link: `/oferta/${job.id}`,
    });
    return send(res, 201, { ok: true, invitation: { id } });
  }

  /* ---------- CV WorkUco y perfil público ---------- */
  const cvData = p.match(/^\/api\/cv-data\/([a-z0-9]+)$/);
  if (cvData && method === 'GET') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión' });
    const c = store.candidate(cvData[1]);
    if (!c) return send(res, 404, { error: 'Perfil no encontrado' });
    const allowed = me.role === 'admin' || (me.role === 'candidate' && me.candidate.id === c.id)
      || (me.role === 'company' && companyHasApplicant(me.company.id, c.id));
    if (!allowed) return send(res, 403, { error: 'Sin permiso para ver este CV' });
    const out = publicCandidate(c, { privateView: true });
    if (me.role === 'company') { delete out.salaryMin; delete out.isPublic; delete out.publicSlug; }
    return send(res, 200, { candidate: out });
  }

  const pubProfile = p.match(/^\/api\/public\/([a-z0-9-]+)(\/photo)?$/);
  if (pubProfile && method === 'GET') {
    const c = store.candidateBySlug(pubProfile[1]);
    if (!c || !c.is_public) return send(res, 404, { error: 'Este perfil no es público' });
    if (pubProfile[2]) {
      if (!c.photo_file) return send(res, 404, { error: 'Sin foto' });
      return serveFile(res, path.join(UP_DIR, path.basename(c.photo_file)), 'image/*', true);
    }
    /* nunca teléfono ni mail en el perfil público */
    return send(res, 200, {
      person: {
        slug: c.public_slug, name: c.name, headline: c.headline || '', about: c.about || '',
        locality: c.locality || '', skills: jparse(c.skills, []), categories: jparse(c.categories, []),
        experience: c.experience || '', education: c.education || '', availability: c.availability || '',
        openToWork: !!c.open_to_work, photo: c.photo_file ? `/api/public/${c.public_slug}/photo` : null,
      },
    });
  }

  /* ---------- avisos importados (admin) ---------- */
  if (p.startsWith('/api/admin/import')) {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const importMeta = { localities: LOCALITIES, categories: CATEGORIES, types: TYPES, modalities: MODALITIES };

    if (p === '/api/admin/import/config' && method === 'GET') {
      const cfg = ai.importConfig();
      const ver = ai.importVerifierConfig();
      return send(res, 200, {
        aiReady: IMPORT_FAKE || !!cfg, provider: IMPORT_FAKE ? 'prueba' : (cfg ? cfg.provider : ''),
        model: cfg ? cfg.model : '', verifier: ver ? { provider: ver.provider, model: ver.model } : null,
      });
    }

    if (p === '/api/admin/import/parse' && method === 'POST') {
      const b = await readBody(req, 40 * 1024 * 1024);
      const text = String(b.text || '');
      const images = Array.isArray(b.images) ? b.images : [];
      if (text.length > 20000) return send(res, 413, { error: 'El texto supera los 20.000 caracteres: pegalo en partes' });
      if (images.length > 6) return send(res, 400, { error: 'Podés subir hasta 6 imágenes por vez' });
      if (!text.trim() && !images.length) return send(res, 400, { error: 'Pegá el texto de los avisos o subí capturas' });
      const imgs = [];
      for (const i of images) {
        const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(i && i.mime) ? i.mime : '';
        const base64 = String((i && i.base64) || '').replace(/^data:[^,]+,/, '');
        if (!mime || !base64) return send(res, 400, { error: 'Las imágenes tienen que ser JPG, PNG o WebP' });
        if (base64.length > 4 * 1024 * 1024 * 1.37) return send(res, 413, { error: 'Cada imagen puede pesar hasta 4 MB' });
        imgs.push({ mime, base64 });
      }
      if (IMPORT_FAKE) return send(res, 200, normalizeDrafts(IMPORT_FAKE_REPLY, importMeta, text, imgs.length));
      const cfg = ai.importConfig();
      if (!cfg) return send(res, 400, { code: 'no_ai', error: 'La IA del importador no está configurada: cargá los avisos a mano o configurá WORKUCO_IMPORT_AI_PROVIDER y WORKUCO_IMPORT_AI_KEY' });
      /* la IA principal y, si está configurada, una segunda que lee lo mismo por separado para comparar */
      const ver = ai.importVerifierConfig();
      const { system, user } = buildImportPrompt(importMeta);
      const ask = (c) => ai.callProvider(c, { system, user: text.trim() ? `${user}\n\n${text}` : user, images: imgs, maxTokens: 6000, timeoutMs: 120000 })
        .then((raw) => normalizeDrafts(raw, importMeta, text, imgs.length));
      const [main, second] = await Promise.allSettled([ask(cfg), ver ? ask(ver) : Promise.resolve(null)]);
      if (main.status === 'rejected' && !(second.value && second.value.drafts.length)) {
        return send(res, 502, { error: `No pudimos leer los avisos con la IA: ${main.reason && main.reason.message}` });
      }
      /* si la principal falla, se usa la segunda (avisando) */
      const base = main.status === 'fulfilled' ? main.value : second.value;
      const out = { drafts: groundDrafts(base.drafts, text), warnings: [...(base.warnings || [])] };
      if (main.status === 'rejected') out.warnings.push(`La IA principal falló (${main.reason && main.reason.message}); estos borradores los leyó sólo la de verificación: revisalos bien.`);
      else if (ver && second.status === 'fulfilled' && second.value) {
        const cc = crossCheck(out.drafts, second.value.drafts);
        out.drafts = cc.drafts; out.warnings.push(...cc.warnings);
      } else if (ver) out.warnings.push(`La IA de verificación no respondió (${second.reason && second.reason.message}): estos borradores no están comparados.`);
      out.verified = !!(ver && main.status === 'fulfilled' && second.status === 'fulfilled');
      return send(res, 200, out);
    }

    if (p === '/api/admin/import/publish' && method === 'POST') {
      const b = await readBody(req);
      const d = b.draft || {};
      const companyName = clean(d.companyName, 120);
      const contactPhone = clean(d.contactPhone, 60);
      const hasEmail = isEmail(d.contactEmail);
      const v = validateJob({ ...d, contactEmail: hasEmail ? d.contactEmail : 'sin-email@import.workuco' }, { hasFlyer: !!b.flyer });
      const fields = { ...v.errors };
      if (companyName.length < 2) fields.companyName = 'Falta el nombre de la empresa';
      if (Object.keys(fields).length) return send(res, 400, { error: 'Revisá el borrador', fields });
      const phoneNorm = normPhone(contactPhone);
      const nameNorm = normName(companyName);
      if (store.blocked(phoneNorm, nameNorm)) {
        return send(res, 409, { code: 'blocked', error: 'Esta empresa pidió no aparecer en WorkUco' });
      }
      if (!b.force && store.importedDuplicate(phoneNorm, v.data.title)) {
        return send(res, 409, { code: 'duplicate', error: 'Ya hay un aviso igual de esta empresa publicado' });
      }
      const co = store.findUnclaimed({ phoneNorm, nameNorm })
        || store.createUnclaimed({ name: companyName, phone: contactPhone, locality: v.data.locality, phoneNorm, nameNorm });
      const flyerFile = b.flyer ? saveImage(b.flyer, 'flyer') : null;
      const limit = addDaysAR(30);
      const closesAt = v.data.closesAt && v.data.closesAt < limit ? v.data.closesAt : limit;
      const job = store.insertJob({
        id: uid('j'), companyId: co.id, ...v.data,
        contactEmail: hasEmail ? v.data.contactEmail : '', contactPhone, closesAt, flyerFiles: flyerFile ? [flyerFile] : [],
        status: 'approved', featured: 0, createdAt: now(), publishedAt: now(),
      });
      store.setJobSource(job.id, { sourceName: clean(b.sourceName, 80) || 'Canal de WhatsApp', sourceText: cleanMultiline(b.sourceText, 20000) });
      const saved = store.job(job.id);
      announceJob(saved);
      return send(res, 201, { job: saved, company: publicCompany(store.company(co.id)) });
    }

    if (p === '/api/admin/import' && method === 'GET') {
      const origin = PUBLIC_URL || `http://${req.headers.host}`;
      const companies = store.importedOverview().map(({ company: c, jobs }) => {
        const claimUrl = c.claim_token ? `${origin}/reclamar/${c.claim_token}` : '';
        const applications = jobs.reduce((n, j) => n + j.applications, 0);
        const open = jobs.find((j) => j.status === 'approved') || jobs[0];
        const msg = !claimUrl ? '' : (c.claim_msg || (open ? defaultClaimMessage({ jobTitle: open.title, sourceName: open.source_name, applications, claimUrl }) : ''));
        return {
          id: c.id, name: c.name, phone: c.phone || '', locality: c.locality || '',
          claimed: c.claimed !== 0, notifyStatus: c.notify_status || 'sin_avisar', notifiedAt: c.notified_at || null,
          claimUrl, waUrl: msg && c.phone_norm ? `https://wa.me/549${c.phone_norm}?text=${encodeURIComponent(msg)}` : '',
          message: c.claim_msg || '', messageText: msg,
          email: importEmailOf(c.id), gmailUrl: gmailCompose(importEmailOf(c.id), msg),
          applications,
          jobs: jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, closesAt: j.closes_at, sourceName: j.source_name || '', sourceText: j.source_text || '', applications: j.applications })),
          createdAt: c.created_at,
        };
      });
      const responses = store.importResponses();
      const acceptedAt = new Map(responses.filter((r) => r.action === 'aceptada').map((r) => [r.companyId, r.createdAt]));
      for (const c of companies) c.claimedAt = acceptedAt.get(c.id) || null;
      return send(res, 200, { companies, removed: store.blockedCompanies(), responses });
    }

    /* mensaje para avisarle a la empresa: lo escribe la IA (o el texto fijo si no hay IA) y el admin lo puede editar */
    const impMsg = p.match(/^\/api\/admin\/import\/companies\/([a-z0-9]+)\/message$/);
    if (impMsg && (method === 'POST' || method === 'PUT')) {
      const c = store.company(impMsg[1]);
      if (!c || !c.imported || c.claimed !== 0 || !c.claim_token) return send(res, 404, { error: 'Ficha sin reclamar no encontrada' });
      const origin = PUBLIC_URL || `http://${req.headers.host}`;
      const claimUrl = `${origin}/reclamar/${c.claim_token}`;
      const out = (message, extra = {}) => {
        store.setClaimMessage(c.id, message);
        return send(res, 200, { message, waUrl: c.phone_norm ? `https://wa.me/549${c.phone_norm}?text=${encodeURIComponent(message)}` : '', gmailUrl: gmailCompose(importEmailOf(c.id), message), ...extra });
      };
      if (method === 'PUT') {
        const b = await readBody(req);
        const text = cleanMultiline(b.message, 1500);
        if (!text) return send(res, 400, { error: 'El mensaje está vacío' });
        return out(normalizeClaimMessage(text, claimUrl));
      }
      const jobs = store.all(`SELECT j.title, j.locality, j.source_name,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS apps FROM jobs j WHERE j.company_id=? ORDER BY j.created_at DESC`, c.id);
      const info = {
        name: c.name, jobs: jobs.map((j) => j.title), jobTitle: (jobs[0] || {}).title || '', locality: (jobs[0] || {}).locality || c.locality || '',
        sourceName: (jobs[0] || {}).source_name || '', applications: jobs.reduce((n, j) => n + j.apps, 0), claimUrl,
      };
      const fallback = (why) => out(defaultClaimMessage(info), { ai: false, warning: why });
      if (IMPORT_FAKE) {
        return out(normalizeClaimMessage({ mensaje: `Hola, ¿cómo están? Les escribimos de WorkUco, el portal de empleo del Valle de Uco 😊 Vimos que ${info.name} busca "${info.jobTitle}" y la publicamos gratis para que llegue a más gente de la zona. Si quieren, pueden reclamarla para ver a sus postulantes, o pedirnos que la borremos con un toque. ¡Muchas gracias! {LINK}` }, claimUrl), { ai: true });
      }
      const cfg = ai.importConfig();
      if (!cfg) return fallback('La IA del importador no está configurada: usamos el mensaje de siempre.');
      try {
        const { system, user } = buildClaimMessagePrompt(info);
        const raw = await ai.callProvider(cfg, { system, user, maxTokens: 700, timeoutMs: 120000 });
        return out(normalizeClaimMessage(raw, claimUrl), { ai: true });
      } catch (e) {
        return fallback(`La IA no respondió (${e.message}): usamos el mensaje de siempre.`);
      }
    }

    const impCo = p.match(/^\/api\/admin\/import\/companies\/([a-z0-9]+)(\/notified)?$/);
    if (impCo && method === 'POST' && impCo[2]) {
      if (!store.markNotified(impCo[1])) return send(res, 404, { error: 'Ficha no encontrada' });
      return send(res, 200, { ok: true });
    }
    if (impCo && method === 'DELETE' && !impCo[2]) {
      const c = store.company(impCo[1]);
      if (!c || !c.imported) return send(res, 404, { error: 'Ficha importada no encontrada' });
      store.deleteCompanyCascade(c.id);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'API no encontrada' });
  }

  /* ---------- reclamo de fichas importadas (público, con código) ---------- */
  /* cada respuesta queda registrada y le llega un mail al dueño de WorkUco */
  const importResponseMail = (r) => {
    const fecha = new Date(r.created_at - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    const avisos = jparse(r.jobs, []).join(', ') || 'sin avisos';
    const motivo = r.action === 'rechazada'
      ? `\nMotivo: ${IMPORT_REASONS[r.reason] || r.reason}${r.comment ? `\nComentario: ${r.comment}` : ''}` : '';
    sendMail(ADMIN_EMAIL, {
      subject: `${r.name} ${r.action === 'aceptada' ? 'aceptó su aviso en WorkUco' : 'borró su aviso de WorkUco'}`,
      title: r.action === 'aceptada' ? `${r.name} aceptó su aviso` : `${r.name} borró su aviso`,
      body: `Avisos: ${avisos}\nFecha: ${fecha} (hora argentina)${motivo}\n\nLo ves en Admin → Importar.`,
      cta: { label: 'Ver en el admin', url: `${mailOrigin()}/admin#importar` },
    }).catch(() => {});
  };
  const claimM = p.match(/^\/api\/claim\/([^/]+)(\/accept|\/delete)?$/);
  if (claimM) {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const c = store.companyByClaimToken(claimM[1]);
    if (!c) { loginFailed(req); return send(res, 404, { error: 'Este link ya se usó o no existe' }); }
    const action = claimM[2] || '';

    if (!action && method === 'GET') {
      return send(res, 200, {
        company: publicCompany(c),
        jobs: store.companyJobs(c.id).map(jobSummary),
        applicationsCount: store.countApplicantsOf(c.id),
        reasons: Object.entries(IMPORT_REASONS).map(([id, label]) => ({ id, label })),
      });
    }

    if (action === '/accept' && method === 'POST') {
      const b = await readBody(req);
      const email = clean(b.email, 160).toLowerCase();
      const password = String(b.password || '');
      const fieldsErr = {};
      if (!isEmail(email)) fieldsErr.email = 'Email inválido';
      if (password.length < 8) fieldsErr.password = 'La contraseña debe tener al menos 8 caracteres';
      if (b.acceptTerms !== true) fieldsErr.acceptTerms = 'Para reclamar la ficha tenés que aceptar los términos y la política de privacidad';
      if (Object.keys(fieldsErr).length) return send(res, 400, { error: 'Revisá los datos', fields: fieldsErr });
      if (store.companyByEmail(email) || store.candidateByEmail(email)) {
        return send(res, 409, { error: 'Ya hay una cuenta con ese email: ingresá con ella o usá otro', fields: { email: 'Email ya registrado' } });
      }
      const claimed = store.claimCompany(c.id, { email, password: hashPassword(password) });
      if (!claimed) return send(res, 404, { error: 'Este link ya se usó o no existe' });
      store.acceptTerms('companies', c.id, legal.TERMS_VERSION);
      importResponseMail(store.recordImportResponse({ company: c, action: 'aceptada' }));
      setSession(res, 'company', req, { companyId: c.id });
      const seen = new Set();
      for (const a of store.applicantsOf(c.id)) {
        if (seen.has(a.candidateId)) continue;
        seen.add(a.candidateId);
        tryNotify('candidate', a.candidateId, { kind: 'etapa', title: `${c.name} ya administra su aviso en WorkUco`, body: `Tu postulación a "${a.jobTitle}" ya está en manos de la empresa.`, link: '/mi-perfil?tab=postulaciones' });
      }
      return send(res, 200, { company: publicCompany(claimed, { privateView: true }) });
    }

    if (action === '/delete' && method === 'POST') {
      const b = await readBody(req);
      const reason = String(b.reason || '');
      if (!Object.prototype.hasOwnProperty.call(IMPORT_REASONS, reason)) {
        return send(res, 400, { error: 'Contanos por qué lo borramos', fields: { reason: 'Elegí un motivo' } });
      }
      importResponseMail(store.recordImportResponse({ company: c, action: 'rechazada', reason, comment: cleanMultiline(b.comment, 300) }));
      const applicants = store.applicantsOf(c.id);
      store.addBlock('phone', c.phone_norm || normPhone(c.phone), c.name);
      store.addBlock('name', c.name_norm || normName(c.name), c.name);
      store.deleteCompanyCascade(c.id);
      for (const a of applicants) {
        tryNotify('candidate', a.candidateId, { kind: 'etapa', title: `El aviso "${a.jobTitle}" fue retirado por la empresa`, body: 'Hay más búsquedas en WorkUco para vos.', link: '/buscar' });
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Método no permitido' });
  }

  /* ---------- admin ---------- */
  if (p === '/api/admin/login' && method === 'POST') {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const okMail = String(b.email || '').trim().toLowerCase() === ADMIN_EMAIL;
    const okPass = String(b.password || '') === ADMIN_PASS;
    if (!okMail || !okPass) { loginFailed(req); return send(res, 401, { error: 'Credenciales incorrectas' }); }
    fails.delete(throttleKey(req));
    setSession(res, 'admin', req);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/stats' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, { stats: store.stats() });
  }

  if (p === '/api/admin/featured-stats' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, store.featuredStats());
  }

  if (p === '/api/admin/jobs' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const status = ['pending', 'approved', 'rejected', 'closed'].includes(q.get('status')) ? q.get('status') : '';
    const jobs = store.allJobs({ status }).map((j) => ({ ...j, warnings: legal.discriminationHints(j.title, j.description, j.requirements, j.responsibilities) }));
    return send(res, 200, { jobs });
  }

  const admJob = p.match(/^\/api\/admin\/jobs\/([a-z0-9]+)$/);
  if (admJob && method === 'PATCH') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const j = store.job(admJob[1]);
    if (!j) return send(res, 404, { error: 'Oferta no encontrada' });
    const b = await readBody(req);
    const patch = {};
    if ('status' in b) {
      if (!['pending', 'approved', 'rejected', 'closed'].includes(b.status)) return send(res, 400, { error: 'Estado inválido' });
      patch.status = b.status;
      patch.publishedAt = b.status === 'approved' ? (j.publishedAt || now()) : null;
      if (b.status === 'approved') patch.rejectReason = null;
    }
    if ('featured' in b) patch.featured = !!b.featured;
    if ('featuredDays' in b && b.featuredDays !== null && !FEATURED_DAYS.includes(Number(b.featuredDays))) {
      return send(res, 400, { error: `Elegí ${FEATURED_DAYS.join(', ')} días` });
    }
    if ('rejectReason' in b) patch.rejectReason = clean(b.rejectReason, 300);
    if (Object.keys(b).some((k) => ['title', 'description', 'locality', 'category', 'type', 'modality'].includes(k))) {
      const merged = { ...j, ...b, contactEmail: b.contactEmail || j.contactEmail };
      const v = validateJob(merged);
      if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
      Object.assign(patch, v.data);
    }
    let updated = store.updateJob(j.id, patch);
    if ('featuredDays' in b) updated = store.setJobFeatured(j.id, b.featuredDays === null ? false : Date.now() + Number(b.featuredDays) * 86400000);
    if (patch.status === 'approved' && j.status !== 'approved') {
      announceJob(updated);
      /* Pack Cosecha vigente: un aviso de cosecha nuevo también sale destacado, hasta 5 */
      if (store.cosechaActive(j.companyId) && (updated.category === 'Agricultura' || updated.gig) && store.cosechaFeaturedCount(j.companyId) < 5) {
        store.featureUntilAtLeast(j.id, store.company(j.companyId).cosecha_until);
        updated = store.job(j.id);
      }
    }
    if (patch.status === 'rejected' && j.status !== 'rejected') {
      tryNotify('company', j.companyId, {
        kind: 'oferta', title: 'Tu aviso necesita cambios',
        body: `${j.title}${updated.rejectReason ? ` — ${updated.rejectReason}` : ''}`, link: '/panel#ofertas',
      });
    }
    return send(res, 200, { job: updated });
  }

  if (admJob && method === 'DELETE') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const j = store.job(admJob[1]);
    if (!j) return send(res, 404, { error: 'Oferta no encontrada' });
    const b = await readBody(req);
    const reason = clean(b.reason, 300);
    const applicants = store.applicationsForJob(j.id);
    store.removeJob(j.id);
    /* los flyers de un aviso eliminado se borran del disco (si ningún otro aviso los usa) */
    for (const f of j.flyerFiles) {
      if (!store.one('SELECT 1 AS x FROM jobs WHERE flyer_file=? OR flyers LIKE ?', f, `%"${f}"%`)) removeUpload(f);
    }
    tryNotify('company', j.companyId, {
      kind: 'oferta', title: 'Eliminamos tu aviso',
      body: `${j.title}${reason ? ` — ${reason}` : ''}`, link: '/panel#ofertas',
    });
    const seen = new Set();
    for (const a of applicants) {
      if (!a.candidateId || seen.has(a.candidateId)) continue;
      seen.add(a.candidateId);
      tryNotify('candidate', a.candidateId, { kind: 'etapa', title: `El aviso "${j.title}" ya no está disponible`, body: 'Hay más búsquedas en WorkUco para vos.', link: '/buscar' });
    }
    return send(res, 200, { ok: true });
  }

  const admJobInfo = p.match(/^\/api\/admin\/jobs\/([a-z0-9]+)\/info$/);
  if (admJobInfo && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const j = store.job(admJobInfo[1]);
    if (!j) return send(res, 404, { error: 'Oferta no encontrada' });
    const c = store.company(j.companyId) || {};
    return send(res, 200, {
      job: j,
      company: { id: c.id, name: c.name, email: c.claimed === 0 ? '' : c.email, phone: c.phone || '', verified: !!c.verified,
        claimed: c.claimed !== 0, imported: !!c.imported, createdAt: c.created_at },
      stats: store.jobAdminStats(j.id),
      warnings: legal.discriminationHints(j.title, j.description, j.requirements, j.responsibilities),
    });
  }

  if (p === '/api/admin/inbox' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const ib = store.adminInbox();
    const places = ib.places.map(adminPlace);
    const companies = ib.companies.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone || '', verified: !!c.verified, createdAt: c.created_at }));
    const counts = { jobs: ib.jobs.length, places: places.length, companies: companies.length, featureRequests: ib.featureRequests.length, importResponses: ib.importResponses.length };
    counts.total = counts.jobs + counts.places + counts.companies + counts.featureRequests + counts.importResponses;
    return send(res, 200, { jobs: ib.jobs, places, companies, featureRequests: ib.featureRequests, importResponses: ib.importResponses, counts, seenAt: ib.seenAt });
  }
  if (p === '/api/admin/inbox/seen' && method === 'POST') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    store.setAdminMeta('inbox_seen_at', now());
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/candidates' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const r = store.adminCandidates({
      q: clean(q.get('q'), 80), available: q.get('available') === '1',
      locality: LOCALITIES.includes(q.get('locality')) ? q.get('locality') : '',
    });
    return send(res, 200, {
      counts: r.counts,
      people: r.people.map((c) => ({
        id: c.id, name: c.name, email: c.email, phone: c.phone || '', locality: c.locality || '',
        headline: c.headline || '', about: c.about || '', skills: jparse(c.skills, []), categories: jparse(c.categories, []),
        availability: c.availability || '', openToWork: !!c.open_to_work, isPublic: !!c.is_public,
        publicUrl: c.is_public && c.public_slug ? `/p/${c.public_slug}` : '',
        photo: c.photo_file ? `/api/photo/c/${c.id}` : null, cvUrl: c.cv_file ? `/api/cv/c/${c.id}` : null,
        applications: c.applications, createdAt: c.created_at,
      })),
    });
  }

  if (p === '/api/admin/payments' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const cfg = payConfig();
    return send(res, 200, {
      mp: { connected: mp.connected(), publicUrl: mp.isPublicHttps(PUBLIC_URL), webhookSecret: mp.hasWebhookSecret() },
      settings: { charge: cfg.charge, prices: cfg.prices, ...cvSettings(), cosechaPrice: cosechaConfig().price, sellCosecha: cosechaConfig().sell }, enabled: cfg.enabled, featuredDays: FEATURED_DAYS,
      cvPro: { ai: cvProAi(), canPay: cvProConfig().canPay },
      totals: store.paymentTotals(),
      payments: store.allPayments().map((x) => ({
        reference: x.id, kind: x.kind || 'destacado', companyName: x.company_name || '', jobId: x.job_id, jobTitle: x.job_title, days: x.days,
        amount: x.amount, status: x.status, mpPaymentId: x.mp_payment_id || '', createdAt: x.created_at, paidAt: x.paid_at,
      })),
    });
  }
  if (p === '/api/admin/payments/settings' && method === 'PUT') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const b = await readBody(req);
    /* sólo se cambia lo que viene: precios de destacados, cobrar destacados, precio y venta del CV Pro */
    const okPrice = (v) => Number.isInteger(v) && v >= 100 && v <= 10000000;
    if (b.prices && typeof b.prices === 'object') {
      const next = {};
      for (const d of FEATURED_DAYS) {
        const raw = b.prices[d];
        if (raw === undefined || raw === null || raw === '' || Number(raw) === 0) { next[d] = 0; continue; }
        const v = Number(raw);
        if (!okPrice(v)) return send(res, 400, { error: `El precio de ${d} días tiene que ser un número entero de pesos (mínimo $ 100)` });
        next[d] = v;
      }
      for (const d of FEATURED_DAYS) store.setAdminMeta(`price_${d}`, next[d]);
    }
    if ('cvPrice' in b && !okPrice(Number(b.cvPrice))) return send(res, 400, { error: 'El precio del CV Pro tiene que ser un número entero de pesos (mínimo $ 100)' });
    if ('cvPrice' in b) store.setAdminMeta('price_cv', Number(b.cvPrice));
    if ('charge' in b) store.setAdminMeta('charge_featured', b.charge ? '1' : '0');
    if ('sellCv' in b) store.setAdminMeta('sell_cv', b.sellCv ? '1' : '0');
    if ('cosechaPrice' in b && !(Number(b.cosechaPrice) === 0 || okPrice(Number(b.cosechaPrice)))) return send(res, 400, { error: 'El precio del Pack Cosecha tiene que ser un número entero de pesos (mínimo $ 100)' });
    if ('cosechaPrice' in b) store.setAdminMeta('price_cosecha', Number(b.cosechaPrice));
    if ('sellCosecha' in b) store.setAdminMeta('sell_cosecha', b.sellCosecha ? '1' : '0');
    const cfg = payConfig();
    return send(res, 200, { settings: { charge: cfg.charge, prices: cfg.prices, ...cvSettings(), cosechaPrice: cosechaConfig().price, sellCosecha: cosechaConfig().sell }, enabled: cfg.enabled });
  }

  if (p === '/api/admin/search' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const r = store.adminSearch(q.get('q'));
    return send(res, 200, {
      jobs: r.jobs,
      places: r.places.map(adminPlace),
      companies: r.companies.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone || '', verified: !!c.verified, createdAt: c.created_at })),
    });
  }

  if (p === '/api/admin/applications' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, { applications: store.allApplications() });
  }

  if (p === '/api/admin/companies' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, {
      companies: store.companies().map((c) => ({
        id: c.id, name: c.name, email: c.email, phone: c.phone, verified: !!c.verified,
        plan: c.plan, jobs: c.jobs, published: c.published, applications: c.applications,
        logo: mediaUrl(c.logo_file), createdAt: c.created_at,
        ai: c.ai_provider ? { provider: c.ai_provider, enabled: !!c.ai_enabled, hasKey: !!c.ai_key } : null,
        cosechaUntil: c.cosecha_until && c.cosecha_until > Date.now() ? c.cosecha_until : null, cosechaRequestedAt: c.cosecha_req_at || null,
      })),
    });
  }

  if (p === '/api/admin/services' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, {
      services: servicesLib.SERVICES,
      interested: store.interestedCompanies().map((c) => {
        const it = servicesLib.interestOf(c);
        return { id: c.id, name: c.name, email: c.email, phone: c.phone || '', locality: c.locality || '',
          employees: c.employees || '', website: c.website || '', services: it.services, note: it.note, at: it.at };
      }),
    });
  }

  const admCompany = p.match(/^\/api\/admin\/companies\/([a-z0-9]+)$/);
  if (admCompany && method === 'PATCH') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const b = await readBody(req);
    const patch = {};
    if ('verified' in b) patch.verified = !!b.verified;
    if ('plan' in b) patch.plan = ['free', 'pro', 'premium'].includes(b.plan) ? b.plan : 'free';
    if ('cosechaDays' in b && b.cosechaDays !== null && Number(b.cosechaDays) !== COSECHA_DAYS) return send(res, 400, { error: `El Pack Cosecha dura ${COSECHA_DAYS} días` });
    if (!store.company(admCompany[1])) return send(res, 404, { error: 'Empresa no encontrada' });
    if ('cosechaDays' in b) {
      if (b.cosechaDays === null) store.endCosecha(admCompany[1]);
      else activateCosechaFor(admCompany[1], COSECHA_DAYS);
    }
    const c = Object.keys(patch).length ? store.updateCompany(admCompany[1], patch) : store.company(admCompany[1]);
    if (!c) return send(res, 404, { error: 'Empresa no encontrada' });
    return send(res, 200, { company: publicCompany(c, { privateView: true }) });
  }

  return send(res, 404, { error: 'API no encontrada' });
}

function removeUpload(file) {
  if (!file) return;
  try { fs.unlinkSync(path.join(UP_DIR, path.basename(file))); } catch (_) { /* ya no está */ }
}

function serveFile(res, file, mime, cache = false, downloadName = '') {
  if (!fs.existsSync(file)) return send(res, 404, { error: 'Archivo no encontrado' });
  const ext = path.extname(file).toLowerCase();
  const type = mime === 'image/*'
    ? ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream')
    : (mime || 'application/octet-stream');
  const headers = {
    'Content-Type': type,
    'Cache-Control': cache ? 'public, max-age=86400' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (downloadName) headers['Content-Disposition'] = `inline; filename="${String(downloadName).replace(/"/g, '')}"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
};

/* Encabezados de seguridad en todas las respuestas:
   - nadie puede meter la página dentro de otro sitio (clickjacking): X-Frame-Options + CSP frame-ancestors;
   - al hacer clic hacia otro sitio sólo viaja el dominio, no la dirección completa (Referrer-Policy);
   - por https, el navegador recuerda usar siempre https durante un año (HSTS). Sin includeSubDomains:
     no sabemos si todos los subdominios tienen https. */
function setSecurityHeaders(req, res) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const https = /https/i.test(String(req.headers['x-forwarded-proto'] || '')) || !!(req.socket && req.socket.encrypted) || /^https:/.test(PUBLIC_URL);
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(req, res);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    /* imágenes subidas por empresas y candidatos */
    if (url.pathname.startsWith('/media/') && req.method === 'GET') {
      const name = path.basename(decodeURIComponent(url.pathname.slice(7)));
      /* sólo imágenes públicas: los CV (PDF) se bajan por /api/cv/... con permiso */
      if (!name || name.startsWith('.') || !/\.(jpe?g|png|webp)$/i.test(name)) { res.writeHead(404); return res.end('No encontrado'); }
      return serveFile(res, path.join(UP_DIR, name), 'image/*', true);
    }

    /* páginas */
    if (url.pathname === '/' && req.method === 'GET') {
      return renderPage(res, 'index.html', { req, active: '/', title: 'WorkUco · Empleos en el Valle de Uco' });
    }
    if (url.pathname === '/buscar' && req.method === 'GET') {
      return renderPage(res, 'buscar.html', { req, active: '/buscar', title: 'Buscar empleo · WorkUco' });
    }
    if (/^\/reclamar\/[A-Za-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'reclamar.html', { req, title: 'Tu empresa en WorkUco' });
    }
    if (url.pathname === '/flyers' && req.method === 'GET') {
      return renderPage(res, 'flyers.html', { req, active: '/flyers', title: 'Wik Works · WorkUco' });
    }
    if (url.pathname === '/changas' && req.method === 'GET') {
      return renderPage(res, 'changas.html', { req, active: '/changas', title: 'Changas y trabajos por temporada · WorkUco' });
    }
    if (url.pathname === '/cosecha' && req.method === 'GET') {
      return renderPage(res, 'cosecha.html', { req, active: '/changas', title: 'Cosecha en el Valle de Uco · WorkUco' });
    }
    if (/^\/cv\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'cv.html', { req, title: 'CV · WorkUco' });
    }
    if (/^\/cv-pro(\/cv[a-f0-9]{16})?$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'cv-pro.html', { req, active: '/cv-pro', title: 'Mejorá tu CV con IA · WorkUco' });
    }
    if (/^\/p\/[a-z0-9-]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'perfil-publico.html', { req, title: 'Perfil · WorkUco' });
    }
    if (url.pathname === '/empresas' && req.method === 'GET') {
      return renderPage(res, 'empresas.html', { req, active: '/empresas', title: 'Empresas del Valle de Uco · WorkUco' });
    }
    if (/^\/empresa\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      const c = store.company(url.pathname.split('/').pop());
      if (!c) return notFound(req, res);
      /* las fichas importadas sin reclamar se ven, pero no se indexan */
      return renderPage(res, 'empresa.html', { req, active: '/empresas', title: `${c.name} · WorkUco`, head: seo.companyMeta(publicCompany(c), originOf(req)), noindex: c.claimed === 0 });
    }
    if (url.pathname === '/publicar' && req.method === 'GET') {
      return renderPage(res, 'publicar.html', { req, active: '/publicar', title: 'Publicar empleo · WorkUco' });
    }
    if (/^\/oferta\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      const j = store.job(url.pathname.split('/').pop());
      if (!j) return notFound(req, res);
      /* sin aprobar (lo ve su empresa o el admin) o cerrado: se muestra, pero no va a Google */
      const live = j.status === 'approved' && !(j.closesAt && j.closesAt < todayAR());
      const origin = originOf(req);
      const head = seo.jobMeta(j, origin, { noindex: !live }) + (live && !DEMO ? `\n  ${seo.jobPostingLd(j, origin)}` : '');
      return renderPage(res, 'oferta.html', { req, active: '/buscar', title: `${j.title} en ${j.companyName} · WorkUco`, head });
    }
    if (url.pathname === '/guia' && req.method === 'GET') {
      return renderPage(res, 'guia.html', { req, active: '/guia', title: 'Guía del Valle: oficios, servicios, salidas y comida · WorkUco' });
    }
    if (/^\/guia\/[a-z0-9-]+$/.test(url.pathname) && req.method === 'GET') {
      const pl = store.placeBySlug(url.pathname.split('/').pop());
      const viewer = current(req);
      const o = ownerOf(viewer);
      const privileged = !!(pl && ((viewer && viewer.role === 'admin') || (o && pl.ownerType === o[0] && pl.ownerId === o[1])));
      if (!pl || (pl.status !== 'approved' && !privileged)) return notFound(req, res);
      /* sólo van a Google las aprobadas que tienen dueño (las cargadas por el admin, recién cuando se reclaman) */
      const indexable = pl.status === 'approved' && pl.claimed;
      const origin = originOf(req);
      const head = seo.placeMeta(pl, origin, { noindex: !indexable }) + (indexable && !DEMO ? `\n  ${seo.localBusinessLd(pl, origin)}` : '');
      return renderPage(res, 'ficha.html', { req, active: '/guia', title: `${seo.placeTitle(pl)} · WorkUco`, head });
    }
    if (/^\/reclamar-ficha\/[a-f0-9]{48}$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'reclamar-ficha.html', { req, title: 'Tu ficha en la Guía del Valle · WorkUco', noindex: true });
    }
    if (url.pathname === '/restablecer' && req.method === 'GET') {
      return renderPage(res, 'restablecer.html', { req, title: 'Recuperar contraseña · WorkUco', noindex: true });
    }
    if (url.pathname === '/acceder' && req.method === 'GET') {
      return renderPage(res, 'acceso.html', { req, title: 'Acceder · WorkUco' });
    }
    if (url.pathname === '/panel' && req.method === 'GET') {
      return renderPage(res, 'panel.html', { req, title: 'Panel de empresa · WorkUco' });
    }
    if (url.pathname === '/mi-perfil' && req.method === 'GET') {
      return renderPage(res, 'mi-perfil.html', { req, title: 'Mi perfil · WorkUco' });
    }
    if (url.pathname === '/admin' && req.method === 'GET') {
      return renderPage(res, 'admin.html', { req, title: 'Administración · WorkUco' });
    }
    if (INFO_PAGES[url.pathname] && req.method === 'GET') {
      return renderPage(res, 'info.html', { req, title: `${INFO_PAGES[url.pathname]} · WorkUco` });
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(seo.robotsTxt(originOf(req), { demo: DEMO }));
    }
    if (url.pathname === '/sitemap.xml' && req.method === 'GET') {
      const today = todayAR();
      const pages = ['/', '/buscar', '/changas', '/cosecha', '/flyers', '/guia', '/empresas', '/publicar', ...Object.keys(INFO_PAGES)]
        .map((p) => ({ path: p, priority: p === '/' ? '1.0' : '0.6' }));
      /* una consulta para avisos y otra para empresas (las reclamadas con avisos vigentes); 45.000 URL entran en un solo sitemap */
      const live = "status='approved' AND (closes_at IS NULL OR closes_at='' OR closes_at>=?)";
      const jobs = DEMO ? [] : store.all(`SELECT id, published_at, created_at FROM jobs WHERE ${live} ORDER BY published_at DESC LIMIT 45000`, today);
      const cos = DEMO ? [] : store.all(`SELECT DISTINCT c.id FROM companies c JOIN jobs j ON j.company_id=c.id
        WHERE (c.claimed IS NULL OR c.claimed<>0) AND j.status='approved'
          AND (j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=?)`, today)
        .map((c) => ({ path: `/empresa/${c.id}`, priority: '0.5' }));
      const fichas = DEMO ? [] : store.all("SELECT slug, updated_at FROM places WHERE status='approved' AND owner_id IS NOT NULL ORDER BY updated_at DESC LIMIT 20000")
        .map((x) => ({ path: `/guia/${x.slug}`, lastmod: x.updated_at, priority: '0.7' }));
      const out = seo.sitemapXml(originOf(req), [...pages, ...jobs.map((j) => ({ path: `/oferta/${j.id}`, lastmod: j.published_at || j.created_at, priority: '0.8' })), ...cos, ...fichas]);
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLIC_URL ? 'public, max-age=3600' : 'no-store' });
      return res.end(out);
    }

    /* estáticos */
    const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(WEB, safe);
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('Prohibido'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return notFound(req, res);
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        /* las tipografías no cambian (si cambian, cambia el nombre): un año en caché */
        'Cache-Control': ext === '.woff2' && /[\\/]fonts[\\/]/.test(file) ? 'public, max-age=31536000, immutable'
          : ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.message || 'Error interno' });
  }
});

/* Demo para la versión pública */
if (process.env.WORKUCO_DEMO === '1') {
  try {
    if (store.isEmpty()) {
      const { companies, candidates, jobs, applications, invitations, notifications } = demo.build();
      store.seedDemo({ companies, candidates, jobs, applications, invitations, notifications });
      console.log(`Demo: ${jobs.length} ofertas, ${applications.length} postulaciones y ${(candidates || []).length} perfiles cargados`);
    }
  } catch (e) { console.error('Demo seed:', e.message); }
}

server.listen(PORT, HOST, () => {
  console.log(`WorkUco en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
  if (PUBLIC_URL) console.log(`URL pública: ${PUBLIC_URL}`);
  console.log(`Mails: ${MAILER.mode === 'resend' ? 'Resend' : MAILER.mode === 'fake' ? 'de prueba (outbox.jsonl)' : 'desactivados (falta RESEND_API_KEY)'}`);
  if (!PUBLIC_URL && !DEMO) console.warn('Aviso: falta PUBLIC_URL (p. ej. https://workuco.com.ar). Los links de vistas previas y del mapa del sitio usan el dominio del pedido, y los de los mails, localhost.');
});

module.exports = { server, store };
