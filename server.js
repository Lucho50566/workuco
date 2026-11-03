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
const { Store, uid, now, LOCALITIES, CATEGORIES, TYPES, MODALITIES } = require('./lib/store');
const demo = require('./lib/demo');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'public');
const DATA = process.env.WORKUCO_DATA ? path.resolve(process.env.WORKUCO_DATA) : path.join(ROOT, 'data');
const CV_DIR = path.join(DATA, 'cv');
const DB_FILE = path.join(DATA, 'workuco.sqlite');
const PORT = Number(process.env.PORT || 4250);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const ADMIN_EMAIL = (process.env.WORKUCO_ADMIN_EMAIL || 'admin@workuco.com.ar').toLowerCase();
const ADMIN_PASS = process.env.WORKUCO_ADMIN_PASS || 'workuco2026';

fs.mkdirSync(CV_DIR, { recursive: true });
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
const redirect = (res, url) => { res.writeHead(302, { Location: url }); res.end(); };
const clean = (s, n = 500) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const cleanMultiline = (s, n = 5000) => String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
const phoneOk = (s) => String(s || '').replace(/\D/g, '').length >= 6;

function readBody(req, limit = 8 * 1024 * 1024) {
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

const SESSION_TTL = 7 * 24 * 3600e3;
function setSession(res, role, companyId, req) {
  const token = crypto.randomBytes(24).toString('hex');
  store.createSession(token, role, companyId, SESSION_TTL);
  const secure = /https/i.test(req.headers['x-forwarded-proto'] || '') || /^https:/.test(PUBLIC_URL) ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `wk_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL / 1000)};${secure}`);
  return token;
}
function clearSession(req, res) {
  const token = parseCookies(req).wk_sess;
  if (token) store.deleteSession(token);
  res.setHeader('Set-Cookie', 'wk_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
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
    return { role: 'company', company: publicCompany(c) };
  }
  return null;
}
const publicCompany = (c) => c && ({
  id: c.id, name: c.name, email: c.email, phone: c.phone, website: c.website,
  description: c.description, verified: !!c.verified, plan: c.plan, createdAt: c.created_at,
});

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
function validateJob(b) {
  const errors = {};
  const title = clean(b.title, 120);
  const description = cleanMultiline(b.description, 8000);
  const locality = LOCALITIES.includes(b.locality) ? b.locality : '';
  const category = CATEGORIES.includes(b.category) ? b.category : '';
  const type = TYPES.includes(b.type) ? b.type : '';
  const modality = MODALITIES.includes(b.modality) ? b.modality : '';
  if (title.length < 5) errors.title = 'El puesto debe tener al menos 5 caracteres';
  if (description.length < 60) errors.description = 'Describí el puesto con al menos 60 caracteres';
  if (!locality) errors.locality = 'Elegí una localidad';
  if (!category) errors.category = 'Elegí una categoría';
  if (!type) errors.type = 'Elegí el tipo de empleo';
  if (!modality) errors.modality = 'Elegí la modalidad';
  const contactEmail = clean(b.contactEmail, 160).toLowerCase();
  if (!isEmail(contactEmail)) errors.contactEmail = 'Email de contacto inválido';
  const closesAt = clean(b.closesAt, 10);
  if (closesAt && !/^\d{4}-\d{2}-\d{2}$/.test(closesAt)) errors.closesAt = 'Fecha de cierre inválida';
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
    },
  };
}

/* ------------------------------------------------------------------ */
/* Páginas                                                             */
/* ------------------------------------------------------------------ */
const NAV_ITEMS = [
  ['/', 'Inicio'],
  ['/buscar', 'Buscar empleo'],
  ['/publicar', 'Publicar empleo'],
];

