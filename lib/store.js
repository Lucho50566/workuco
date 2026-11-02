/**
 * Workuco — capa de datos (SQLite con node:sqlite, sin dependencias).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const now = () => Date.now();
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const LOCALITIES = ['San Carlos', 'Tunuyán', 'Tupungato'];
const CATEGORIES = ['Administración', 'Agricultura', 'Gastronomía', 'Comercio', 'Turismo', 'Construcción', 'Tecnología', 'Mantenimiento', 'Otros'];
const TYPES = ['Tiempo completo', 'Medio tiempo', 'Temporal', 'Pasantía', 'Freelance'];
const MODALITIES = ['Presencial', 'Híbrido', 'Remoto'];

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
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, featured, published_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_locality ON jobs(locality);
      CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
      CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires);
    `);
  }

  /* ---------------- empresas ---------------- */
  company(id) { return this.one('SELECT * FROM companies WHERE id=?', id); }
  companyByEmail(email) { return this.one('SELECT * FROM companies WHERE lower(email)=lower(?)', String(email || '').trim()); }
  insertCompany(c) {
    this.run('INSERT INTO companies(id,name,email,phone,website,description,password,verified,plan,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      c.id, c.name, c.email, c.phone || '', c.website || '', c.description || '', c.password, c.verified ? 1 : 0, c.plan || 'free', c.createdAt || now());
    return this.company(c.id);
  }
  updateCompany(id, patch) {
    const c = this.company(id);
    if (!c) return null;
    const next = Object.assign({}, c, patch);
    this.run('UPDATE companies SET name=?, phone=?, website=?, description=?, verified=?, plan=? WHERE id=?',
      next.name, next.phone || '', next.website || '', next.description || '', next.verified ? 1 : 0, next.plan || 'free', id);
    return this.company(id);
  }
  companies() {
    return this.all(`SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.company_id=c.id) AS jobs,
      (SELECT COUNT(*) FROM jobs j WHERE j.company_id=c.id AND j.status='approved') AS published
      FROM companies c ORDER BY c.created_at DESC`);
  }

  /* ---------------- ofertas ---------------- */
  insertJob(j) {
    this.run(`INSERT INTO jobs(id,company_id,title,locality,category,type,modality,description,responsibilities,
      requirements,experience,schedule,salary,contact_email,contact_phone,closes_at,status,featured,created_at,published_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      j.id, j.companyId, j.title, j.locality, j.category, j.type, j.modality, j.description,
      j.responsibilities || '', j.requirements || '', j.experience || '', j.schedule || '', j.salary || '',
      j.contactEmail || '', j.contactPhone || '', j.closesAt || '', j.status || 'pending', j.featured ? 1 : 0,
      j.createdAt || now(), j.publishedAt || null);
    return this.job(j.id);
  }
  updateJob(id, patch) {
    const j = this.job(id);
    if (!j) return null;
    const n = Object.assign({}, j, patch);
    this.run(`UPDATE jobs SET title=?, locality=?, category=?, type=?, modality=?, description=?, responsibilities=?,
      requirements=?, experience=?, schedule=?, salary=?, contact_email=?, contact_phone=?, closes_at=?,
      status=?, featured=?, reject_reason=?, published_at=? WHERE id=?`,
      n.title, n.locality, n.category, n.type, n.modality, n.description, n.responsibilities || '',
      n.requirements || '', n.experience || '', n.schedule || '', n.salary || '', n.contactEmail || '',
      n.contactPhone || '', n.closesAt || '', n.status, n.featured ? 1 : 0, n.rejectReason || null,
      n.publishedAt || null, id);
    return this.job(id);
  }
  removeJob(id) { this.run('DELETE FROM applications WHERE job_id=?', id); this.run('DELETE FROM jobs WHERE id=?', id); }
  bumpViews(id) { this.run('UPDATE jobs SET views=views+1 WHERE id=?', id); }

  job(id) {
    const r = this.one(`SELECT j.*, c.name AS company_name, c.website AS company_website,
      c.description AS company_description, c.verified AS company_verified
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=?`, id);
    return r ? this.rowToJob(r) : null;
  }
  rowToJob(r) {
    return {
      id: r.id, companyId: r.company_id, companyName: r.company_name, companyWebsite: r.company_website,
      companyDescription: r.company_description, companyVerified: !!r.company_verified,
      title: r.title, locality: r.locality, category: r.category, type: r.type, modality: r.modality,
      description: r.description, responsibilities: r.responsibilities, requirements: r.requirements,
      experience: r.experience, schedule: r.schedule, salary: r.salary,
      contactEmail: r.contact_email, contactPhone: r.contact_phone, closesAt: r.closes_at,
      status: r.status, featured: !!r.featured, rejectReason: r.reject_reason, views: r.views,
      createdAt: r.created_at, publishedAt: r.published_at,
    };
  }

  /**
   * Búsqueda pública. Sólo ofertas aprobadas y no vencidas.
   */
  searchJobs({ q = '', locality = '', category = '', type = '', modality = '', sort = 'recent', page = 1, limit = 9 } = {}) {
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
    const order = sort === 'old' ? 'j.published_at ASC' : 'j.featured DESC, j.published_at DESC';
    const total = this.one(`SELECT COUNT(*) AS n FROM jobs j JOIN companies c ON c.id=j.company_id WHERE ${where.join(' AND ')}`, ...args).n;
    const pages = Math.max(1, Math.ceil(total / limit));
    const p = Math.min(Math.max(1, Number(page) || 1), pages);
    const rows = this.all(`SELECT j.*, c.name AS company_name, c.website AS company_website, c.description AS company_description,
      c.verified AS company_verified FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, (p - 1) * limit);
    return { jobs: rows.map((r) => this.rowToJob(r)), total, page: p, pages, limit };
  }

  companyJobs(companyId) {
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.company_id=? ORDER BY j.created_at DESC`, companyId)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications }));
  }

  allJobs({ status = '' } = {}) {
    const where = status ? 'WHERE j.status=?' : '';
    const args = status ? [status] : [];
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications
      FROM jobs j JOIN companies c ON c.id=j.company_id ${where} ORDER BY j.created_at DESC`, ...args)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications }));
  }

  /* ---------------- postulaciones ---------------- */
  insertApplication(a) {
    this.run(`INSERT INTO applications(id,job_id,name,email,phone,message,cv_file,cv_name,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      a.id, a.jobId, a.name, a.email, a.phone, a.message || '', a.cvFile || null, a.cvName || '', a.status || 'nueva', a.createdAt || now());
    return this.application(a.id);
  }
  application(id) {
    const r = this.one(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.id=?`, id);
    return r ? this.rowToApplication(r) : null;
  }
  rowToApplication(r) {
    return {
      id: r.id, jobId: r.job_id, jobTitle: r.job_title, companyId: r.company_id, companyName: r.company_name,
      name: r.name, email: r.email, phone: r.phone, message: r.message,
      hasCv: !!r.cv_file, cvFile: r.cv_file, cvName: r.cv_name, status: r.status, createdAt: r.created_at,
    };
  }
  applicationsForJob(jobId) {
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      WHERE a.job_id=? ORDER BY a.created_at DESC`, jobId).map((r) => this.rowToApplication(r));
  }
  allApplications() {
    return this.all(`SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
      FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
      ORDER BY a.created_at DESC`).map((r) => this.rowToApplication(r));
  }
  countApplicationsForCompany(companyId) {
    return this.one(`SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=?`, companyId).n;
  }
  setApplicationStatus(id, status) { this.run('UPDATE applications SET status=? WHERE id=?', status, id); }

  /* ---------------- sesiones ---------------- */
  createSession(token, role, companyId, ttlMs) {
    this.run('INSERT INTO sessions(token,role,company_id,created_at,expires) VALUES(?,?,?,?,?)',
      token, role, companyId || null, now(), now() + ttlMs);
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
      newApplications: this.one("SELECT COUNT(*) AS n FROM applications WHERE status='nueva'").n,
      views: this.one("SELECT COALESCE(SUM(views),0) AS n FROM jobs WHERE status='approved'").n,
    };
  }

  /* ---------------- demo ---------------- */
  isEmpty() { return this.one('SELECT COUNT(*) AS n FROM jobs').n === 0; }
  seedDemo(data) {
    this.tx(() => {
      for (const c of data.companies) {
        if (!this.companyByEmail(c.email)) this.insertCompany({ ...c, id: c.id, createdAt: now() - 86400000 * 20, verified: 1 });
      }
      for (const j of data.jobs) this.insertJob(j);
      for (const a of data.applications || []) this.insertApplication(a);
    });
  }
  clearDemo() {
    const ids = this.all("SELECT id FROM companies WHERE email LIKE '%@demo.workuco'").map((r) => r.id);
    for (const id of ids) {
      for (const j of this.all('SELECT id FROM jobs WHERE company_id=?', id)) this.removeJob(j.id);
      this.run('DELETE FROM companies WHERE id=?', id);
    }
  }
}

module.exports = {
  Store, uid, slugify, now,
  LOCALITIES, CATEGORIES, TYPES, MODALITIES,
};
