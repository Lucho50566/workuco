/**
 * Workuco — capa de datos (SQLite con node:sqlite, sin dependencias).
 *
 * Tablas: companies, candidates, jobs, applications, sessions, saved_jobs.
 * Las imágenes (logo, galería, foto de perfil, CV) se guardan como archivos en
 * DATA/uploads y acá sólo se referencia el nombre.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { normName } = require('./importer');

const now = () => Date.now();
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const LOCALITIES = ['San Carlos', 'Tunuyán', 'Tupungato'];
const CATEGORIES = ['Administración', 'Agricultura', 'Gastronomía', 'Comercio', 'Turismo', 'Construcción', 'Tecnología', 'Mantenimiento', 'Otros'];
const TYPES = ['Tiempo completo', 'Medio tiempo', 'Temporal', 'Pasantía', 'Freelance'];
const MODALITIES = ['Presencial', 'Híbrido', 'Remoto'];

/* Etapas del proceso de selección (kanban) */
const STAGES = ['nuevo', 'revisado', 'entrevista', 'ofrecido', 'contratado', 'descartado'];
const STAGE_LABEL = {
  nuevo: 'Nuevo', revisado: 'En revisión', entrevista: 'Entrevista',
  ofrecido: 'Oferta enviada', contratado: 'Contratado', descartado: 'Descartado',
};
const LEGACY_STAGE = { nueva: 'nuevo', contactada: 'entrevista', descartada: 'descartado' };

const BENEFITS = [
  'Comida incluida', 'Transporte', 'Horario flexible', 'Trabajo remoto', 'Capacitación',
  'Obra social', 'Bonos por objetivos', 'Uniforme', 'Estacionamiento', 'Crecimiento interno',
];