function navHtml(active) {
  const links = NAV_ITEMS.map(([href, label]) =>
    `<a class="nav-link${active === href ? ' is-active' : ''}" href="${href}">${label}</a>`).join('');
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Workuco, inicio">
      <img class="brand-logo" src="/logo-icon.png" alt="" width="30" height="30">
      <span class="brand-name">Workuco</span>
    </a>
    <nav class="main-nav" aria-label="Principal">${links}</nav>
    <div class="header-actions" data-auth-slot>
      <a class="btn btn-ghost btn-sm" href="/acceder">Acceder</a>
      <a class="btn btn-primary btn-sm" href="/publicar">Publicar empleo</a>
    </div>
    <button class="menu-toggle" type="button" aria-label="Abrir menú" aria-expanded="false" data-menu-toggle>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu hidden>
    ${NAV_ITEMS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
    <a href="/acceder" data-auth-mobile>Acceder</a>
  </div>
</header>`;
}

function footerHtml() {
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/">
        <svg class="brand-svg" viewBox="0 0 40 40" width="27" height="27" aria-hidden="true">
          <mask id="wk-cut">
            <rect width="40" height="40" fill="#fff"/>
            <path d="M4 21.5 12 27l5-3 3 2 3-2 5 3 8-5.5" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
            <path d="M19 13h2v9h-2z" fill="#000"/>
          </mask>
          <rect x="4" y="11" width="32" height="23" rx="5" fill="#0ba37c" mask="url(#wk-cut)"/>
          <path d="M15 11V8.5A3.5 3.5 0 0 1 18.5 5h3A3.5 3.5 0 0 1 25 8.5V11" fill="none" stroke="#0ba37c" stroke-width="3"/>
        </svg>
        <span class="brand-name">Workuco</span>
      </a>
      <p>El portal de empleo del Valle de Uco. Conectamos talento local con empresas de San Carlos, Tunuyán y Tupungato.</p>
    </div>
    <div class="footer-col">
      <h4>Plataforma</h4>
      <a href="/buscar">Buscar empleo</a>
      <a href="/publicar">Publicar empleo</a>
      <a href="/acceder">Acceder</a>
    </div>
    <div class="footer-col">
      <h4>Workuco</h4>
      <a href="/acerca">Acerca de</a>
      <a href="/contacto">Contacto</a>
      <a href="/faq">Preguntas frecuentes</a>
    </div>
    <div class="footer-col">
      <h4>Legal</h4>
      <a href="/terminos">Términos y condiciones</a>
      <a href="/privacidad">Privacidad</a>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>© ${new Date().getFullYear()} Workuco · Valle de Uco, Mendoza</span>
    <span>Hecho para el Valle de Uco</span>
  </div>
</footer>`;
}

function renderPage(res, file, { active = '', title = 'Workuco', content = '' } = {}) {
  fs.readFile(path.join(WEB, file), 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const out = html
      .replace('{{TITLE}}', title)
      .replace('{{NAV}}', navHtml(active))
      .replace('{{FOOTER}}', footerHtml())
      .replace('{{CONTENT}}', content);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}

const INFO_PAGES = {
  '/acerca': ['Acerca de Workuco', 'info-acerca'],
  '/contacto': ['Contacto', 'info-contacto'],
  '/faq': ['Preguntas frecuentes', 'info-faq'],
  '/terminos': ['Términos y condiciones', 'info-terminos'],
  '/privacidad': ['Privacidad', 'info-privacidad'],
};

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
    return send(res, 200, { localities: LOCALITIES, categories: CATEGORIES, types: TYPES, modalities: MODALITIES });
  }

  /* ---------- sesión ---------- */
  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: current(req) });

  if (p === '/api/auth/register' && method === 'POST') {
    if (throttled(req)) return send(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' });
    const b = await readBody(req);
    const name = clean(b.name, 120);
    const email = clean(b.email, 160).toLowerCase();
    const password = String(b.password || '');
    const phone = clean(b.phone, 60);
    const errs = {};
    if (name.length < 2) errs.name = 'Ingresá el nombre de la empresa';
    if (!isEmail(email)) errs.email = 'Email inválido';
    if (password.length < 8) errs.password = 'La contraseña debe tener al menos 8 caracteres';
    if (!phoneOk(phone)) errs.phone = 'Ingresá un teléfono válido';
    if (store.companyByEmail(email)) errs.email = 'Ya existe una cuenta con ese email';
    if (Object.keys(errs).length) return send(res, 400, { error: 'Revisá los datos', fields: errs });
    const c = store.insertCompany({
      id: uid('c'), name, email, phone, website: cleanUrl(b.website), description: cleanMultiline(b.description, 1000),
      password: hashPassword(password), verified: 0, plan: 'free', createdAt: now(),
    });
    setSession(res, 'company', c.id, req);
    return send(res, 201, { company: publicCompany(c) });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const wait = throttled(req);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    const c = store.companyByEmail(b.email);
    if (!c || !verifyPassword(b.password, c.password)) {
      loginFailed(req);
      return send(res, 401, { error: 'Email o contraseña incorrectos' });
    }
    fails.delete(throttleKey(req));
    setSession(res, 'company', c.id, req);
    return send(res, 200, { company: publicCompany(c) });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  /* ---------- ofertas públicas ---------- */
  if (p === '/api/jobs' && method === 'GET') {
    const r = store.searchJobs({
      q: clean(q.get('q'), 80),
      locality: LOCALITIES.includes(q.get('locality')) ? q.get('locality') : '',
      category: CATEGORIES.includes(q.get('category')) ? q.get('category') : '',
      type: TYPES.includes(q.get('type')) ? q.get('type') : '',
      modality: MODALITIES.includes(q.get('modality')) ? q.get('modality') : '',
      sort: q.get('sort') === 'old' ? 'old' : 'recent',
      page: Number(q.get('page') || 1),
      limit: Math.min(30, Math.max(3, Number(q.get('limit') || 9))),
    });
    const jobs = r.jobs.map((j) => ({
      id: j.id, title: j.title, companyName: j.companyName, companyVerified: j.companyVerified,
      locality: j.locality, category: j.category, type: j.type, modality: j.modality,
      salary: j.salary, featured: j.featured, createdAt: j.createdAt, publishedAt: j.publishedAt, closesAt: j.closesAt,
    }));
    return send(res, 200, { ...r, jobs });
  }

  const jobMatch = p.match(/^\/api\/jobs\/([a-z0-9]+)$/);
  if (jobMatch && method === 'GET') {
    const j = store.job(jobMatch[1]);
    if (!j || j.status !== 'approved') return send(res, 404, { error: 'Oferta no encontrada' });
    store.bumpViews(j.id);
    const expired = j.closesAt && j.closesAt < todayAR();
    return send(res, 200, {
      job: {
        id: j.id, title: j.title, companyName: j.companyName, companyVerified: j.companyVerified,
        companyWebsite: j.companyWebsite, companyDescription: j.companyDescription,
        locality: j.locality, category: j.category, type: j.type, modality: j.modality,
        description: j.description, responsibilities: j.responsibilities, requirements: j.requirements,
        experience: j.experience, schedule: j.schedule, salary: j.salary,
        contactEmail: j.contactEmail, contactPhone: j.contactPhone,
        closesAt: j.closesAt, createdAt: j.createdAt, publishedAt: j.publishedAt, views: j.views + 1,
      },
      canApply: !expired,
    });
  }

  const applyMatch = p.match(/^\/api\/jobs\/([a-z0-9]+)\/apply$/);
  if (applyMatch && method === 'POST') {
    const j = store.job(applyMatch[1]);
    if (!j || j.status !== 'approved') return send(res, 404, { error: 'Oferta no encontrada' });
    if (j.closesAt && j.closesAt < todayAR()) return send(res, 410, { error: 'La búsqueda está cerrada' });
    const b = await readBody(req);
    const name = clean(b.name, 120);
    const email = clean(b.email, 160).toLowerCase();
    const phone = clean(b.phone, 60);
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
      cvFile = `${uid('cv')}.pdf`;
      cvName = clean(b.cv.name, 120).replace(/[^\w.\-() ]+/g, '') || 'cv.pdf';
      fs.writeFileSync(path.join(CV_DIR, cvFile), buf);
    }
    const dup = store.all('SELECT id FROM applications WHERE job_id=? AND lower(email)=lower(?)', j.id, email);
    if (dup.length) return send(res, 409, { error: 'Ya te postulaste a esta oferta con ese email' });

    const app = store.insertApplication({
      id: uid('a'), jobId: j.id, name, email, phone,
      message: cleanMultiline(b.message, 2000), cvFile, cvName, createdAt: now(),
    });
    return send(res, 201, { ok: true, application: { id: app.id } });
  }

  /* ---------- empresa ---------- */
  const me = current(req);

  if (p === '/api/company/profile' && method === 'PATCH') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const patch = {};
    if ('name' in b) {
      patch.name = clean(b.name, 120);
      if (patch.name.length < 2) return send(res, 400, { error: 'Nombre inválido', fields: { name: 'Nombre inválido' } });
    }
    if ('phone' in b) patch.phone = clean(b.phone, 60);
    if ('website' in b) patch.website = cleanUrl(b.website);
    if ('description' in b) patch.description = cleanMultiline(b.description, 1200);
    const c = store.updateCompany(me.company.id, patch);
    return send(res, 200, { company: publicCompany(c) });
  }

  if (p === '/api/company/jobs' && method === 'GET') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    return send(res, 200, { jobs: store.companyJobs(me.company.id), stats: { applications: store.countApplicationsForCompany(me.company.id) } });
  }

  if (p === '/api/company/jobs' && method === 'POST') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const b = await readBody(req);
    const v = validateJob(b);
    if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
    const j = store.insertJob({
      id: uid('j'), companyId: me.company.id, ...v.data, status: 'pending', featured: 0, createdAt: now(),
    });
    return send(res, 201, { job: j });
  }

  const compJob = p.match(/^\/api\/company\/jobs\/([a-z0-9]+)$/);
  if (compJob && (method === 'PUT' || method === 'DELETE')) {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const j = store.job(compJob[1]);
    if (!j || j.companyId !== me.company.id) return send(res, 404, { error: 'Oferta no encontrada' });
    if (method === 'DELETE') { store.removeJob(j.id); return send(res, 200, { ok: true }); }
    const b = await readBody(req);
    const v = validateJob(b);
    if (!v.ok) return send(res, 400, { error: 'Revisá los datos', fields: v.errors });
    const updated = store.updateJob(j.id, { ...v.data, status: 'pending', rejectReason: null, featured: 0, publishedAt: null });
    return send(res, 200, { job: updated, message: 'Los cambios quedaron pendientes de aprobación' });
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
    const jobs = store.companyJobs(me.company.id);
    const all = [];
    for (const j of jobs) all.push(...store.applicationsForJob(j.id));
    all.sort((a, b) => b.createdAt - a.createdAt);
    return send(res, 200, { applications: all });
  }

  const appStatus = p.match(/^\/api\/company\/applications\/([a-z0-9]+)$/);
  if (appStatus && method === 'PATCH') {
    if (!me || me.role !== 'company') return send(res, 401, { error: 'Iniciá sesión como empresa' });
    const a = store.application(appStatus[1]);
    if (!a || a.companyId !== me.company.id) return send(res, 404, { error: 'Postulación no encontrada' });
    const b = await readBody(req);
    if (!['nueva', 'contactada', 'descartada'].includes(b.status)) return send(res, 400, { error: 'Estado inválido' });
    store.setApplicationStatus(a.id, b.status);
    return send(res, 200, { ok: true });
  }

  const cvMatch = p.match(/^\/api\/company\/cv\/([a-z0-9]+)$/);
  if (cvMatch && method === 'GET') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión' });
    const a = store.application(cvMatch[1]);
    if (!a || !a.cvFile) return send(res, 404, { error: 'CV no encontrado' });
    if (me.role === 'company' && a.companyId !== me.company.id) return send(res, 403, { error: 'Sin permiso' });
    const file = path.join(CV_DIR, path.basename(a.cvFile));
    if (!fs.existsSync(file)) return send(res, 404, { error: 'Archivo no encontrado' });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(a.cvName || 'cv.pdf').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(file).pipe(res);
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
    setSession(res, 'admin', null, req);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/stats' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    return send(res, 200, { stats: store.stats() });
  }

  if (p === '/api/admin/jobs' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 401, { error: 'No autorizado' });
    const status = ['pending', 'approved', 'rejected'].includes(q.get('status')) ? q.get('status') : '';
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
        plan: c.plan, jobs: c.jobs, published: c.published, createdAt: c.created_at,
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
    return send(res, 200, { company: publicCompany(c) });
  }

  return send(res, 404, { error: 'API no encontrada' });
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

    /* páginas */
    if (url.pathname === '/' && req.method === 'GET') {
      return renderPage(res, 'index.html', { active: '/', title: 'Workuco · Empleos en el Valle de Uco' });
    }
    if (url.pathname === '/buscar' && req.method === 'GET') {
      return renderPage(res, 'buscar.html', { active: '/buscar', title: 'Buscar empleo · Workuco' });
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
    if (url.pathname === '/admin' && req.method === 'GET') {
      return renderPage(res, 'admin.html', { title: 'Administración · Workuco' });
    }
    if (INFO_PAGES[url.pathname] && req.method === 'GET') {
      const [title] = INFO_PAGES[url.pathname];
      return renderPage(res, 'info.html', { title: `${title} · Workuco`, content: `<div data-info="${url.pathname.slice(1)}"></div>` });
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
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || 'Error interno' });
  }
});

/* Demo para la versión pública */
if (process.env.WORKUCO_DEMO === '1') {
  try {
    if (store.isEmpty()) {
      const { companies, jobs, applications } = demo.build();
      store.seedDemo({ companies, jobs, applications });
      console.log(`Demo: ${jobs.length} ofertas y ${applications.length} postulaciones cargadas`);
    }
  } catch (e) { console.error('Demo seed:', e.message); }
}

server.listen(PORT, HOST, () => {
  console.log(`Workuco en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
  if (PUBLIC_URL) console.log(`URL pública: ${PUBLIC_URL}`);
});

module.exports = { server, store };

