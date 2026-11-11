/**
 * Workuco — Portal de empleo del Valle de Uco
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
  Store, uid, now, jparse,
  LOCALITIES, CATEGORIES, TYPES, MODALITIES, BENEFITS, STAGES, STAGE_LABEL, SALARY_PERIODS, MONTH_FACTOR,
} = require('./lib/store');
const { matchScore, norm } = require('./lib/match');
const { TEMPLATES } = require('./lib/templates');
const { normPhone, normName, buildImportPrompt, normalizeDrafts } = require('./lib/importer');
const demo = require('./lib/demo');
const ai = require('./lib/ai');
const { extractCv } = require('./lib/cvtext');

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
    featured: j.featured, createdAt: j.createdAt, publishedAt: j.publishedAt, closesAt: j.closesAt,
  };
}

/* Compatibilidad entre una persona (fila de la base) y una oferta. null si el perfil está vacío. */
function matchFor(c, j, audience = 'candidate') {
  if (!c || !j) return null;
  const f = MONTH_FACTOR[j.salaryPeriod] || 1;
  const m = matchScore({
    skills: jparse(c.skills, []), locality: c.locality, headline: c.headline, experience: c.experience,
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
function tryNotify(type, id, data) {
  try { store.notify(type, id, data); } catch (e) { console.warn('Notificación:', e.message); }
}

const STAGE_NOTICE = {
  revisado: (c, t) => ['Tu postulación está en revisión', `${c} está mirando tu perfil para ${t}.`],
  entrevista: (c, t) => ['¡Te quieren entrevistar!', `${c} quiere conocerte por el puesto de ${t}. Estate atento/a al teléfono.`],
  ofrecido: (c, t) => ['¡Recibiste una oferta!', `${c} te hizo una propuesta por el puesto de ${t}.`],
  contratado: (c, t) => ['¡Felicitaciones, quedaste!', `${c} te eligió para el puesto de ${t}.`],
  descartado: (c, t) => ['Novedades de tu postulación', `${c} siguió con otros perfiles para ${t}. Gracias por postularte: hay más búsquedas para vos.`],
};

function alertLabel(a) {
  return [a.q ? `"${a.q}"` : '', a.gig ? 'Changas' : '', a.category, a.locality, a.type, a.modality].filter(Boolean).join(' · ');
}
function alertMatches(a, j) {
  if (a.locality && a.locality !== j.locality) return false;
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
  ['/flyers', 'Flyers'],
  ['/empresas', 'Empresas'],
  ['/publicar', 'Para empresas'],
];

/* Logo de marca en SVG (se ve bien sobre fondo noche). */
const brandMark = (id) => `<svg class="brand-svg" viewBox="0 0 40 40" width="28" height="28" aria-hidden="true">
  <mask id="${id}">
    <rect width="40" height="40" fill="#fff"/>
    <path d="M4 21.5 12 27l5-3 3 2 3-2 5 3 8-5.5" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M19 13h2v9h-2z" fill="#000"/>
  </mask>
  <rect x="4" y="11" width="32" height="23" rx="5" fill="#12b98d" mask="url(#${id})"/>
  <path d="M15 11V8.5A3.5 3.5 0 0 1 18.5 5h3A3.5 3.5 0 0 1 25 8.5V11" fill="none" stroke="#12b98d" stroke-width="3"/>
</svg>`;

const HEAD_EXTRA = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/valle.css">`;

function navHtml(active) {
  const links = NAV_ITEMS.map(([href, label]) =>
    `<a class="nav-link${active === href ? ' is-active' : ''}" href="${href}">${label}</a>`).join('');
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Workuco, inicio">
      ${brandMark('wk-cut-h')}
      <span class="brand-name">Workuco</span>
    </a>
    <nav class="main-nav" aria-label="Principal">${links}</nav>
    <div class="header-actions" data-auth-slot>
      <a class="btn btn-ghost btn-sm" href="/acceder">Ingresar</a>
      <a class="btn btn-primary btn-sm" href="/publicar">Publicar empleo</a>
    </div>
    <button class="menu-toggle" type="button" aria-label="Abrir menú" aria-expanded="false" data-menu-toggle>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu hidden>
    ${NAV_ITEMS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
    <a href="/acceder" data-auth-mobile>Ingresar</a>
  </div>
</header>${process.env.WORKUCO_DEMO === '1' ? '\n<div class="demo-strip" role="note"><span class="ds-long">Modo demostración: las empresas, personas y ofertas que ves son ficticias.</span><span class="ds-short">Demo: empresas y personas ficticias</span></div>' : ''}`;
}

function footerHtml() {
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/">
        ${brandMark('wk-cut-f')}
        <span class="brand-name">Workuco</span>
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
      <h4>Workuco</h4>
      <a href="/acerca">Acerca de</a>
      <a href="/contacto">Contacto</a>
      <a href="/faq">Preguntas frecuentes</a>
      <a href="/privacidad">Privacidad</a>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>© ${new Date().getFullYear()} Workuco · Valle de Uco, Mendoza</span>
    <span>Hecho para el Valle de Uco</span>
  </div>
</footer>`;
}

function renderPage(res, file, { active = '', title = 'Workuco' } = {}) {
  fs.readFile(path.join(WEB, file), 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const out = html
      .replace('{{TITLE}}', title)
      .replace('{{NAV}}', navHtml(active))
      .replace('{{FOOTER}}', footerHtml())
      .replace('<link rel="stylesheet" href="/styles.css">', HEAD_EXTRA)
      .replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#0b1612">')
      .replace(/\{\{ICON_([A-Z]+)\}\}/g, (_, name) => pageIcon(name));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}

const INFO_PAGES = {
  '/acerca': 'Acerca de Workuco',
  '/contacto': 'Contacto',
  '/faq': 'Preguntas frecuentes',
  '/terminos': 'Términos y condiciones',
  '/privacidad': 'Privacidad',
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
      contactWaUrl: normPhone(CONTACT_WA) ? `https://wa.me/549${normPhone(CONTACT_WA)}` : '',
    });
  }

  /* ---------- sesión ---------- */
  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: current(req) });

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
    if (Object.keys(errs).length) return send(res, 400, { error: 'Revisá los datos', fields: errs });

    if (role === 'candidate') {
      const c = store.insertCandidate({
        id: uid('u'), name, email, phone, password: hashPassword(password),
        locality: LOCALITIES.includes(b.locality) ? b.locality : '',
      });
      setSession(res, 'candidate', req, { candidateId: c.id });
      return send(res, 201, { candidate: publicCandidate(c, { privateView: true }), user: { role: 'candidate' } });
    }
    const c = store.insertCompany({
      id: uid('c'), name, email, phone, website: cleanUrl(b.website),
      description: cleanMultiline(b.description, 1000), password: hashPassword(password),
      verified: 0, plan: 'free', createdAt: now(),
      locality: LOCALITIES.includes(b.locality) ? b.locality : '',
    });
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
    return serveFile(res, path.join(UP_DIR, name), null, true);
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
      locality: LOCALITIES.includes(q.get('locality')) ? q.get('locality') : '',
      category: CATEGORIES.includes(q.get('category')) ? q.get('category') : '',
      type: TYPES.includes(q.get('type')) ? q.get('type') : '',
      modality: MODALITIES.includes(q.get('modality')) ? q.get('modality') : '',
      withSalary: q.get('withSalary') === '1',
      gig: q.get('gig') || '',
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
    store.bumpViews(j.id);
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
        flyer: j.flyer, flyers: j.flyers, sourceKind: j.sourceKind, sourceName: j.sourceName, companyClaimed: (store.company(j.companyId) || {}).claimed !== 0,
        benefits: j.benefits, positions: j.positions,
        contactEmail: j.contactEmail, contactPhone: j.contactPhone,
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
    if ('logo' in b && b.logo) {
      const f = saveImage(b.logo, 'logo');
      if (c.logo_file) removeUpload(c.logo_file);
      patch.logo_file = f;
    }
    if (b.removeLogo) { if (c.logo_file) removeUpload(c.logo_file); patch.logo_file = null; }
    const updated = store.updateCompany(me.company.id, patch);
    return send(res, 200, { company: publicCompany(updated, { privateView: true }) });
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
    return send(res, 201, { job: j });
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
    const updated = store.updateJob(j.id, { ...v.data, flyerFiles, status: 'pending', rejectReason: null, featured: 0, publishedAt: null });
    return send(res, 200, { job: updated, message: 'Los cambios quedaron pendientes de aprobación' });
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
    const jobs = store.searchJobs({ limit: 1000 }).jobs
      .filter((j) => !applied.has(j.id))
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
      locality: LOCALITIES.includes(b.locality) ? b.locality : '',
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
    return send(res, 200, { people, invitesLeft: Math.max(0, INVITE_LIMIT - store.invitationsToday(me.company.id)) });
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
    if (store.invitationsToday(me.company.id) >= INVITE_LIMIT) {
      return send(res, 429, { error: `Llegaste al límite de ${INVITE_LIMIT} invitaciones por día` });
    }
    const id = uid('i');
    store.insertInvitation({ id, companyId: me.company.id, jobId: job.id, candidateId: c.id, message: cleanMultiline(b.message, 400) });
    tryNotify('candidate', c.id, {
      kind: 'invitacion', title: `${job.companyName} te invitó a postularte`,
      body: `Puesto: ${job.title}`, link: `/oferta/${job.id}`,
    });
    return send(res, 201, { ok: true, invitation: { id } });
  }

  /* ---------- CV Workuco y perfil público ---------- */
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
      return send(res, 200, { aiReady: IMPORT_FAKE || !!cfg, provider: IMPORT_FAKE ? 'prueba' : (cfg ? cfg.provider : '') });
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
      try {
        const { system, user } = buildImportPrompt(importMeta);
        const raw = await ai.callProvider(cfg, { system, user: text.trim() ? `${user}\n\n${text}` : user, images: imgs, maxTokens: 6000 });
        return send(res, 200, normalizeDrafts(raw, importMeta, text, imgs.length));
      } catch (e) {
        return send(res, 502, { error: `No pudimos leer los avisos con la IA: ${e.message}` });
      }
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
        return send(res, 409, { code: 'blocked', error: 'Esta empresa pidió no aparecer en Workuco' });
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
        const msg = open && claimUrl ? `Hola, ¿cómo están? Les escribo de Workuco, el portal de empleo del Valle de Uco. Vimos su búsqueda "${open.title}" en ${open.source_name || 'un canal de empleo'} y la publicamos para que llegue a más gente de la zona. Si quieren, pueden reclamarla gratis para manejar sus postulantes (ya tienen ${applications}), o pedir que la borremos con un toque: ${claimUrl}. ¡Gracias!` : '';
        return {
          id: c.id, name: c.name, phone: c.phone || '', locality: c.locality || '',
          claimed: c.claimed !== 0, notifyStatus: c.notify_status || 'sin_avisar', notifiedAt: c.notified_at || null,
          claimUrl, waUrl: msg && c.phone_norm ? `https://wa.me/549${c.phone_norm}?text=${encodeURIComponent(msg)}` : '',
          applications,
          jobs: jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, closesAt: j.closes_at, sourceName: j.source_name || '', sourceText: j.source_text || '', applications: j.applications })),
          createdAt: c.created_at,
        };
      });
      return send(res, 200, { companies, removed: store.blockedCompanies() });
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
      });
    }

    if (action === '/accept' && method === 'POST') {
      const b = await readBody(req);
      const email = clean(b.email, 160).toLowerCase();
      const password = String(b.password || '');
      const fieldsErr = {};
      if (!isEmail(email)) fieldsErr.email = 'Email inválido';
      if (password.length < 8) fieldsErr.password = 'La contraseña debe tener al menos 8 caracteres';
      if (Object.keys(fieldsErr).length) return send(res, 400, { error: 'Revisá los datos', fields: fieldsErr });
      if (store.companyByEmail(email) || store.candidateByEmail(email)) {
        return send(res, 409, { error: 'Ya hay una cuenta con ese email: ingresá con ella o usá otro', fields: { email: 'Email ya registrado' } });
      }
      const claimed = store.claimCompany(c.id, { email, password: hashPassword(password) });
      if (!claimed) return send(res, 404, { error: 'Este link ya se usó o no existe' });
      setSession(res, 'company', req, { companyId: c.id });
      const seen = new Set();
      for (const a of store.applicantsOf(c.id)) {
        if (seen.has(a.candidateId)) continue;
        seen.add(a.candidateId);
        tryNotify('candidate', a.candidateId, { kind: 'etapa', title: `${c.name} ya administra su aviso en Workuco`, body: `Tu postulación a "${a.jobTitle}" ya está en manos de la empresa.`, link: '/mi-perfil?tab=postulaciones' });
      }
      return send(res, 200, { company: publicCompany(claimed, { privateView: true }) });
    }

    if (action === '/delete' && method === 'POST') {
      const applicants = store.applicantsOf(c.id);
      store.addBlock('phone', c.phone_norm || normPhone(c.phone), c.name);
      store.addBlock('name', c.name_norm || normName(c.name), c.name);
      store.deleteCompanyCascade(c.id);
      for (const a of applicants) {
        tryNotify('candidate', a.candidateId, { kind: 'etapa', title: `El aviso "${a.jobTitle}" fue retirado por la empresa`, body: 'Hay más búsquedas en Workuco para vos.', link: '/buscar' });
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

  if (p === '/api/admin/jobs' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const status = ['pending', 'approved', 'rejected', 'closed'].includes(q.get('status')) ? q.get('status') : '';
    return send(res, 200, { jobs: store.allJobs({ status }) });
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
    if ('rejectReason' in b) patch.rejectReason = clean(b.rejectReason, 300);
    if (Object.keys(b).some((k) => ['title', 'description', 'locality', 'category', 'type', 'modality'].includes(k))) {
      const merged = { ...j, ...b, contactEmail: b.contactEmail || j.contactEmail };
      const v = validateJob(merged);
      if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
      Object.assign(patch, v.data);
    }
    const updated = store.updateJob(j.id, patch);
    if (patch.status === 'approved' && j.status !== 'approved') announceJob(updated);
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
    if (!store.job(admJob[1])) return send(res, 404, { error: 'Oferta no encontrada' });
    store.removeJob(admJob[1]);
    return send(res, 200, { ok: true });
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
      })),
    });
  }

  const admCompany = p.match(/^\/api\/admin\/companies\/([a-z0-9]+)$/);
  if (admCompany && method === 'PATCH') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const b = await readBody(req);
    const patch = {};
    if ('verified' in b) patch.verified = !!b.verified;
    if ('plan' in b) patch.plan = ['free', 'pro', 'premium'].includes(b.plan) ? b.plan : 'free';
    const c = store.updateCompany(admCompany[1], patch);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    /* imágenes subidas por empresas y candidatos */
    if (url.pathname.startsWith('/media/') && req.method === 'GET') {
      const name = path.basename(decodeURIComponent(url.pathname.slice(7)));
      if (!name || name.startsWith('.')) { res.writeHead(404); return res.end('No encontrado'); }
      return serveFile(res, path.join(UP_DIR, name), 'image/*', true);
    }

    /* páginas */
    if (url.pathname === '/' && req.method === 'GET') {
      return renderPage(res, 'index.html', { active: '/', title: 'Workuco · Empleos en el Valle de Uco' });
    }
    if (url.pathname === '/buscar' && req.method === 'GET') {
      return renderPage(res, 'buscar.html', { active: '/buscar', title: 'Buscar empleo · Workuco' });
    }
    if (/^\/reclamar\/[A-Za-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'reclamar.html', { title: 'Tu empresa en Workuco' });
    }
    if (url.pathname === '/flyers' && req.method === 'GET') {
      return renderPage(res, 'flyers.html', { active: '/flyers', title: 'Modo flyers · Workuco' });
    }
    if (url.pathname === '/changas' && req.method === 'GET') {
      return renderPage(res, 'changas.html', { active: '/changas', title: 'Changas y trabajos por temporada · Workuco' });
    }
    if (/^\/cv\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'cv.html', { title: 'CV · Workuco' });
    }
    if (/^\/p\/[a-z0-9-]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'perfil-publico.html', { title: 'Perfil · Workuco' });
    }
    if (url.pathname === '/empresas' && req.method === 'GET') {
      return renderPage(res, 'empresas.html', { active: '/empresas', title: 'Empresas del Valle de Uco · Workuco' });
    }
    if (/^\/empresa\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'empresa.html', { active: '/empresas', title: 'Empresa · Workuco' });
    }
    if (url.pathname === '/publicar' && req.method === 'GET') {
      return renderPage(res, 'publicar.html', { active: '/publicar', title: 'Publicar empleo · Workuco' });
    }
    if (/^\/oferta\/[a-z0-9]+$/.test(url.pathname) && req.method === 'GET') {
      return renderPage(res, 'oferta.html', { active: '/buscar', title: 'Oferta laboral · Workuco' });
    }
    if (url.pathname === '/acceder' && req.method === 'GET') {
      return renderPage(res, 'acceso.html', { title: 'Acceder · Workuco' });
    }
    if (url.pathname === '/panel' && req.method === 'GET') {
      return renderPage(res, 'panel.html', { title: 'Panel de empresa · Workuco' });
    }
    if (url.pathname === '/mi-perfil' && req.method === 'GET') {
      return renderPage(res, 'mi-perfil.html', { title: 'Mi perfil · Workuco' });
    }
    if (url.pathname === '/admin' && req.method === 'GET') {
      return renderPage(res, 'admin.html', { title: 'Administración · Workuco' });
    }
    if (INFO_PAGES[url.pathname] && req.method === 'GET') {
      return renderPage(res, 'info.html', { title: `${INFO_PAGES[url.pathname]} · Workuco` });
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('User-agent: *\nAllow: /\n');
    }

    /* estáticos */
    const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(WEB, safe);
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('Prohibido'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
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
  console.log(`Workuco en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
  if (PUBLIC_URL) console.log(`URL pública: ${PUBLIC_URL}`);
});

module.exports = { server, store };