const jparse = (v, fallback) => {
  if (!v) return fallback;
  if (Array.isArray(v)) return v;
  try { const out = JSON.parse(v); return Array.isArray(out) ? out : fallback; } catch (_) { return fallback; }
};
const SALARY_PERIODS = ['mes', 'día', 'hora'];
/* factor para comparar sueldos por día u hora contra un sueldo mensual */
const MONTH_FACTOR = { mes: 1, 'día': 22, hora: 160 };
const money = (n) => `$ ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
/* Texto listo para mostrar: sueldo estructurado si existe, si no el texto libre de avisos viejos. */
const salaryLabel = (min, max, period, text) => (min > 0
  ? `${max > min ? `${money(min)} a ${money(max)}` : money(min)} por ${period || 'mes'}`
  : (text || ''));
const media = (f) => (f ? (/^https?:|^\//.test(f) ? f : `/media/${f}`) : null);

class Store {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  run(sql, ...a) { return this.db.prepare(sql).run(...a); }
  all(sql, ...a) { return this.db.prepare(sql).all(...a); }
  one(sql, ...a) { return this.db.prepare(sql).get(...a) || null; }
  tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  ensureColumn(table, column, ddl) {
    const cols = this.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    if (!cols.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        website TEXT,
        description TEXT,
        password TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        plan TEXT NOT NULL DEFAULT 'free',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        locality TEXT,
        headline TEXT,
        about TEXT,
        skills TEXT,
        experience TEXT,
        education TEXT,
        availability TEXT,
        linkedin TEXT,
        photo_file TEXT,
        cv_file TEXT,
        cv_name TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        locality TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        modality TEXT NOT NULL,
        description TEXT NOT NULL,
        responsibilities TEXT,
        requirements TEXT,
        experience TEXT,
        schedule TEXT,
        salary TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        closes_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        featured INTEGER NOT NULL DEFAULT 0,
        reject_reason TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        published_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        message TEXT,
        cv_file TEXT,
        cv_name TEXT,
        status TEXT NOT NULL DEFAULT 'nueva',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        company_id TEXT,
        created_at INTEGER NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_jobs (
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (candidate_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, featured, published_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_locality ON jobs(locality);
      CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
      CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires);
    `);

    /* columnas nuevas (migración suave sobre bases ya creadas) */
    this.ensureColumn('companies', 'logo_file', 'TEXT');
    this.ensureColumn('companies', 'gallery', 'TEXT');
    this.ensureColumn('companies', 'locality', 'TEXT');
    this.ensureColumn('companies', 'ai_provider', 'TEXT');
    this.ensureColumn('companies', 'ai_key', 'TEXT');
    this.ensureColumn('companies', 'ai_model', 'TEXT');
    this.ensureColumn('companies', 'ai_base_url', 'TEXT');
    this.ensureColumn('companies', 'ai_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('companies', 'ai_auto', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('jobs', 'benefits', 'TEXT');
    this.ensureColumn('jobs', 'positions', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('applications', 'candidate_id', 'TEXT');
    this.ensureColumn('applications', 'stage', "TEXT NOT NULL DEFAULT 'nuevo'");
    this.ensureColumn('applications', 'rating', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('applications', 'notes', 'TEXT');
    this.ensureColumn('applications', 'tags', 'TEXT');
    this.ensureColumn('applications', 'ai_score', 'INTEGER');
    this.ensureColumn('applications', 'ai_summary', 'TEXT');
    this.ensureColumn('applications', 'ai_strengths', 'TEXT');
    this.ensureColumn('applications', 'ai_gaps', 'TEXT');
    this.ensureColumn('applications', 'ai_skills', 'TEXT');
    this.ensureColumn('applications', 'ai_seniority', 'TEXT');
    this.ensureColumn('applications', 'ai_recommendation', 'TEXT');
    this.ensureColumn('applications', 'ai_at', 'INTEGER');
    this.ensureColumn('sessions', 'candidate_id', 'TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_apps_stage ON applications(stage)');

    /* v3: sueldo estructurado, habilidades, changas, talento, avisos */
    this.ensureColumn('jobs', 'salary_min', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('jobs', 'salary_max', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('jobs', 'salary_period', "TEXT NOT NULL DEFAULT 'mes'");
    this.ensureColumn('jobs', 'skills', 'TEXT');
    this.ensureColumn('jobs', 'gig', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('jobs', 'start_date', 'TEXT');
    this.ensureColumn('jobs', 'duration', 'TEXT');
    this.ensureColumn('candidates', 'open_to_work', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('candidates', 'categories', 'TEXT');
    this.ensureColumn('candidates', 'salary_min', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('candidates', 'is_public', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('candidates', 'public_slug', 'TEXT');
    this.ensureColumn('applications', 'responded_at', 'INTEGER');
    this.ensureColumn('applications', 'manual', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('jobs', 'announced_at', 'INTEGER');

    /* v4: avisos importados y fichas sin reclamar */
    this.ensureColumn('companies', 'claimed', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('companies', 'imported', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('companies', 'claim_token', 'TEXT');
    this.ensureColumn('companies', 'notify_status', 'TEXT');
    this.ensureColumn('companies', 'notified_at', 'INTEGER');
    this.ensureColumn('companies', 'phone_norm', 'TEXT');
    this.ensureColumn('companies', 'name_norm', 'TEXT');
    this.ensureColumn('jobs', 'source_kind', "TEXT NOT NULL DEFAULT 'propio'");
    this.ensureColumn('jobs', 'source_name', 'TEXT');
    this.ensureColumn('jobs', 'source_text', 'TEXT');
    this.ensureColumn('jobs', 'imported_at', 'INTEGER');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS import_blocklist (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (kind, value)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_co_claim ON companies(claim_token);
      CREATE INDEX IF NOT EXISTS idx_co_phone_norm ON companies(phone_norm);
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        q TEXT, locality TEXT, category TEXT, type TEXT, modality TEXT,
        gig INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'enviada',
        created_at INTEGER NOT NULL,
        UNIQUE (job_id, candidate_id)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_rcpt ON notifications(recipient_type, recipient_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_alerts_cand ON alerts(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_inv_cand ON invitations(candidate_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cand_slug ON candidates(public_slug);
    `);
    for (const c of this.all("SELECT id, name FROM candidates WHERE public_slug IS NULL OR public_slug=''")) {
      this.run('UPDATE candidates SET public_slug=? WHERE id=?', this.newSlug(c.name), c.id);
    }
    /* postulaciones ya movidas antes de v3: cuentan como respondidas */
    this.run("UPDATE applications SET responded_at=created_at WHERE responded_at IS NULL AND stage<>'nuevo'");

    /* normalizar etapas de bases anteriores */
    this.run("UPDATE applications SET stage='nuevo' WHERE stage IS NULL OR stage=''");
    this.run("UPDATE applications SET stage='entrevista' WHERE status='contactada' AND stage='nuevo'");
    this.run("UPDATE applications SET stage='descartado' WHERE status='descartada' AND stage IN ('nuevo','contactada')");
  }

  /* ---------------- empresas ---------------- */
  company(id) { return this.one('SELECT * FROM companies WHERE id=?', id); }
  companyByEmail(email) { return this.one('SELECT * FROM companies WHERE lower(email)=lower(?)', String(email || '').trim()); }
  insertCompany(c) {
    this.run(`INSERT INTO companies(id,name,email,phone,website,description,password,verified,plan,created_at,logo_file,gallery,locality)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      c.id, c.name, c.email, c.phone || '', c.website || '', c.description || '', c.password,
      c.verified ? 1 : 0, c.plan || 'free', c.createdAt || now(), c.logoFile || null,
      JSON.stringify(c.gallery || []), c.locality || '');
    return this.company(c.id);
  }
  updateCompany(id, patch) {
    const c = this.company(id);
    if (!c) return null;
    const n = Object.assign({}, c, patch);
    this.run(`UPDATE companies SET name=?, phone=?, website=?, description=?, verified=?, plan=?, logo_file=?, gallery=?, locality=? WHERE id=?`,
      n.name, n.phone || '', n.website || '', n.description || '', n.verified ? 1 : 0, n.plan || 'free',
      n.logo_file || null, JSON.stringify(n.gallery && typeof n.gallery === 'string' ? jparse(n.gallery, []) : (n.gallery || [])),
      n.locality || '', id);
    return this.company(id);
  }
  updateCompanyAi(id, patch) {
    const c = this.company(id);
    if (!c) return null;
    const n = Object.assign({}, c, patch);
    this.run('UPDATE companies SET ai_provider=?, ai_key=?, ai_model=?, ai_base_url=?, ai_enabled=?, ai_auto=? WHERE id=?',
      n.ai_provider || null, n.ai_key || null, n.ai_model || null, n.ai_base_url || null,
      n.ai_enabled ? 1 : 0, n.ai_auto ? 1 : 0, id);
    return this.company(id);
  }
  companies() {
    return this.all(`SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.company_id=c.id) AS jobs,
      (SELECT COUNT(*) FROM jobs j WHERE j.company_id=c.id AND j.status='approved') AS published,
      (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=c.id) AS applications
      FROM companies c ORDER BY c.created_at DESC`);
  }

  /* ---------------- candidatos ---------------- */
  candidate(id) { return this.one('SELECT * FROM candidates WHERE id=?', id); }
  candidateByEmail(email) { return this.one('SELECT * FROM candidates WHERE lower(email)=lower(?)', String(email || '').trim()); }
  newSlug(name) {
    for (;;) {
      const slug = `${slugify(name) || 'perfil'}-${crypto.randomBytes(2).toString('hex')}`;
      if (!this.one('SELECT 1 AS x FROM candidates WHERE public_slug=?', slug)) return slug;
    }
  }
  candidateBySlug(slug) { return this.one('SELECT * FROM candidates WHERE public_slug=?', String(slug || '')); }
  insertCandidate(c) {
    this.run(`INSERT INTO candidates(id,name,email,phone,password,locality,headline,about,skills,experience,education,
      availability,linkedin,photo_file,cv_file,cv_name,created_at,open_to_work,categories,salary_min,is_public,public_slug)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      c.id, c.name, c.email, c.phone, c.password, c.locality || '', c.headline || '', c.about || '',
      JSON.stringify(c.skills || []), c.experience || '', c.education || '', c.availability || '',
      c.linkedin || '', c.photoFile || null, c.cvFile || null, c.cvName || '', c.createdAt || now(),
      c.openToWork ? 1 : 0, JSON.stringify(c.categories || []), Number(c.salaryMin) || 0, c.isPublic ? 1 : 0,
      this.newSlug(c.name));
    return this.candidate(c.id);
  }
  updateCandidate(id, patch) {
    const c = this.candidate(id);
    if (!c) return null;
    const n = Object.assign({}, c, patch);
    const skills = typeof n.skills === 'string' ? jparse(n.skills, []) : (n.skills || []);
    const categories = typeof n.categories === 'string' ? jparse(n.categories, []) : (n.categories || []);
    this.run(`UPDATE candidates SET name=?, phone=?, locality=?, headline=?, about=?, skills=?, experience=?,
      education=?, availability=?, linkedin=?, photo_file=?, cv_file=?, cv_name=?,
      open_to_work=?, categories=?, salary_min=?, is_public=? WHERE id=?`,
      n.name, n.phone || '', n.locality || '', n.headline || '', n.about || '', JSON.stringify(skills),
      n.experience || '', n.education || '', n.availability || '', n.linkedin || '',
      n.photo_file || null, n.cv_file || null, n.cv_name || '',
      n.open_to_work ? 1 : 0, JSON.stringify(categories), Number(n.salary_min) || 0, n.is_public ? 1 : 0, id);
    return this.candidate(id);
  }
  /* Base de talento: sólo quienes marcaron "estoy disponible". */
  talent({ q = '', locality = '', category = '' } = {}) {
    const where = ['open_to_work=1'];
    const args = [];
    if (locality) { where.push('locality=?'); args.push(locality); }
    if (category) { where.push('categories LIKE ?'); args.push(`%"${category}"%`); }
    if (q) { where.push('(skills LIKE ? OR headline LIKE ? OR about LIKE ? OR experience LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
    return this.all(`SELECT * FROM candidates WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`, ...args);
  }
  countCandidates() { return this.one('SELECT COUNT(*) AS n FROM candidates').n; }

  /* ---------------- ofertas ---------------- */
  insertJob(j) {
    this.run(`INSERT INTO jobs(id,company_id,title,locality,category,type,modality,description,responsibilities,
      requirements,experience,schedule,salary,contact_email,contact_phone,closes_at,status,featured,created_at,
      published_at,benefits,positions,salary_min,salary_max,salary_period,skills,gig,start_date,duration)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      j.id, j.companyId, j.title, j.locality, j.category, j.type, j.modality, j.description,
      j.responsibilities || '', j.requirements || '', j.experience || '', j.schedule || '', j.salary || '',
      j.contactEmail || '', j.contactPhone || '', j.closesAt || '', j.status || 'pending', j.featured ? 1 : 0,
      j.createdAt || now(), j.publishedAt || null, JSON.stringify(j.benefits || []), Number(j.positions) || 1,
      Number(j.salaryMin) || 0, Number(j.salaryMax) || 0, SALARY_PERIODS.includes(j.salaryPeriod) ? j.salaryPeriod : 'mes',
      JSON.stringify(j.skills || []), j.gig ? 1 : 0, j.startDate || '', j.duration || '');
    return this.job(j.id);
  }
  updateJob(id, patch) {
    const j = this.job(id);
    if (!j) return null;
    const n = Object.assign({}, j, patch);
    const benefits = typeof n.benefits === 'string' ? jparse(n.benefits, []) : (n.benefits || []);
    this.run(`UPDATE jobs SET title=?, locality=?, category=?, type=?, modality=?, description=?, responsibilities=?,
      requirements=?, experience=?, schedule=?, salary=?, contact_email=?, contact_phone=?, closes_at=?,
      status=?, featured=?, reject_reason=?, published_at=?, benefits=?, positions=?,
      salary_min=?, salary_max=?, salary_period=?, skills=?, gig=?, start_date=?, duration=? WHERE id=?`,
      n.title, n.locality, n.category, n.type, n.modality, n.description, n.responsibilities || '',
      n.requirements || '', n.experience || '', n.schedule || '', n.salary || '', n.contactEmail || '',
      n.contactPhone || '', n.closesAt || '', n.status, n.featured ? 1 : 0, n.rejectReason || null,
      n.publishedAt || null, JSON.stringify(benefits), Number(n.positions) || 1,
      Number(n.salaryMin) || 0, Number(n.salaryMax) || 0, SALARY_PERIODS.includes(n.salaryPeriod) ? n.salaryPeriod : 'mes',
      JSON.stringify(n.skills || []), n.gig ? 1 : 0, n.startDate || '', n.duration || '', id);
    return this.job(id);
  }
  removeJob(id) {
    this.run('DELETE FROM applications WHERE job_id=?', id);
    this.run('DELETE FROM saved_jobs WHERE job_id=?', id);
    this.run('DELETE FROM invitations WHERE job_id=?', id);
    this.run('DELETE FROM jobs WHERE id=?', id);
  }
  bumpViews(id) { this.run('UPDATE jobs SET views=views+1 WHERE id=?', id); }

  job(id) {
    const r = this.one(`SELECT j.*, c.name AS company_name, c.website AS company_website,
      c.description AS company_description, c.verified AS company_verified, c.logo_file AS company_logo,
      c.gallery AS company_gallery
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=?`, id);
    return r ? this.rowToJob(r) : null;
  }
  rowToJob(r) {
    return {
      id: r.id, companyId: r.company_id, companyName: r.company_name, companyWebsite: r.company_website,
      companyDescription: r.company_description, companyVerified: !!r.company_verified,
      companyLogo: media(r.company_logo), companyGallery: jparse(r.company_gallery, []).map(media).filter(Boolean),
      title: r.title, locality: r.locality, category: r.category, type: r.type, modality: r.modality,
      description: r.description, responsibilities: r.responsibilities, requirements: r.requirements,
      experience: r.experience, schedule: r.schedule, salary: r.salary,
      contactEmail: r.contact_email, contactPhone: r.contact_phone, closesAt: r.closes_at,
      status: r.status, featured: !!r.featured, rejectReason: r.reject_reason, views: r.views,
      benefits: jparse(r.benefits, []), positions: r.positions || 1,
      salaryMin: r.salary_min || 0, salaryMax: r.salary_max || 0, salaryPeriod: r.salary_period || 'mes',
      salaryLabel: salaryLabel(r.salary_min || 0, r.salary_max || 0, r.salary_period, r.salary),
      skills: jparse(r.skills, []), gig: !!r.gig, startDate: r.start_date || '', duration: r.duration || '',
      sourceKind: r.source_kind || 'propio', sourceName: r.source_name || '',
      createdAt: r.created_at, publishedAt: r.published_at,
    };
  }

  /**
   * Búsqueda pública. Sólo ofertas aprobadas y no vencidas.
   */
  searchJobs({ q = '', locality = '', category = '', type = '', modality = '', sort = 'recent', page = 1, limit = 9,
    withSalary = false, gig = '' } = {}) {
    const where = [`j.status='approved'`, `(j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours'))`];
    const args = [];
    if (q) {
      where.push(`(j.title LIKE ? OR j.description LIKE ? OR j.requirements LIKE ? OR c.name LIKE ?)`);
      const like = `%${q}%`;
      args.push(like, like, like, like);
    }
    if (locality) { where.push('j.locality=?'); args.push(locality); }
    if (category) { where.push('j.category=?'); args.push(category); }
    if (type) { where.push('j.type=?'); args.push(type); }
    if (modality) { where.push('j.modality=?'); args.push(modality); }
    if (withSalary) where.push('j.salary_min>0');
    if (gig === '1' || gig === '0') where.push(`j.gig=${gig}`);
    const order = sort === 'old' ? 'j.published_at ASC'
      : sort === 'salary' ? "j.salary_min * (CASE j.salary_period WHEN 'día' THEN 22 WHEN 'hora' THEN 160 ELSE 1 END) DESC, j.published_at DESC"
        : 'j.featured DESC, j.published_at DESC';
    const total = this.one(`SELECT COUNT(*) AS n FROM jobs j JOIN companies c ON c.id=j.company_id WHERE ${where.join(' AND ')}`, ...args).n;
    const pages = Math.max(1, Math.ceil(total / limit));
    const p = Math.min(Math.max(1, Number(page) || 1), pages);
    const rows = this.all(`SELECT j.*, c.name AS company_name, c.website AS company_website, c.description AS company_description,
      c.verified AS company_verified, c.logo_file AS company_logo, c.gallery AS company_gallery
      FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, (p - 1) * limit);
    return { jobs: rows.map((r) => this.rowToJob(r)), total, page: p, pages, limit };
  }

  companyJobs(companyId) {
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified,
      c.logo_file AS company_logo, c.gallery AS company_gallery,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id AND a.stage='nuevo') AS new_applications
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.company_id=? ORDER BY j.created_at DESC`, companyId)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications, newApplications: r.new_applications }));
  }

  allJobs({ status = '' } = {}) {
    const where = status ? 'WHERE j.status=?' : '';
    const args = status ? [status] : [];
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified,
      c.logo_file AS company_logo, c.gallery AS company_gallery,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications
      FROM jobs j JOIN companies c ON c.id=j.company_id ${where} ORDER BY j.created_at DESC`, ...args)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications }));
  }

  publicJobsForCompany(companyId) {
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified,
      c.logo_file AS company_logo, c.gallery AS company_gallery
      FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE j.company_id=? AND j.status='approved' AND (j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours'))
      ORDER BY j.featured DESC, j.published_at DESC`, companyId).map((r) => this.rowToJob(r));
  }

  /* ---------------- postulaciones ---------------- */
  insertApplication(a) {
    const stage = a.stage || LEGACY_STAGE[a.status] || 'nuevo';
    const created = a.createdAt || now();
    const responded = a.respondedAt || (stage !== 'nuevo' ? created + 86400000 : null);
    this.run(`INSERT INTO applications(id,job_id,candidate_id,name,email,phone,message,cv_file,cv_name,status,stage,created_at,responded_at,manual)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      a.id, a.jobId, a.candidateId || null, a.name, a.email, a.phone, a.message || '',
      a.cvFile || null, a.cvName || '', a.status || 'nueva', stage, created, responded, a.manual ? 1 : 0);
    return this.application(a.id);
  }
  application(id) {
    const r = this.one(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.id=?`, id);
    return r ? this.rowToApplication(r) : null;
  }
  applicationDetail(id) {
    const a = this.application(id);
    if (!a) return null;
    const cand = a.candidateId ? this.candidate(a.candidateId) : null;
    return { ...a, candidate: cand ? this.rowToCandidate(cand) : null };
  }
  applicationByCandidate(candidateId, jobId) {
    return this.one('SELECT * FROM applications WHERE candidate_id=? AND job_id=?', candidateId, jobId);
  }
  rowToApplication(r) {
    return {
      id: r.id, jobId: r.job_id, jobTitle: r.job_title, companyId: r.company_id, companyName: r.company_name,
      candidateId: r.candidate_id || null,
      name: r.name, email: r.email, phone: r.phone, message: r.message,
      hasCv: !!r.cv_file, cvFile: r.cv_file, cvName: r.cv_name, status: r.status,
      stage: r.stage || LEGACY_STAGE[r.status] || 'nuevo',
      rating: r.rating || 0, notes: r.notes || '', tags: jparse(r.tags, []),
      aiScore: r.ai_score == null ? null : r.ai_score, aiSummary: r.ai_summary || '',
      aiStrengths: jparse(r.ai_strengths, []), aiGaps: jparse(r.ai_gaps, []),
      aiSkills: jparse(r.ai_skills, []), aiSeniority: r.ai_seniority || '',
      aiRecommendation: r.ai_recommendation || '', aiAt: r.ai_at || null,
      createdAt: r.created_at, respondedAt: r.responded_at || null,
    };
  }
  rowToCandidate(r) {
    return {
      id: r.id, name: r.name, email: r.email, phone: r.phone,
      locality: r.locality || '', headline: r.headline || '', about: r.about || '',
      skills: jparse(r.skills, []), experience: r.experience || '', education: r.education || '',
      availability: r.availability || '', linkedin: r.linkedin || '',
      hasPhoto: !!r.photo_file, photoFile: r.photo_file || null,
      photo: r.photo_file ? `/api/photo/c/${r.id}` : null,
      hasCv: !!r.cv_file, cvFile: r.cv_file || null, cvName: r.cv_name || '',
      cvUrl: r.cv_file ? `/api/cv/c/${r.id}` : null,
      openToWork: !!r.open_to_work, categories: jparse(r.categories, []),
      createdAt: r.created_at,
    };
  }
  applicationsForJob(jobId) {
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      WHERE a.job_id=? ORDER BY a.created_at DESC`, jobId).map((r) => this.rowToApplication(r));
  }
  applicationsForCompany(companyId, { jobId = '', stage = '', q = '' } = {}) {
    const where = ['j.company_id=?'];
    const args = [companyId];
    if (jobId) { where.push('a.job_id=?'); args.push(jobId); }
    if (stage && STAGES.includes(stage)) { where.push('a.stage=?'); args.push(stage); }
    if (q) { where.push('(a.name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)'); const l = `%${q}%`; args.push(l, l, l); }
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC`, ...args)
      .map((r) => ({ ...this.rowToApplication(r), candidate: r.candidate_id ? this.publicCandidateRow(r.candidate_id) : null }));
  }
  publicCandidateRow(id) {
    const c = this.candidate(id);
    return c ? this.rowToCandidate(c) : null;
  }
  applicationsForCandidate(candidateId) {
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name, c.logo_file AS company_logo,
      j.locality, j.category, j.modality, j.status AS job_status
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      WHERE a.candidate_id=? ORDER BY a.created_at DESC`, candidateId)
      .map((r) => ({ ...this.rowToApplication(r), locality: r.locality, category: r.category, jobStatus: r.job_status, companyLogo: r.company_logo }));
  }
  allApplications() {
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      ORDER BY a.created_at DESC`).map((r) => ({ ...this.rowToApplication(r), candidate: r.candidate_id ? this.publicCandidateRow(r.candidate_id) : null }));
  }
  countApplicationsForCompany(companyId) {
    return this.one(`SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=?`, companyId).n;
  }
  setApplicationStatus(id, status) {
    const stage = LEGACY_STAGE[status] || (STAGES.includes(status) ? status : 'nuevo');
    this.run('UPDATE applications SET status=?, stage=? WHERE id=?', status, stage, id);
    if (stage !== 'nuevo') this.run('UPDATE applications SET responded_at=? WHERE id=? AND responded_at IS NULL', now(), id);
  }
  updateApplication(id, patch) {
    const a = this.application(id);
    if (!a) return null;
    const n = Object.assign({}, a, patch);
    if (patch.stage && !patch.status) n.status = patch.stage === 'descartado' ? 'descartada' : (patch.stage === 'entrevista' ? 'contactada' : 'nueva');
    const tags = typeof n.tags === 'string' ? jparse(n.tags, []) : (n.tags || []);
    this.run(`UPDATE applications SET name=?, phone=?, stage=?, status=?, rating=?, notes=?, tags=? WHERE id=?`,
      n.name, n.phone, n.stage, n.status, Number(n.rating) || 0, n.notes || '', JSON.stringify(tags), id);
    /* la primera vez que sale de "nuevo" cuenta como respuesta de la empresa */
    if (n.stage !== 'nuevo') this.run('UPDATE applications SET responded_at=? WHERE id=? AND responded_at IS NULL', now(), id);
    return this.application(id);
  }
  setApplicationAi(id, ai) {
    this.run(`UPDATE applications SET ai_score=?, ai_summary=?, ai_strengths=?, ai_gaps=?, ai_skills=?,
      ai_seniority=?, ai_recommendation=?, ai_at=? WHERE id=?`,
      ai.score == null ? null : Number(ai.score), ai.summary || '', JSON.stringify(ai.strengths || []),
      JSON.stringify(ai.gaps || []), JSON.stringify(ai.skills || []), ai.seniority || '',
      ai.recommendation || '', now(), id);
    return this.application(id);
  }
  stageCounts(companyId) {
    const out = {}; for (const s of STAGES) out[s] = 0;
    for (const r of this.all(`SELECT a.stage AS s, COUNT(*) AS n FROM applications a
      JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? GROUP BY a.stage`, companyId)) out[r.s] = r.n;
    return out;
  }

  /* ---------------- guardados ---------------- */
  toggleSaved(candidateId, jobId) {
    const has = this.one('SELECT 1 AS x FROM saved_jobs WHERE candidate_id=? AND job_id=?', candidateId, jobId);
    if (has) { this.run('DELETE FROM saved_jobs WHERE candidate_id=? AND job_id=?', candidateId, jobId); return false; }
    this.run('INSERT INTO saved_jobs(candidate_id,job_id,created_at) VALUES(?,?,?)', candidateId, jobId, now());
    return true;
  }
  savedJobs(candidateId) {
    return this.all(`SELECT j.id, j.title, j.locality, j.category, j.modality, j.salary, j.type,
      c.name AS company_name, c.logo_file AS company_logo, s.created_at AS saved_at
      FROM saved_jobs s JOIN jobs j ON j.id=s.job_id JOIN companies c ON c.id=j.company_id
      WHERE s.candidate_id=? AND j.status='approved' ORDER BY s.created_at DESC`, candidateId);
  }

  /* ---------------- respuesta de la empresa ---------------- */
  /**
   * Qué tan rápido y cuánto responde una empresa. Evaluable: postulación respondida,
   * o sin respuesta hace más de 3 días. Con menos de 3 evaluables no se muestra nada.
   */
  responseStats(companyId) {
    const co = this.company(companyId);
    if (!co || co.claimed === 0) return null; // una ficha sin dueño no responde

    /* los postulantes que carga la propia empresa no cuentan: inflarían la insignia */
    const rows = this.all(`SELECT a.created_at AS c, a.responded_at AS r FROM applications a
      JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? AND a.manual=0`, companyId);
    const limit = now() - 3 * 86400000;
    const evaluable = rows.filter((x) => x.r || x.c < limit);
    if (evaluable.length < 3) return null;
    const answered = evaluable.filter((x) => x.r);
    const days = answered.map((x) => Math.max(1, Math.ceil((x.r - x.c) / 86400000))).sort((a, b) => a - b);
    return {
      rate: Math.round((answered.length / evaluable.length) * 100),
      days: days.length ? days[Math.floor((days.length - 1) / 2)] : 0,
      total: evaluable.length,
    };
  }

  /* true la primera vez: marca la oferta como anunciada a las alertas */
  claimAnnouncement(jobId) {
    return this.run('UPDATE jobs SET announced_at=? WHERE id=? AND announced_at IS NULL', now(), jobId).changes > 0;
  }

  /* ---------------- notificaciones ---------------- */
  notify(recipientType, recipientId, { kind, title, body = '', link = '', createdAt } = {}) {
    if (!recipientId || !title) return;
    this.run(`INSERT INTO notifications(id,recipient_type,recipient_id,kind,title,body,link,read,created_at)
      VALUES(?,?,?,?,?,?,?,0,?)`, uid('n'), recipientType, recipientId, kind, title, body, link, createdAt || now());
  }
  notifications(recipientType, recipientId, limit = 30) {
    return this.all(`SELECT id, kind, title, body, link, read, created_at FROM notifications
      WHERE recipient_type=? AND recipient_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?`, recipientType, recipientId, limit)
      .map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body || '', link: n.link || '', read: !!n.read, createdAt: n.created_at }));
  }
  unreadCount(recipientType, recipientId) {
    return this.one('SELECT COUNT(*) AS n FROM notifications WHERE recipient_type=? AND recipient_id=? AND read=0', recipientType, recipientId).n;
  }
  markRead(recipientType, recipientId, id = '') {
    if (id) this.run('UPDATE notifications SET read=1 WHERE recipient_type=? AND recipient_id=? AND id=?', recipientType, recipientId, id);
    else this.run('UPDATE notifications SET read=1 WHERE recipient_type=? AND recipient_id=?', recipientType, recipientId);
  }

  /* ---------------- alertas ---------------- */
  insertAlert(a) {
    this.run(`INSERT INTO alerts(id,candidate_id,label,q,locality,category,type,modality,gig,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, a.id, a.candidateId, a.label, a.q || '', a.locality || '', a.category || '',
      a.type || '', a.modality || '', a.gig ? 1 : 0, now());
    return this.rowToAlert(this.one('SELECT * FROM alerts WHERE id=?', a.id));
  }
  rowToAlert(r) {
    return {
      id: r.id, candidateId: r.candidate_id, label: r.label, q: r.q || '', locality: r.locality || '',
      category: r.category || '', type: r.type || '', modality: r.modality || '', gig: !!r.gig, createdAt: r.created_at,
    };
  }
  alertsFor(candidateId) {
    return this.all('SELECT * FROM alerts WHERE candidate_id=? ORDER BY created_at DESC, rowid DESC', candidateId).map((r) => this.rowToAlert(r));
  }
  allAlerts() { return this.all('SELECT * FROM alerts').map((r) => this.rowToAlert(r)); }
  deleteAlert(id, candidateId) {
    return this.run('DELETE FROM alerts WHERE id=? AND candidate_id=?', id, candidateId).changes > 0;
  }

  /* ---------------- invitaciones ---------------- */
  insertInvitation(i) {
    this.run('INSERT INTO invitations(id,company_id,job_id,candidate_id,message,status,created_at) VALUES(?,?,?,?,?,?,?)',
      i.id, i.companyId, i.jobId, i.candidateId, i.message || '', i.status || 'enviada', i.createdAt || now());
  }
  invitation(jobId, candidateId) {
    return this.one('SELECT * FROM invitations WHERE job_id=? AND candidate_id=?', jobId, candidateId);
  }
  invitationsToday(companyId) {
    return this.one('SELECT COUNT(*) AS n FROM invitations WHERE company_id=? AND created_at>?', companyId, now() - 86400000).n;
  }
  invitationsForCandidate(candidateId) {
    return this.all(`SELECT i.*, c.name AS company_name, c.logo_file AS company_logo FROM invitations i
      JOIN companies c ON c.id=i.company_id JOIN jobs j ON j.id=i.job_id
      WHERE i.candidate_id=? AND j.status='approved' ORDER BY i.created_at DESC`, candidateId);
  }
  markInvitationApplied(jobId, candidateId) {
    this.run("UPDATE invitations SET status='postulada' WHERE job_id=? AND candidate_id=?", jobId, candidateId);
  }
  /* ids de personas ya invitadas / ya postuladas a una oferta */
  jobPeople(jobId) {
    return {
      invited: new Set(this.all('SELECT candidate_id AS id FROM invitations WHERE job_id=?', jobId).map((r) => r.id)),
      applied: new Set(this.all('SELECT candidate_id AS id FROM applications WHERE job_id=? AND candidate_id IS NOT NULL', jobId).map((r) => r.id)),
    };
  }

  /* ---------------- avisos importados ---------------- */
  blocked(phoneNorm, nameNorm) {
    return !!this.one(`SELECT 1 AS x FROM import_blocklist
      WHERE (kind='phone' AND value=? AND ?<>'') OR (kind='name' AND value=? AND ?<>'') LIMIT 1`,
    phoneNorm || '', phoneNorm || '', nameNorm || '', nameNorm || '');
  }
  addBlock(kind, value, label = '') {
    if (!value) return;
    this.run('INSERT OR IGNORE INTO import_blocklist(id,kind,value,label,created_at) VALUES(?,?,?,?,?)', uid('b'), kind, value, label, now());
  }
  blockedCompanies() {
    return this.all("SELECT label, created_at FROM import_blocklist WHERE kind='name' ORDER BY created_at DESC LIMIT 100")
      .map((r) => ({ name: r.label, at: r.created_at }));
  }
  findUnclaimed({ phoneNorm = '', nameNorm = '' } = {}) {
    return this.one(`SELECT * FROM companies WHERE claimed=0
      AND ((phone_norm=? AND ?<>'') OR (name_norm=? AND ?<>'')) ORDER BY created_at LIMIT 1`, phoneNorm, phoneNorm, nameNorm, nameNorm);
  }
  createUnclaimed({ name, phone = '', locality = '', phoneNorm = '', nameNorm = '' }) {
    const id = uid('c');
    this.insertCompany({ id, name, email: `sin-reclamar+${id}@import.workuco`, phone, password: '!', verified: 0, locality });
    this.run(`UPDATE companies SET claimed=0, imported=1, claim_token=?, notify_status='sin_avisar', phone_norm=?, name_norm=? WHERE id=?`,
      crypto.randomBytes(24).toString('hex'), phoneNorm, nameNorm, id);
    return this.company(id);
  }
  setJobSource(jobId, { sourceName = '', sourceText = '' } = {}) {
    this.run("UPDATE jobs SET source_kind='importado', source_name=?, source_text=?, imported_at=? WHERE id=?", sourceName, sourceText, now(), jobId);
  }
  /* Aviso importado vigente del mismo teléfono con un título equivalente. */
  importedDuplicate(phoneNorm, title) {
    if (!phoneNorm) return null;
    const want = normName(title);
    return this.all(`SELECT j.id, j.title FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE j.source_kind='importado' AND j.status='approved' AND c.phone_norm=?
      AND (j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours'))`, phoneNorm)
      .find((j) => normName(j.title) === want) || null;
  }
  importedOverview() {
    return this.all('SELECT * FROM companies WHERE imported=1 ORDER BY created_at DESC').map((c) => ({
      company: c,
      jobs: this.all(`SELECT j.id, j.title, j.status, j.closes_at, j.source_name, j.source_text,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications
        FROM jobs j WHERE j.company_id=? ORDER BY j.created_at DESC`, c.id),
    }));
  }
  companyByClaimToken(token) {
    if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
    return this.one('SELECT * FROM companies WHERE claim_token=? AND claimed=0', token);
  }
  applicantsOf(companyId) {
    return this.all(`SELECT DISTINCT a.candidate_id AS candidateId, j.id AS jobId, j.title AS jobTitle FROM applications a
      JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? AND a.candidate_id IS NOT NULL`, companyId);
  }
  countApplicantsOf(companyId) {
    return this.one('SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=?', companyId).n;
  }
  claimCompany(id, { email, password }) {
    this.run('UPDATE companies SET email=?, password=?, claimed=1, claim_token=NULL WHERE id=? AND claimed=0', email, password, id);
    return this.company(id);
  }
  markNotified(id) {
    return this.run("UPDATE companies SET notify_status='avisado', notified_at=? WHERE id=? AND imported=1 AND claimed=0", now(), id).changes > 0;
  }
  deleteCompanyCascade(id) {
    this.tx(() => {
      for (const j of this.all('SELECT id FROM jobs WHERE company_id=?', id)) this.removeJob(j.id);
      this.run('DELETE FROM invitations WHERE company_id=?', id);
      this.run("DELETE FROM notifications WHERE recipient_type='company' AND recipient_id=?", id);
      this.run('DELETE FROM sessions WHERE company_id=?', id);
      this.run('DELETE FROM companies WHERE id=?', id);
    });
  }

  /* ---------------- sesiones ---------------- */
  createSession(token, role, companyId, ttlMs, candidateId) {
    this.run('INSERT INTO sessions(token,role,company_id,candidate_id,created_at,expires) VALUES(?,?,?,?,?,?)',
      token, role, companyId || null, candidateId || null, now(), now() + ttlMs);
  }
  session(token) {
    const s = this.one('SELECT * FROM sessions WHERE token=?', token);
    if (!s) return null;
    if (s.expires < now()) { this.run('DELETE FROM sessions WHERE token=?', token); return null; }
    return s;
  }
  deleteSession(token) { this.run('DELETE FROM sessions WHERE token=?', token); }
  cleanSessions() { this.run('DELETE FROM sessions WHERE expires<?', now()); }

  /* ---------------- métricas ---------------- */
  stats() {
    return {
      published: this.one("SELECT COUNT(*) AS n FROM jobs WHERE status='approved'").n,
      pending: this.one("SELECT COUNT(*) AS n FROM jobs WHERE status='pending'").n,
      rejected: this.one("SELECT COUNT(*) AS n FROM jobs WHERE status='rejected'").n,
      applications: this.one('SELECT COUNT(*) AS n FROM applications').n,
      companies: this.one('SELECT COUNT(*) AS n FROM companies').n,
      candidates: this.one('SELECT COUNT(*) AS n FROM candidates').n,
      newApplications: this.one("SELECT COUNT(*) AS n FROM applications WHERE stage='nuevo'").n,
      views: this.one("SELECT COALESCE(SUM(views),0) AS n FROM jobs WHERE status='approved'").n,
    };
  }

  publicCounts() {
    const open = "status='approved' AND (closes_at IS NULL OR closes_at='' OR closes_at>=date('now','-3 hours'))";
    return {
      jobs: this.one(`SELECT COUNT(*) AS n FROM jobs WHERE ${open}`).n,
      gigs: this.one(`SELECT COUNT(*) AS n FROM jobs WHERE ${open} AND gig=1`).n,
      companies: this.one("SELECT COUNT(DISTINCT company_id) AS n FROM jobs WHERE status='approved'").n,
      candidates: this.one('SELECT COUNT(*) AS n FROM candidates').n,
    };
  }

  /* ---------------- demo ---------------- */
  isEmpty() { return this.one('SELECT COUNT(*) AS n FROM jobs').n === 0; }
  seedDemo(data) {
    this.tx(() => {
      for (const c of data.companies) {
        if (!this.companyByEmail(c.email)) this.insertCompany({ ...c, id: c.id, createdAt: now() - 86400000 * 20, verified: 1 });
      }
      for (const cand of data.candidates || []) {
        if (!this.candidateByEmail(cand.email)) this.insertCandidate({ ...cand, password: cand.password, createdAt: now() - 86400000 * 15 });
      }
      for (const j of data.jobs) this.insertJob(j);
      for (const a of data.applications || []) {
        const saved = this.insertApplication(a);
        if (a.ai && saved) this.setApplicationAi(saved.id, a.ai);
        if (a.rating) this.updateApplication(saved.id, { rating: a.rating });
      }
      for (const i of data.invitations || []) this.insertInvitation(i);
      for (const n of data.notifications || []) this.notify(n.type, n.to, n);
    });
  }
  clearDemo() {
    const ids = this.all("SELECT id FROM companies WHERE email LIKE '%@demo.workuco'").map((r) => r.id);
    for (const id of ids) {
      for (const j of this.all('SELECT id FROM jobs WHERE company_id=?', id)) this.removeJob(j.id);
      this.run('DELETE FROM companies WHERE id=?', id);
    }
    for (const c of this.all("SELECT id FROM candidates WHERE email LIKE '%@demo.workuco'")) {
      this.run("DELETE FROM notifications WHERE recipient_type='candidate' AND recipient_id=?", c.id);
    }
    for (const id of ids) this.run("DELETE FROM notifications WHERE recipient_type='company' AND recipient_id=?", id);
    this.run("DELETE FROM candidates WHERE email LIKE '%@demo.workuco'");
  }
}

module.exports = {
  Store, uid, slugify, now, jparse,
  LOCALITIES, CATEGORIES, TYPES, MODALITIES, BENEFITS, STAGES, STAGE_LABEL, SALARY_PERIODS, MONTH_FACTOR,
};
