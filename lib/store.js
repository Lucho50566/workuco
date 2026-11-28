/**
 * WorkUco — capa de datos (SQLite con node:sqlite, sin dependencias).
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
const { normName, normPhone } = require('./importer');
const { newCode: newCertCode } = require('./certificates');
const placePhoneNorm = (p) => normPhone(p.whatsapp || '') || normPhone(p.phone || '');

const now = () => Date.now();
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
/* Texto comparable para buscar: sin tildes (también la tilde separada de los iPhone), ñ→n y en minúsculas.
   SQLite sólo ignora mayúsculas en letras sin tilde: "tecnico" no encontraba "Técnico" ni "TÉCNICO". */
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* patrón LIKE para fold(columna): lo que escribe la persona se busca tal cual (% y _ no son comodines) */
const likeFold = (q) => `%${fold(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
/* condición "alguna de estas columnas contiene q" (sin tildes ni mayúsculas) */
const matchAny = (cols) => `(${cols.map((c) => `fold(${c}) LIKE ? ESCAPE '\\'`).join(' OR ')})`;
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

/* día en hora de Argentina (UTC-3), corrido "offset" días: 0 = hoy, -6 = hace 6 días */
/* Pack Cosecha: qué avisos entran (Agricultura o changa) y cuántos se destacan */
const COSECHA_SQL = "(j.category='Agricultura' OR j.gig=1)";
const COSECHA_MAX_JOBS = 5;
/* por qué una empresa borró su aviso importado (opción rápida en /reclamar) */
const IMPORT_REASONS = {
  cubierto: 'Ya cubrimos el puesto',
  no_publicar: 'No queremos publicar en WorkUco',
  datos_mal: 'Los datos están mal',
  otro: 'Otro',
};
const isCosechaJob = (r) => r.category === 'Agricultura' || !!r.gig;
const dayAR = (offset = 0) => new Date(Date.now() - 3 * 3600e3 + offset * 86400000).toISOString().slice(0, 10);
/* un aviso está destacado si se marcó y su destacado no venció (sin fecha = sin vencimiento) */
const featuredSql = () => `(CASE WHEN j.featured=1 AND (j.featured_until IS NULL OR j.featured_until>${Date.now()}) THEN 1 ELSE 0 END)`;
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
/* lista de flyers de un aviso nuevo: flyerFiles o el flyer único de antes */
const flyerList = (j) => (Array.isArray(j.flyerFiles) ? j.flyerFiles : (j.flyerFile ? [j.flyerFile] : [])).filter(Boolean).slice(0, 5);
/* jparse sólo devuelve listas; el horario de una ficha es un objeto */
const parseObject = (v) => { try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (_) { return null; } };
const media = (f) => (f ? (/^https?:|^\//.test(f) ? f : `/media/${f}`) : null);

class Store {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.function('fold', { deterministic: true }, fold);
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
    /* base para ofrecer servicios a empresas: interés, permiso de contacto y tamaño */
    this.ensureColumn('companies', 'employees', 'TEXT');
    this.ensureColumn('companies', 'services_interest', 'TEXT');
    this.ensureColumn('companies', 'services_note', 'TEXT');
    this.ensureColumn('companies', 'services_at', 'INTEGER');
    this.ensureColumn('companies', 'marketing_ok', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('companies', 'marketing_at', 'INTEGER');
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
    /* consentimiento: cuándo y qué versión de los términos aceptó cada cuenta (Ley 25.326 art. 5) */
    for (const t of ['candidates', 'companies']) {
      this.ensureColumn(t, 'terms_at', 'INTEGER');
      this.ensureColumn(t, 'terms_version', 'TEXT');
      /* avisos por mail: prendidos salvo que la persona o empresa los apague */
      this.ensureColumn(t, 'mail_opt_out', 'INTEGER NOT NULL DEFAULT 0');
      /* qué avisos llegan por mail, por tipo: {"postulaciones": false, …} (lo que falta, prendido) */
      this.ensureColumn(t, 'mail_prefs', 'TEXT');
    }
    /* preferencias de búsqueda de la persona */
    this.ensureColumn('candidates', 'pref_localities', 'TEXT');
    this.ensureColumn('candidates', 'pref_types', 'TEXT');
    this.ensureColumn('candidates', 'pref_modalities', 'TEXT');
    this.ensureColumn('candidates', 'pref_gigs', 'INTEGER NOT NULL DEFAULT 1');
    /* "Avisarme al celular de empleos nuevos para mí": lo elige la persona; como mucho uno por día */
    this.ensureColumn('candidates', 'push_jobs', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('candidates', 'push_jobs_last', 'INTEGER');
    /* recuperar contraseña: se guarda sólo el hash del código; vence y sirve una vez */
    this.db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      account_id TEXT NOT NULL,
      expires INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`);

    /* Guía del Valle: fichas de oficios, servicios, salidas y comida */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        owner_type TEXT,
        owner_id TEXT,
        section TEXT NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        name_norm TEXT,
        description TEXT,
        localities TEXT,
        address TEXT,
        home_service INTEGER NOT NULL DEFAULT 0,
        whatsapp TEXT,
        phone TEXT,
        phone_norm TEXT,
        instagram TEXT,
        website TEXT,
        hours TEXT,
        photos TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reject_reason TEXT,
        featured_until INTEGER,
        imported INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT UNIQUE,
        consent_by TEXT,
        consent_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        approved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_places_owner ON places(owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_places_list ON places(status, section);
      CREATE TABLE IF NOT EXISTS place_stats (
        place_id TEXT NOT NULL,
        day TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        whatsapp INTEGER NOT NULL DEFAULT 0,
        calls INTEGER NOT NULL DEFAULT 0,
        maps INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (place_id, day)
      );
    `);

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
    this.ensureColumn('companies', 'claim_msg', 'TEXT');
    this.ensureColumn('companies', 'claim_msg_opp', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('companies', 'opp_notified_at', 'INTEGER');
    /* Pack Cosecha: hasta cuándo dura y si la empresa lo pidió (lanzamiento gratis) */
    this.ensureColumn('companies', 'cosecha_until', 'INTEGER');
    this.ensureColumn('companies', 'cosecha_req_at', 'INTEGER');
    this.ensureColumn('jobs', 'source_kind', "TEXT NOT NULL DEFAULT 'propio'");
    this.ensureColumn('jobs', 'source_name', 'TEXT');
    this.ensureColumn('jobs', 'source_text', 'TEXT');
    this.ensureColumn('jobs', 'imported_at', 'INTEGER');
    this.ensureColumn('jobs', 'flyer_file', 'TEXT');
    this.ensureColumn('jobs', 'flyers', 'TEXT');
    /* destacados con vencimiento (null = sin vencimiento) y pedido de destacado de la empresa */
    this.ensureColumn('jobs', 'featured_until', 'INTEGER');
    this.ensureColumn('jobs', 'featured_req_at', 'INTEGER');
    /* extra "Avisar al celular": cuándo se mandó y a cuántas personas les llegó (una vez por aviso) */
    this.ensureColumn('jobs', 'push_sent_at', 'INTEGER');
    this.ensureColumn('jobs', 'push_sent_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('jobs', 'featured_from', 'INTEGER');
    /* vistas por aviso, por día y por estado (destacado o no): un mismo día puede tener las dos filas,
       así cada visita cuenta en el grupo en el que estaba el aviso cuando la recibió */
    this.run(`CREATE TABLE IF NOT EXISTS job_views (
        job_id TEXT NOT NULL,
        day TEXT NOT NULL,
        featured INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, day, featured)
      )`);
    /* datos sueltos del admin (por ejemplo, hasta cuándo ya revisó la bandeja) */
    this.run('CREATE TABLE IF NOT EXISTS admin_meta (key TEXT PRIMARY KEY, value TEXT)');
    /* pagos de destacados con Mercado Pago: una fila por intento de compra */
    this.run(`CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        job_id TEXT,
        job_title TEXT,
        days INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        mp_preference_id TEXT,
        mp_payment_id TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER
      )`);
    /* pagos de varios tipos: 'destacado' (company_id = empresa, job_id = aviso) y 'cv' (company_id = la persona,
       ref_id = la orden de CV Pro) */
    this.ensureColumn('payments', 'kind', "TEXT NOT NULL DEFAULT 'destacado'");
    this.ensureColumn('payments', 'ref_id', 'TEXT');
    /* CV Pro: una orden por CV (análisis → versiones → pago) */
    this.run(`CREATE TABLE IF NOT EXISTS cv_orders (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'analizado',
        source_kind TEXT NOT NULL,
        source_text TEXT,
        analysis TEXT,
        inputs TEXT,
        cv TEXT,
        versions INTEGER NOT NULL DEFAULT 0,
        rewrites_left INTEGER NOT NULL DEFAULT 3,
        price INTEGER NOT NULL,
        payment_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        paid_at INTEGER
      )`);
    this.run('CREATE INDEX IF NOT EXISTS idx_cv_orders_cand ON cv_orders(candidate_id, created_at)');
    /* avisos con un solo flyer (forma vieja) pasan a la lista */
    this.run("UPDATE jobs SET flyers=json_array(flyer_file) WHERE (flyers IS NULL OR flyers='' OR flyers='[]') AND flyer_file IS NOT NULL AND flyer_file<>''");
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
      /* respuesta de cada empresa a su aviso importado: queda aunque la empresa se borre */
      CREATE TABLE IF NOT EXISTS import_responses (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        name TEXT NOT NULL,
        phone_norm TEXT,
        action TEXT NOT NULL,
        reason TEXT,
        comment TEXT,
        jobs TEXT,
        applications INTEGER NOT NULL DEFAULT 0,
        notified INTEGER NOT NULL DEFAULT 0,
        notified_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_import_resp_created ON import_responses(created_at);
      /* empresas para contactar (las carga el admin; nunca se suben al repositorio) */
      CREATE TABLE IF NOT EXISTS prospects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL,
        category TEXT, locality TEXT, web TEXT, instagram TEXT, email TEXT, phone TEXT, phone_norm TEXT,
        source_url TEXT, notes TEXT, message TEXT,
        status TEXT NOT NULL DEFAULT 'pendiente',
        contacted_at INTEGER, reminded_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_co_phone_norm ON companies(phone_norm);
    `);
    /* notificaciones en el celular (Web Push): una fila por celular/navegador que activó los avisos */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_push_owner ON push_subs(owner_type, owner_id);
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
    /* Changas de vecinos: pedidos de particulares y quiénes se ofrecen a hacerlos */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        locality TEXT NOT NULL,
        area TEXT,
        when_date TEXT,
        when_note TEXT,
        pay INTEGER NOT NULL DEFAULT 0,
        pay_unit TEXT NOT NULL DEFAULT 'trabajo',
        status TEXT NOT NULL DEFAULT 'pending',
        reject_reason TEXT,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        expires_at INTEGER,
        resolved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS request_interest (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        message TEXT,
        chosen INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE (request_id, candidate_id)
      );
      CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, expires_at, approved_at);
      CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_req_interest_req ON request_interest(request_id);
      CREATE INDEX IF NOT EXISTS idx_req_interest_cand ON request_interest(candidate_id);
    `);
    /* Certificados de trabajo: copia de los datos al emitir; sobreviven al aviso y a la empresa */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        application_id TEXT,
        candidate_id TEXT NOT NULL,
        company_id TEXT,
        job_id TEXT,
        person_name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        position TEXT NOT NULL,
        locality TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        comment_status TEXT NOT NULL DEFAULT 'none',
        on_profile INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'valid',
        revoked_by TEXT,
        revoke_reason TEXT,
        issued_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_cert_candidate ON certificates(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_cert_company ON certificates(company_id);
      CREATE INDEX IF NOT EXISTS idx_cert_application ON certificates(application_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_valid_app ON certificates(application_id) WHERE status='valid' AND application_id IS NOT NULL;
    `);

    /* avisos de empresas que reclamaron antes de este arreglo: ya no son "tomados de un canal" */
    this.run("UPDATE jobs SET source_kind='propio' WHERE source_kind='importado' AND company_id IN (SELECT id FROM companies WHERE claimed=1)");
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
    this.run(`UPDATE companies SET name=?, phone=?, website=?, description=?, verified=?, plan=?, logo_file=?, gallery=?, locality=?, employees=? WHERE id=?`,
      n.name, n.phone || '', n.website || '', n.description || '', n.verified ? 1 : 0, n.plan || 'free',
      n.logo_file || null, JSON.stringify(n.gallery && typeof n.gallery === 'string' ? jparse(n.gallery, []) : (n.gallery || [])),
      n.locality || '', n.employees || '', id);
    return this.company(id);
  }
  /** Interés en servicios: sin servicios se retira todo (también el permiso de contacto). */
  setServiceInterest(id, { services, note, marketingOk }) {
    const t = now();
    const on = services.length > 0 && marketingOk;
    this.run('UPDATE companies SET services_interest=?, services_note=?, services_at=?, marketing_ok=?, marketing_at=? WHERE id=?',
      JSON.stringify(on ? services : []), on ? (note || '') : '', on ? t : null, on ? 1 : 0, t, id);
    return this.company(id);
  }
  /** Empresas que pidieron algún servicio y aceptaron que las contacten, la más reciente primero. */
  interestedCompanies() {
    return this.all("SELECT * FROM companies WHERE marketing_ok=1 AND services_interest IS NOT NULL AND services_interest NOT IN ('', '[]') ORDER BY services_at DESC");
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
    if (q) { where.push(matchAny(['skills', 'headline', 'about', 'experience'])); const l = likeFold(q); args.push(l, l, l, l); }
    return this.all(`SELECT * FROM candidates WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`, ...args);
  }
  countCandidates() { return this.one('SELECT COUNT(*) AS n FROM candidates').n; }

  /* ---------------- ofertas ---------------- */
  insertJob(j) {
    const flyerFiles = flyerList(j);
    this.run(`INSERT INTO jobs(id,company_id,title,locality,category,type,modality,description,responsibilities,
      requirements,experience,schedule,salary,contact_email,contact_phone,closes_at,status,featured,created_at,
      published_at,benefits,positions,salary_min,salary_max,salary_period,skills,gig,start_date,duration,flyer_file,flyers)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      j.id, j.companyId, j.title, j.locality, j.category, j.type, j.modality, j.description,
      j.responsibilities || '', j.requirements || '', j.experience || '', j.schedule || '', j.salary || '',
      j.contactEmail || '', j.contactPhone || '', j.closesAt || '', j.status || 'pending', j.featured ? 1 : 0,
      j.createdAt || now(), j.publishedAt || null, JSON.stringify(j.benefits || []), Number(j.positions) || 1,
      Number(j.salaryMin) || 0, Number(j.salaryMax) || 0, SALARY_PERIODS.includes(j.salaryPeriod) ? j.salaryPeriod : 'mes',
      JSON.stringify(j.skills || []), j.gig ? 1 : 0, j.startDate || '', j.duration || '', flyerFiles[0] || null, JSON.stringify(flyerFiles));
    return this.job(j.id);
  }
  updateJob(id, patch) {
    const j = this.job(id);
    if (!j) return null;
    const n = Object.assign({}, j, patch);
    const benefits = typeof n.benefits === 'string' ? jparse(n.benefits, []) : (n.benefits || []);
    /* flyers: lo que venga en el cambio; si no, los que ya tenía */
    const flyerFiles = Array.isArray(patch.flyerFiles) ? patch.flyerFiles.slice(0, 5)
      : ('flyerFile' in patch ? (patch.flyerFile ? [patch.flyerFile] : []) : (j.flyerFiles || []));
    this.run(`UPDATE jobs SET title=?, locality=?, category=?, type=?, modality=?, description=?, responsibilities=?,
      requirements=?, experience=?, schedule=?, salary=?, contact_email=?, contact_phone=?, closes_at=?,
      status=?, featured=?, reject_reason=?, published_at=?, benefits=?, positions=?,
      salary_min=?, salary_max=?, salary_period=?, skills=?, gig=?, start_date=?, duration=?, flyer_file=?, flyers=? WHERE id=?`,
      n.title, n.locality, n.category, n.type, n.modality, n.description, n.responsibilities || '',
      n.requirements || '', n.experience || '', n.schedule || '', n.salary || '', n.contactEmail || '',
      n.contactPhone || '', n.closesAt || '', n.status, n.featured ? 1 : 0, n.rejectReason || null,
      n.publishedAt || null, JSON.stringify(benefits), Number(n.positions) || 1,
      Number(n.salaryMin) || 0, Number(n.salaryMax) || 0, SALARY_PERIODS.includes(n.salaryPeriod) ? n.salaryPeriod : 'mes',
      JSON.stringify(n.skills || []), n.gig ? 1 : 0, n.startDate || '', n.duration || '', flyerFiles[0] || null, JSON.stringify(flyerFiles), id);
    return this.job(id);
  }
  removeJob(id) {
    this.run('DELETE FROM applications WHERE job_id=?', id);
    this.run('DELETE FROM saved_jobs WHERE job_id=?', id);
    this.run('DELETE FROM invitations WHERE job_id=?', id);
    this.run('DELETE FROM job_views WHERE job_id=?', id);
    this.run('DELETE FROM jobs WHERE id=?', id);
  }
  bumpViews(id) {
    this.run('UPDATE jobs SET views=views+1 WHERE id=?', id);
    const r = this.one('SELECT featured, featured_until FROM jobs WHERE id=?', id);
    const feat = r && r.featured && (r.featured_until == null || r.featured_until > now()) ? 1 : 0;
    this.run(`INSERT INTO job_views(job_id, day, featured, views) VALUES(?,?,?,1)
      ON CONFLICT(job_id, day, featured) DO UPDATE SET views=views+1`, id, dayAR(0), feat);
  }
  /** untilMs: fecha de vencimiento en ms; false lo quita. Destacar atiende el pedido de la empresa. */
  setJobFeatured(id, untilMs) {
    /* al quitarlo se guarda cuándo terminó, para las estadísticas del período destacado */
    if (untilMs === false) this.run('UPDATE jobs SET featured=0, featured_until=? WHERE id=?', now(), id);
    else this.run('UPDATE jobs SET featured=1, featured_until=?, featured_from=?, featured_req_at=NULL WHERE id=?', untilMs, now(), id);
    return this.job(id);
  }
  /* ---------------- Pack Cosecha ---------------- */
  cosechaActive(companyId) {
    const r = this.one('SELECT cosecha_until FROM companies WHERE id=?', companyId);
    return !!(r && r.cosecha_until != null && r.cosecha_until > now());
  }
  /** Avisos que entran al pack: publicados, sin cerrar, de Agricultura o changa; los más nuevos primero. */
  cosechaEligible(companyId) {
    return this.all(`SELECT j.* FROM jobs j WHERE j.company_id=? AND j.status='approved'
      AND (j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours')) AND ${COSECHA_SQL}
      ORDER BY COALESCE(j.published_at, j.created_at) DESC`, companyId);
  }
  /** Avisos de cosecha de la empresa que están destacados ahora. */
  cosechaFeaturedCount(companyId) {
    return this.cosechaEligible(companyId).filter((j) => j.featured && (j.featured_until == null || j.featured_until > now())).length;
  }
  /** Destaca un aviso hasta `until` sin acortar un destacado más largo ni tocar uno sin vencimiento. */
  featureUntilAtLeast(jobId, until) {
    const j = this.one('SELECT featured, featured_until FROM jobs WHERE id=?', jobId);
    if (!j) return false;
    if (j.featured && j.featured_until == null) return false;
    if (j.featured && j.featured_until != null && j.featured_until >= until) return false;
    if (j.featured && j.featured_until != null && j.featured_until > now()) {
      this.run('UPDATE jobs SET featured_until=? WHERE id=?', until, jobId); // se extiende sin cambiar desde cuándo
    } else this.setJobFeatured(jobId, until);
    return true;
  }
  /**
   * Activa (o extiende) el Pack Cosecha: suma `days` al pack vigente y destaca hasta 5 avisos de cosecha
   * hasta que vence. Devuelve la fecha de fin y los avisos que destacó o extendió en esta llamada.
   */
  activateCosecha(companyId, days = 30) {
    const c = this.one('SELECT cosecha_until FROM companies WHERE id=?', companyId);
    if (!c) return null;
    const until = Math.max(now(), c.cosecha_until || 0) + days * 86400000;
    this.run('UPDATE companies SET cosecha_until=?, cosecha_req_at=NULL WHERE id=?', until, companyId);
    const featured = [];
    for (const j of this.cosechaEligible(companyId).slice(0, COSECHA_MAX_JOBS)) {
      if (this.featureUntilAtLeast(j.id, until)) featured.push(j.id);
    }
    return { until, featured };
  }
  /** Quita el pack: termina ahora; los avisos conservan la fecha de destacado que tenían. */
  endCosecha(companyId) { this.run('UPDATE companies SET cosecha_until=? WHERE id=?', now(), companyId); }
  setCosechaRequest(companyId, on) { this.run('UPDATE companies SET cosecha_req_at=? WHERE id=?', on ? now() : null, companyId); }

  setFeatureRequest(id, on) {
    this.run('UPDATE jobs SET featured_req_at=? WHERE id=?', on ? now() : null, id);
    return this.job(id);
  }
  /** Vistas por aviso y por día de los avisos publicados, destacados (vigentes) contra el resto, últimos 30 días. */
  featuredStats() {
    const since = now() - 30 * 86400000;
    const DAY = 86400000;
    /* cada visita cuenta según si el aviso estaba destacado ese día; los días, según el período destacado real */
    const rows = this.all(`SELECT j.id, j.featured, j.featured_until, j.featured_from, j.published_at,
      (SELECT COALESCE(SUM(s.views),0) FROM job_views s WHERE s.job_id=j.id AND s.day>=? AND s.featured=1) AS vf,
      (SELECT COALESCE(SUM(s.views),0) FROM job_views s WHERE s.job_id=j.id AND s.day>=? AND s.featured=0) AS vn
      FROM jobs j WHERE j.status='approved'`, dayAR(-29), dayAR(-29));
    const group = () => ({ jobs: 0, views: 0, jobDays: 0 });
    const out = { featured: group(), normal: group() };
    const t = now();
    for (const r of rows) {
      const start = Math.max(r.published_at || since, since);
      const total = Math.max(t - start, DAY / 24);
      /* período destacado: desde que se destacó (o todo, si es un destacado viejo sin fecha) hasta que vence o se quitó */
      const fFrom = r.featured_from != null ? r.featured_from : (r.featured ? start : null);
      const fTo = r.featured_until != null ? Math.min(r.featured_until, t) : (r.featured ? t : null);
      const fDays = fFrom != null && fTo != null ? Math.max(0, fTo - Math.max(fFrom, start)) : 0;
      if (fDays > 0) { out.featured.jobs += 1; out.featured.jobDays += fDays / DAY; }
      if (total - fDays > 0) { out.normal.jobs += 1; out.normal.jobDays += (total - fDays) / DAY; }
      out.featured.views += r.vf; out.normal.views += r.vn;
    }
    for (const g of [out.featured, out.normal]) { g.viewsPerJobDay = g.jobDays ? Math.round((g.views / g.jobDays) * 10) / 10 : 0; delete g.jobDays; }
    out.ratio = out.normal.viewsPerJobDay ? Math.round((out.featured.viewsPerJobDay / out.normal.viewsPerJobDay) * 10) / 10 : null;
    return out;
  }

  job(id) {
    const r = this.one(`SELECT j.*, c.name AS company_name, c.website AS company_website,
      c.description AS company_description, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until, c.logo_file AS company_logo,
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
      status: r.status, rejectReason: r.reject_reason, views: r.views,
      featured: !!r.featured && (r.featured_until == null || r.featured_until > now()),
      featuredUntil: r.featured && r.featured_until != null ? r.featured_until : null,
      featureRequested: !!r.featured_req_at, featureRequestedAt: r.featured_req_at || null,
      pushSentAt: r.push_sent_at || null, pushSentCount: r.push_sent_count || 0,
      benefits: jparse(r.benefits, []), positions: r.positions || 1,
      salaryMin: r.salary_min || 0, salaryMax: r.salary_max || 0, salaryPeriod: r.salary_period || 'mes',
      salaryLabel: salaryLabel(r.salary_min || 0, r.salary_max || 0, r.salary_period, r.salary),
      skills: jparse(r.skills, []), gig: !!r.gig, startDate: r.start_date || '', duration: r.duration || '',
      sourceKind: r.source_kind || 'propio', sourceName: r.source_name || '',
      ...((files) => ({ flyers: files.map(media), flyerFiles: files, flyer: media(files[0]) || null, flyerFile: files[0] || null }))(
        jparse(r.flyers, []).length ? jparse(r.flyers, []) : (r.flyer_file ? [r.flyer_file] : [])),
      createdAt: r.created_at, publishedAt: r.published_at,
      /* sello "Cosecha": aviso de cosecha (Agricultura o changa) de una empresa con el Pack Cosecha vigente */
      cosecha: r.company_cosecha_until != null && r.company_cosecha_until > now() && isCosechaJob(r),
    };
  }

  /**
   * Búsqueda pública. Sólo ofertas aprobadas y no vencidas.
   */
  searchJobs({ q = '', locality = '', category = '', type = '', modality = '', sort = 'recent', page = 1, limit = 9,
    withSalary = false, gig = '', cosecha = '' } = {}) {
    const where = [`j.status='approved'`, `(j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours'))`];
    const args = [];
    if (q) {
      where.push(matchAny(['j.title', 'j.description', 'j.requirements', 'c.name']));
      const like = likeFold(q);
      args.push(like, like, like, like);
    }
    /* una localidad o varias (preferencias de la persona) */
    const locs = (Array.isArray(locality) ? locality : [locality]).filter(Boolean);
    if (locs.length) { where.push(`j.locality IN (${locs.map(() => '?').join(',')})`); args.push(...locs); }
    if (category) { where.push('j.category=?'); args.push(category); }
    if (type) { where.push('j.type=?'); args.push(type); }
    if (modality) { where.push('j.modality=?'); args.push(modality); }
    if (withSalary) where.push('j.salary_min>0');
    if (gig === '1' || gig === '0') where.push(`j.gig=${gig}`);
    if (cosecha === '1') where.push(COSECHA_SQL);
    const order = sort === 'old' ? 'j.published_at ASC'
      : sort === 'salary' ? "j.salary_min * (CASE j.salary_period WHEN 'día' THEN 22 WHEN 'hora' THEN 160 ELSE 1 END) DESC, j.published_at DESC"
        : sort === 'flyer' ? `${featuredSql()} DESC, (CASE WHEN j.flyers IS NOT NULL AND j.flyers NOT IN ('', '[]') THEN 0 ELSE 1 END), j.published_at DESC`
          : `${featuredSql()} DESC, j.published_at DESC`;
    const total = this.one(`SELECT COUNT(*) AS n FROM jobs j JOIN companies c ON c.id=j.company_id WHERE ${where.join(' AND ')}`, ...args).n;
    const pages = Math.max(1, Math.ceil(total / limit));
    const p = Math.min(Math.max(1, Number(page) || 1), pages);
    const rows = this.all(`SELECT j.*, c.name AS company_name, c.website AS company_website, c.description AS company_description,
      c.verified AS company_verified, c.cosecha_until AS company_cosecha_until, c.logo_file AS company_logo, c.gallery AS company_gallery
      FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, (p - 1) * limit);
    return { jobs: rows.map((r) => this.rowToJob(r)), total, page: p, pages, limit };
  }

  companyJobs(companyId) {
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until,
      c.logo_file AS company_logo, c.gallery AS company_gallery,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id AND a.stage='nuevo') AS new_applications,
      (SELECT COALESCE(SUM(s.views),0) FROM job_views s WHERE s.job_id=j.id AND s.day>=?) AS views_week
      FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.company_id=? ORDER BY j.created_at DESC`, dayAR(-6), companyId)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications, newApplications: r.new_applications, viewsWeek: r.views_week }));
  }

  /**
   * Rendimiento de un aviso para su empresa: vistas y postulaciones por día (últimos `days` días, hora argentina),
   * qué porcentaje de las vistas termina en postulación y, si estuvo destacado, vistas por día destacado contra sin destacar.
   */
  jobPerformance(id, days = 14) {
    const j = this.one('SELECT id, views, featured, featured_from, featured_until, published_at, created_at FROM jobs WHERE id=?', id);
    if (!j) return null;
    const DAY = 86400000;
    const dayOf = (ts) => new Date(ts - 3 * 3600e3).toISOString().slice(0, 10);
    const first = dayAR(-(days - 1));
    const series = Array.from({ length: days }, (_, k) => ({ day: dayAR(k - (days - 1)), views: 0, featuredViews: 0, applications: 0 }));
    const byDay = new Map(series.map((s) => [s.day, s]));
    for (const r of this.all('SELECT day, featured, views FROM job_views WHERE job_id=? AND day>=?', id, first)) {
      const s = byDay.get(r.day); if (!s) continue;
      s.views += r.views; if (r.featured) s.featuredViews += r.views;
    }
    const since = Date.parse(`${first}T03:00:00Z`); // 00:00 en Argentina
    for (const r of this.all('SELECT created_at FROM applications WHERE job_id=? AND created_at>=?', id, since)) {
      const s = byDay.get(dayOf(r.created_at)); if (s) s.applications += 1;
    }
    const views = series.reduce((n, s) => n + s.views, 0);
    const applications = series.reduce((n, s) => n + s.applications, 0);
    /* destacado contra sin destacar, en toda la vida del aviso: vistas de cada tipo / días de cada tipo */
    let compare = null;
    const t = now();
    const start = j.published_at || j.created_at;
    if (j.featured_from != null && start) {
      /* sólo se conoce el último período destacado (featured_from/until): se comparan sus vistas
         contra las vistas sin destacar de toda la vida del aviso; el período queda dentro de lo publicado */
      const fFrom = Math.min(Math.max(j.featured_from, start), t);
      const fTo = Math.max(fFrom, j.featured_until != null ? Math.min(j.featured_until, t) : t);
      const fDays = (fTo - fFrom) / DAY;
      const nDays = Math.max(0, (t - start) / DAY - fDays);
      const v = this.one(`SELECT COALESCE(SUM(CASE WHEN featured=1 AND day>=? THEN views END),0) AS f, COALESCE(SUM(CASE WHEN featured=0 THEN views END),0) AS n
        FROM job_views WHERE job_id=?`, dayOf(fFrom), id);
      if (fDays >= 1 && nDays >= 1) {
        const f = Math.round((v.f / fDays) * 10) / 10; const n = Math.round((v.n / nDays) * 10) / 10;
        compare = { featuredPerDay: f, normalPerDay: n, ratio: n > 0 ? Math.round((f / n) * 10) / 10 : null };
      }
    }
    return {
      days, series, views, applications, totalViews: j.views || 0,
      /* con pocas vistas el porcentaje engaña: se muestra desde 20 vistas */
      conversion: views >= 20 ? Math.round((applications / views) * 1000) / 10 : null,
      compare,
    };
  }

  allJobs({ status = '' } = {}) {
    const where = status ? 'WHERE j.status=?' : '';
    const args = status ? [status] : [];
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until,
      c.logo_file AS company_logo, c.gallery AS company_gallery,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications
      FROM jobs j JOIN companies c ON c.id=j.company_id ${where} ORDER BY j.created_at DESC`, ...args)
      .map((r) => ({ ...this.rowToJob(r), applications: r.applications }));
  }

  publicJobsForCompany(companyId) {
    return this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until,
      c.logo_file AS company_logo, c.gallery AS company_gallery
      FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE j.company_id=? AND j.status='approved' AND (j.closes_at IS NULL OR j.closes_at='' OR j.closes_at>=date('now','-3 hours'))
      ORDER BY ${featuredSql()} DESC, j.published_at DESC`, companyId).map((r) => this.rowToJob(r));
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
    if (q) { where.push(matchAny(['a.name', 'a.email', 'a.phone'])); const l = likeFold(q); args.push(l, l, l); }
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
  /* ---------------- notificaciones en el celular ---------------- */
  /** Guarda (o mueve a esta cuenta) la suscripción de un celular. Máximo 10 por cuenta: se borran las más viejas. */
  addPushSub(ownerType, ownerId, { endpoint, p256dh, auth }) {
    this.tx(() => {
      this.run('DELETE FROM push_subs WHERE endpoint=?', endpoint);
      this.run('INSERT INTO push_subs(endpoint,owner_type,owner_id,p256dh,auth,created_at) VALUES(?,?,?,?,?,?)', endpoint, ownerType, ownerId, p256dh, auth, now());
      this.run(`DELETE FROM push_subs WHERE owner_type=? AND owner_id=? AND endpoint NOT IN
        (SELECT endpoint FROM push_subs WHERE owner_type=? AND owner_id=? ORDER BY created_at DESC LIMIT 10)`, ownerType, ownerId, ownerType, ownerId);
    });
  }
  pushSubs(ownerType, ownerId) {
    return this.all('SELECT endpoint, p256dh, auth FROM push_subs WHERE owner_type=? AND owner_id=?', ownerType, ownerId);
  }
  hasPushSub(ownerType, ownerId, endpoint) {
    return !!this.one('SELECT 1 AS x FROM push_subs WHERE owner_type=? AND owner_id=? AND endpoint=?', ownerType, ownerId, endpoint);
  }
  deletePushSub(endpoint, ownerType, ownerId) {
    if (ownerType) this.run('DELETE FROM push_subs WHERE endpoint=? AND owner_type=? AND owner_id=?', endpoint, ownerType, ownerId);
    else this.run('DELETE FROM push_subs WHERE endpoint=?', endpoint);
  }
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
    return this.all("SELECT label, created_at FROM import_blocklist WHERE kind='name' ORDER BY created_at DESC")
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
      jobs: this.all(`SELECT j.id, j.title, j.status, j.closes_at, j.source_name, j.source_text, j.contact_email, j.published_at, j.imported_at, j.created_at,
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
    /* atómico: si otro pedido ya la reclamó, no cambia nada y devuelve null */
    const r = this.run('UPDATE companies SET email=?, password=?, claimed=1, claim_token=NULL WHERE id=? AND claimed=0', email, password, id);
    if (r.changes !== 1) return null;
    /* desde ahora los avisos son de la empresa: dejan de mostrarse como "Tomado de…" (el canal de origen queda guardado) */
    this.run("UPDATE jobs SET source_kind='propio' WHERE company_id=? AND source_kind='importado'", id);
    return this.company(id);
  }
  /** Registra que la empresa aceptó o borró su aviso importado (antes de borrarla, para que quede el historial). */
  recordImportResponse({ company, action, reason = null, comment = '', jobTitles = null }) {
    const jobs = jobTitles || this.all('SELECT title FROM jobs WHERE company_id=? ORDER BY created_at', company.id).map((r) => r.title);
    const id = uid('r');
    this.run(`INSERT INTO import_responses(id,company_id,name,phone_norm,action,reason,comment,jobs,applications,notified,notified_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, company.id, company.name, company.phone_norm || '', action,
    reason, String(comment || '').slice(0, 300), JSON.stringify(jobs), this.countApplicantsOf(company.id),
    company.notify_status === 'avisado' ? 1 : 0, company.notified_at || null, now());
    return this.one('SELECT * FROM import_responses WHERE id=?', id);
  }
  rowToImportResponse(r) {
    return {
      id: r.id, companyId: r.company_id, name: r.name, action: r.action, reason: r.reason || null,
      reasonLabel: r.reason ? (IMPORT_REASONS[r.reason] || r.reason) : '', comment: r.comment || '',
      jobs: jparse(r.jobs, []), applications: r.applications || 0, notified: !!r.notified, notifiedAt: r.notified_at || null,
      createdAt: r.created_at,
    };
  }
  importResponses({ since = 0 } = {}) {
    return this.all('SELECT * FROM import_responses WHERE created_at>? ORDER BY created_at DESC, rowid DESC LIMIT 500', since)
      .map((r) => this.rowToImportResponse(r));
  }
  /* opp: si el mensaje se escribió en modo "gran oportunidad" (así se sabe si quedó viejo) */
  setClaimMessage(id, text, opp = false) {
    return this.run('UPDATE companies SET claim_msg=?, claim_msg_opp=? WHERE id=? AND imported=1 AND claimed=0', text == null ? null : String(text), opp ? 1 : 0, id).changes > 0;
  }
  /* ---------------- empresas para contactar ---------------- */
  prospectKey(name, locality) { return `${normName(name)}|${normName(locality || '')}`; }
  /** Agrega una empresa; null si ya está (mismo teléfono, o mismo nombre en la misma localidad). */
  insertProspect(p) {
    const key = this.prospectKey(p.name, p.locality);
    const dup = this.one('SELECT id FROM prospects WHERE name_key=? OR (phone_norm<>\'\' AND phone_norm=?)', key, p.phoneNorm || '-');
    if (dup) return null;
    const id = uid('p'); const t = now();
    this.run(`INSERT INTO prospects(id,name,name_key,category,locality,web,instagram,email,phone,phone_norm,source_url,notes,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pendiente',?,?)`, id, p.name, key, p.category || '', p.locality || '', p.web || '', p.instagram || '',
    p.email || '', p.phone || '', p.phoneNorm || '', p.sourceUrl || '', p.notes || '', t, t);
    return this.prospect(id);
  }
  prospect(id) { return this.one('SELECT * FROM prospects WHERE id=?', String(id || '')); }
  prospects() { return this.all('SELECT * FROM prospects ORDER BY created_at DESC, rowid DESC'); }
  updateProspect(id, patch) {
    const cols = { status: 'status', notes: 'notes', message: 'message' };
    const sets = []; const args = [];
    for (const [k, col] of Object.entries(cols)) if (k in patch) { sets.push(`${col}=?`); args.push(patch[k]); }
    if (!sets.length) return this.prospect(id);
    this.run(`UPDATE prospects SET ${sets.join(', ')}, updated_at=? WHERE id=?`, ...args, now(), id);
    return this.prospect(id);
  }
  markProspectContacted(id, kind) {
    const t = now();
    if (kind === 'recordatorio') this.run("UPDATE prospects SET status='recordatorio', reminded_at=?, updated_at=? WHERE id=?", t, t, id);
    else this.run("UPDATE prospects SET status='contactada', contacted_at=COALESCE(contacted_at, ?), updated_at=? WHERE id=?", t, t, id);
    return this.prospect(id);
  }
  deleteProspect(id) { return this.run('DELETE FROM prospects WHERE id=?', id).changes > 0; }

  /* ---------- Changas de vecinos ---------- */
  /* "open" = aprobado, sin resolver y sin vencer; el vencimiento se calcula al leer (no hace falta barrer) */
  rowToRequest(r) {
    if (!r) return null;
    const t = now();
    const state = r.status === 'approved' && r.expires_at && r.expires_at <= t ? 'expired' : r.status;
    return {
      id: r.id, candidateId: r.candidate_id, title: r.title, description: r.description || '', category: r.category,
      locality: r.locality, area: r.area || '', whenDate: r.when_date || '', whenNote: r.when_note || '',
      pay: r.pay || 0, payUnit: r.pay_unit || 'trabajo', status: state, rejectReason: r.reject_reason || '',
      createdAt: r.created_at, approvedAt: r.approved_at || null, expiresAt: r.expires_at || null, resolvedAt: r.resolved_at || null,
      interestCount: r.interest_count != null ? r.interest_count : undefined,
      ownerName: r.owner_name != null ? r.owner_name : undefined,
    };
  }
  insertRequest(candidateId, v) {
    const id = uid('r');
    this.run(`INSERT INTO requests(id,candidate_id,title,description,category,locality,area,when_date,when_note,pay,pay_unit,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?)`, id, candidateId, v.title, v.description, v.category, v.locality, v.area,
    v.whenDate, v.whenNote, v.pay, v.payUnit, now());
    return this.request(id);
  }
  request(id) {
    return this.rowToRequest(this.one(`SELECT r.*, c.name AS owner_name,
      (SELECT COUNT(*) FROM request_interest i WHERE i.request_id=r.id) AS interest_count
      FROM requests r JOIN candidates c ON c.id=r.candidate_id WHERE r.id=?`, id));
  }
  /** Pedidos visibles para todos: aprobados, sin resolver y sin vencer. */
  openRequests({ locality = '', category = '' } = {}) {
    const where = ["r.status='approved'", 'r.expires_at>?'];
    const args = [now()];
    if (locality) { where.push('r.locality=?'); args.push(locality); }
    if (category) { where.push('r.category=?'); args.push(category); }
    return this.all(`SELECT r.*, c.name AS owner_name,
      (SELECT COUNT(*) FROM request_interest i WHERE i.request_id=r.id) AS interest_count
      FROM requests r JOIN candidates c ON c.id=r.candidate_id WHERE ${where.join(' AND ')}
      ORDER BY r.approved_at DESC LIMIT 100`, ...args).map((r) => this.rowToRequest(r));
  }
  requestsOf(candidateId) {
    return this.all(`SELECT r.*, (SELECT COUNT(*) FROM request_interest i WHERE i.request_id=r.id) AS interest_count
      FROM requests r WHERE r.candidate_id=? ORDER BY r.created_at DESC`, candidateId).map((r) => this.rowToRequest(r));
  }
  /** Pedidos todavía vigentes de una persona (para el tope por persona). */
  openRequestCount(candidateId) {
    return this.one(`SELECT COUNT(*) AS n FROM requests WHERE candidate_id=? AND
      (status='pending' OR (status='approved' AND expires_at>?))`, candidateId, now()).n;
  }
  adminRequests(status = '') {
    const rows = this.all(`SELECT r.*, c.name AS owner_name, c.email AS owner_email,
      (SELECT COUNT(*) FROM request_interest i WHERE i.request_id=r.id) AS interest_count
      FROM requests r JOIN candidates c ON c.id=r.candidate_id ORDER BY (r.status='pending') DESC, r.created_at DESC LIMIT 300`);
    const list = rows.map((r) => ({ ...this.rowToRequest(r), ownerEmail: r.owner_email }));
    return status ? list.filter((r) => r.status === status) : list;
  }
  pendingRequestCount() { return this.one("SELECT COUNT(*) AS n FROM requests WHERE status='pending'").n; }
  setRequestStatus(id, status, { ttlMs = 0, reason = '' } = {}) {
    const t = now();
    if (status === 'approved') this.run("UPDATE requests SET status='approved', approved_at=?, expires_at=?, reject_reason=NULL WHERE id=?", t, t + ttlMs, id);
    else if (status === 'rejected') this.run("UPDATE requests SET status='rejected', reject_reason=? WHERE id=?", reason, id);
    else if (status === 'resolved') this.run("UPDATE requests SET status='resolved', resolved_at=? WHERE id=?", t, id);
    return this.request(id);
  }
  deleteRequest(id) { return this.run('DELETE FROM requests WHERE id=?', id).changes > 0; }
  addInterest(requestId, candidateId, message) {
    const r = this.run(`INSERT OR IGNORE INTO request_interest(id,request_id,candidate_id,message,chosen,created_at)
      VALUES(?,?,?,?,0,?)`, uid('ri'), requestId, candidateId, message, now());
    return r.changes > 0;
  }
  removeInterest(requestId, candidateId) {
    return this.run('DELETE FROM request_interest WHERE request_id=? AND candidate_id=?', requestId, candidateId).changes > 0;
  }
  interestOf(requestId, candidateId) {
    const r = this.one('SELECT * FROM request_interest WHERE request_id=? AND candidate_id=?', requestId, candidateId);
    return r ? { message: r.message || '', chosen: !!r.chosen, createdAt: r.created_at } : null;
  }
  /** Interesados de un pedido, con su contacto: sólo para la persona que lo publicó. */
  interestedIn(requestId) {
    return this.all(`SELECT i.candidate_id, i.message, i.chosen, i.created_at, c.name, c.phone, c.locality, c.photo_file, c.public_slug, c.headline
      FROM request_interest i JOIN candidates c ON c.id=i.candidate_id WHERE i.request_id=? ORDER BY i.created_at`, requestId);
  }
  chooseInterest(requestId, candidateId) {
    /* sólo la primera vez cuenta (no se vuelve a avisar si ya estaba elegido) */
    return this.run('UPDATE request_interest SET chosen=1 WHERE request_id=? AND candidate_id=? AND chosen=0', requestId, candidateId).changes > 0;
  }
  /** Pedidos en los que una persona dijo "Me interesa". */
  interestsOf(candidateId) {
    return this.all(`SELECT r.*, i.chosen AS my_chosen, i.created_at AS my_at FROM request_interest i
      JOIN requests r ON r.id=i.request_id WHERE i.candidate_id=? ORDER BY i.created_at DESC`, candidateId)
      .map((r) => ({ ...this.rowToRequest(r), chosen: !!r.my_chosen, interestedAt: r.my_at }));
  }
  /* ---------- certificados de trabajo ---------- */
  rowToCertificate(r) {
    if (!r) return null;
    return {
      id: r.id, code: r.code, applicationId: r.application_id, candidateId: r.candidate_id, companyId: r.company_id, jobId: r.job_id,
      personName: r.person_name, companyName: r.company_name, position: r.position, locality: r.locality,
      startDate: r.start_date, endDate: r.end_date, comment: r.comment, commentStatus: r.comment_status,
      onProfile: !!r.on_profile, status: r.status, revokedBy: r.revoked_by || null, revokeReason: r.revoke_reason || '',
      issuedAt: r.issued_at, revokedAt: r.revoked_at || null,
    };
  }
  insertCertificate(c) {
    const id = uid('ce');
    for (let i = 0; ; i++) {
      const code = newCertCode();
      try {
        this.run(`INSERT INTO certificates(id,code,application_id,candidate_id,company_id,job_id,person_name,company_name,position,locality,
          start_date,end_date,comment,comment_status,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, code, c.applicationId || null, c.candidateId, c.companyId || null, c.jobId || null, c.personName, c.companyName,
        c.position, c.locality || '', c.startDate, c.endDate, c.comment || '', c.comment ? 'pending' : 'none', now());
        return this.certificate(id);
      } catch (e) {
        if (/application_id/.test(e.message)) return null; // ya hay uno vigente para esa postulación
        if (i >= 5 || !/UNIQUE/i.test(e.message)) throw e; // código repetido: se prueba otro
      }
    }
  }
  certificate(id) { return this.rowToCertificate(this.one('SELECT * FROM certificates WHERE id=?', id)); }
  certificateByCode(code) { return this.rowToCertificate(this.one('SELECT * FROM certificates WHERE code=?', String(code || ''))); }
  certificatesForApplication(applicationId) {
    return this.all('SELECT * FROM certificates WHERE application_id=? ORDER BY issued_at DESC, rowid DESC', applicationId).map((r) => this.rowToCertificate(r));
  }
  certificatesOfCandidate(candidateId) {
    return this.all('SELECT * FROM certificates WHERE candidate_id=? ORDER BY issued_at DESC, rowid DESC', candidateId).map((r) => this.rowToCertificate(r));
  }
  certificatesOfCompany(companyId) {
    return this.all('SELECT * FROM certificates WHERE company_id=? ORDER BY issued_at DESC, rowid DESC', companyId).map((r) => this.rowToCertificate(r));
  }
  publicCertificatesOf(candidateId) {
    return this.all("SELECT * FROM certificates WHERE candidate_id=? AND status='valid' AND on_profile=1 ORDER BY end_date DESC", candidateId).map((r) => this.rowToCertificate(r));
  }
  adminCertificates({ q = '' } = {}) {
    const like = likeFold(String(q).trim());
    return this.all(`SELECT * FROM certificates WHERE ?='%%' OR fold(person_name) LIKE ? ESCAPE '\\' OR fold(company_name) LIKE ? ESCAPE '\\' OR fold(position) LIKE ? ESCAPE '\\' OR fold(code) LIKE ? ESCAPE '\\'
      ORDER BY issued_at DESC, rowid DESC LIMIT 200`, like, like, like, like, like).map((r) => this.rowToCertificate(r));
  }
  revokeCertificate(id, by, reason = '') {
    const ok = this.run("UPDATE certificates SET status='revoked', revoked_by=?, revoke_reason=?, revoked_at=? WHERE id=? AND status='valid'",
      by === 'admin' ? 'admin' : 'company', String(reason || ''), now(), id).changes > 0;
    return ok ? this.certificate(id) : null;
  }
  setCertificateComment(id, status) {
    this.run("UPDATE certificates SET comment_status=? WHERE id=? AND comment_status<>'none'", status === 'shown' ? 'shown' : 'hidden', id);
    return this.certificate(id);
  }
  setCertificateOnProfile(id, on) {
    this.run('UPDATE certificates SET on_profile=? WHERE id=?', on ? 1 : 0, id);
    return this.certificate(id);
  }
  /** Contactos (primer mensaje o recordatorio) hechos desde las 00:00 de hoy, hora argentina. */
  prospectsContactedSince(ts) {
    return this.one('SELECT (SELECT COUNT(*) FROM prospects WHERE contacted_at>=?) + (SELECT COUNT(*) FROM prospects WHERE reminded_at>=?) AS n', ts, ts).n;
  }
  /** Empresas registradas en WorkUco con ese mail o teléfono (para marcar "se registró"). */
  registeredCompanyKeys() {
    const rows = this.all("SELECT lower(email) AS email, phone, phone_norm FROM companies WHERE (claimed IS NULL OR claimed<>0)");
    return { emails: new Set(rows.map((r) => r.email)), phones: new Set(rows.map((r) => r.phone_norm || normPhone(r.phone || '')).filter(Boolean)) };
  }
  markNotified(id, kind = '') {
    const t = now();
    return this.run(`UPDATE companies SET notify_status='avisado', notified_at=?${kind === 'oportunidad' ? ', opp_notified_at=?' : ''} WHERE id=? AND imported=1 AND claimed=0`,
      ...(kind === 'oportunidad' ? [t, t, id] : [t, id])).changes > 0;
  }
  /** Avisos importados sin reclamar publicados antes de cutoff (para borrarlos solos). */
  importJobsExpired(cutoff) {
    return this.all(`SELECT j.id, j.title, j.company_id FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE c.imported=1 AND c.claimed=0 AND COALESCE(j.imported_at, j.published_at, j.created_at) < ?`, cutoff);
  }
  /* ---------------- contraseñas y preferencias de cuenta ---------------- */
  accountTable(role) { return role === 'candidate' ? 'candidates' : role === 'company' ? 'companies' : null; }
  setPassword(role, id, hash) {
    const t = this.accountTable(role);
    return t ? this.run(`UPDATE ${t} SET password=? WHERE id=?`, hash, id).changes > 0 : false;
  }
  /* ---------------- "Avisar al celular" (extra para empresas) ---------------- */
  setPushJobs(candidateId, on) { this.run('UPDATE candidates SET push_jobs=? WHERE id=?', on ? 1 : 0, candidateId); }
  /** Personas a las que les sirve este aviso y lo pidieron: avisos de empleo activados, un celular activo,
   *  la localidad del aviso entre las suyas (o la suya, si no eligió) y el tipo de trabajo que busca.
   *  capped: las que ya recibieron uno de estos en las últimas 24 h (no se les manda otro). */
  pushJobsAudience(job, at = now()) {
    const rows = this.all(`SELECT id, locality, pref_localities, pref_types, pref_gigs, push_jobs_last FROM candidates c
      WHERE push_jobs=1 AND EXISTS (SELECT 1 FROM push_subs s WHERE s.owner_type='candidate' AND s.owner_id=c.id)`);
    const fits = rows.filter((r) => {
      const locs = jparse(r.pref_localities, []); const types = jparse(r.pref_types, []);
      const zone = locs.length ? locs.includes(job.locality) : !!r.locality && r.locality === job.locality;
      return zone && (!types.length || types.includes(job.type)) && !(job.gig && r.pref_gigs === 0);
    });
    const day = at - 86400000;
    return { all: fits.map((r) => r.id), ready: fits.filter((r) => !r.push_jobs_last || r.push_jobs_last <= day).map((r) => r.id) };
  }
  /** Marca el aviso como enviado una sola vez (devuelve false si ya se había mandado). */
  claimJobPush(jobId) { return this.run('UPDATE jobs SET push_sent_at=? WHERE id=? AND push_sent_at IS NULL', now(), jobId).changes === 1; }
  finishJobPush(jobId, candidateIds) {
    this.tx(() => {
      for (const id of candidateIds) this.run('UPDATE candidates SET push_jobs_last=? WHERE id=?', now(), id);
      this.run('UPDATE jobs SET push_sent_count=? WHERE id=?', candidateIds.length, jobId);
    });
  }
  setCandidatePrefs(id, { localities, types, modalities, gigs } = {}) {
    if (localities) this.run('UPDATE candidates SET pref_localities=? WHERE id=?', JSON.stringify(localities), id);
    if (types) this.run('UPDATE candidates SET pref_types=? WHERE id=?', JSON.stringify(types), id);
    if (modalities) this.run('UPDATE candidates SET pref_modalities=? WHERE id=?', JSON.stringify(modalities), id);
    if (typeof gigs === 'boolean') this.run('UPDATE candidates SET pref_gigs=? WHERE id=?', gigs ? 1 : 0, id);
  }
  setMailPrefs(role, id, prefs) {
    const t = this.accountTable(role);
    if (t) this.run(`UPDATE ${t} SET mail_prefs=?, mail_opt_out=0 WHERE id=?`, JSON.stringify(prefs), id);
  }
  setMailOptOut(role, id, off) {
    const t = this.accountTable(role);
    if (t) this.run(`UPDATE ${t} SET mail_opt_out=? WHERE id=?`, off ? 1 : 0, id);
  }
  deleteSessionsFor(role, id, exceptToken = '') {
    const col = role === 'candidate' ? 'candidate_id' : 'company_id';
    this.run(`DELETE FROM sessions WHERE role=? AND ${col}=? AND token<>?`, role, id, exceptToken);
  }
  createReset(role, accountId, tokenHash, ttlMs) {
    this.run('DELETE FROM password_resets WHERE expires<?', now());
    this.run('INSERT INTO password_resets(token_hash,role,account_id,expires,used,created_at) VALUES(?,?,?,?,0,?)',
      tokenHash, role, accountId, now() + ttlMs, now());
  }
  recentResets(role, accountId, sinceMs) {
    return this.one('SELECT COUNT(*) AS n FROM password_resets WHERE role=? AND account_id=? AND created_at>?', role, accountId, now() - sinceMs).n;
  }
  /* Usa el código una sola vez (atómico): devuelve {role, account_id} o null. Invalida los demás códigos de la cuenta. */
  consumeReset(tokenHash) {
    const r = this.one('SELECT role, account_id FROM password_resets WHERE token_hash=? AND used=0 AND expires>?', tokenHash, now());
    if (!r) return null;
    if (this.run('UPDATE password_resets SET used=1 WHERE token_hash=? AND used=0', tokenHash).changes === 0) return null;
    this.run('UPDATE password_resets SET used=1 WHERE role=? AND account_id=?', r.role, r.account_id);
    return r;
  }
  acceptTerms(table, id, version) {
    if (!['candidates', 'companies'].includes(table)) return;
    this.run(`UPDATE ${table} SET terms_at=?, terms_version=? WHERE id=?`, now(), version, id);
  }
  /* Archivos subidos que hay que borrar del disco al dar de baja una empresa. */
  companyFiles(id) {
    const c = this.company(id);
    if (!c) return [];
    const files = [c.logo_file, ...jparse(c.gallery, [])];
    for (const j of this.all('SELECT flyer_file, flyers FROM jobs WHERE company_id=?', id)) files.push(j.flyer_file, ...jparse(j.flyers, []));
    /* CV de postulaciones de invitados (sin perfil): sólo existían para esta empresa */
    for (const a of this.all('SELECT a.cv_file FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? AND a.candidate_id IS NULL', id)) files.push(a.cv_file);
    for (const p of this.placesOf('company', id)) files.push(...p.photoFiles);
    return [...new Set(files.filter((f) => f && !/^https?:|^\//.test(f)))];
  }
  /* Baja de una persona (Ley 25.326 art. 16, supresión): borra su cuenta, postulaciones
     (también las que hizo sin cuenta con el mismo email), alertas, guardados e invitaciones.
     Devuelve los archivos a borrar del disco. */
  deleteCandidateCascade(id) {
    const c = this.candidate(id);
    if (!c) return null;
    const apps = this.all(`SELECT a.cv_file, a.name, j.company_id, j.title FROM applications a LEFT JOIN jobs j ON j.id=a.job_id
      WHERE a.candidate_id=? OR lower(a.email)=lower(?)`, id, c.email);
    const placeFiles = this.placesOf('candidate', id).flatMap((p) => p.photoFiles);
    const files = [c.photo_file, c.cv_file, ...apps.map((a) => a.cv_file), ...placeFiles].filter(Boolean);
    this.tx(() => {
      this.run("DELETE FROM place_stats WHERE place_id IN (SELECT id FROM places WHERE owner_type='candidate' AND owner_id=?)", id);
      this.run("DELETE FROM places WHERE owner_type='candidate' AND owner_id=?", id);
      /* el aviso "Nueva postulación: <nombre>" que recibió cada empresa también lleva su nombre */
      for (const a of apps) {
        if (!a.company_id) continue;
        this.run("DELETE FROM notifications WHERE recipient_type='company' AND recipient_id=? AND kind='postulacion' AND title=? AND body=?",
          a.company_id, `Nueva postulación: ${a.name}`, a.title);
      }
      this.run('DELETE FROM applications WHERE candidate_id=? OR lower(email)=lower(?)', id, c.email);
      for (const t of ['saved_jobs', 'alerts', 'invitations', 'sessions']) this.run(`DELETE FROM ${t} WHERE candidate_id=?`, id);
      /* Changas de vecinos: sus pedidos (con los interesados) y sus "Me interesa" en pedidos de otros */
      this.run('DELETE FROM request_interest WHERE candidate_id=? OR request_id IN (SELECT id FROM requests WHERE candidate_id=?)', id, id);
      this.run('DELETE FROM requests WHERE candidate_id=?', id);
      this.run('DELETE FROM certificates WHERE candidate_id=?', id);
      this.run("DELETE FROM notifications WHERE recipient_type='candidate' AND recipient_id=?", id);
      this.run("DELETE FROM push_subs WHERE owner_type='candidate' AND owner_id=?", id);
      this.run("DELETE FROM password_resets WHERE role='candidate' AND account_id=?", id);
      this.run('DELETE FROM cv_orders WHERE candidate_id=?', id);
      /* el registro contable del pago queda, pero sin el vínculo con la persona */
      this.run("UPDATE payments SET company_id='cuenta-borrada', ref_id=NULL WHERE kind='cv' AND company_id=?", id);
      this.run('DELETE FROM candidates WHERE id=?', id);
    });
    return [...new Set(files)];
  }
  deleteCompanyCascade(id) {
    this.tx(() => {
      for (const j of this.all('SELECT id FROM jobs WHERE company_id=?', id)) this.removeJob(j.id);
      this.run('DELETE FROM invitations WHERE company_id=?', id);
      this.run("DELETE FROM notifications WHERE recipient_type='company' AND recipient_id=?", id);
      this.run("DELETE FROM push_subs WHERE owner_type='company' AND owner_id=?", id);
      this.run('DELETE FROM sessions WHERE company_id=?', id);
      this.run("DELETE FROM password_resets WHERE role='company' AND account_id=?", id);
      this.run("DELETE FROM place_stats WHERE place_id IN (SELECT id FROM places WHERE owner_type='company' AND owner_id=?)", id);
      this.run("DELETE FROM places WHERE owner_type='company' AND owner_id=?", id);
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

  /* sueldo de referencia para el que publica: mediana de los avisos aprobados del último año del mismo rubro
     y período, sólo si hay al menos 3 (con menos, un aviso solo marcaría "el precio del Valle") */
  salaryHint(category, period) {
    const since = Date.now() - 365 * 86400000;
    const rows = this.all(`SELECT salary_min AS lo, CASE WHEN salary_max>salary_min THEN salary_max ELSE salary_min END AS hi
      FROM jobs WHERE status='approved' AND category=? AND salary_period=? AND salary_min>0 AND created_at>=?`, category, period, since);
    if (rows.length < 3) return null;
    const med = (xs) => { const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
    return { min: med(rows.map((r) => r.lo)), max: med(rows.map((r) => r.hi)), count: rows.length };
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

  /* ---------------- guía ---------------- */
  rowToPlace(r) {
    if (!r) return null;
    const files = jparse(r.photos, []);
    const fu = r.featured_until;
    return {
      id: r.id, slug: r.slug, ownerType: r.owner_type || null, ownerId: r.owner_id || null,
      section: r.section, category: r.category, name: r.name, description: r.description || '',
      localities: jparse(r.localities, []), address: r.address || '', homeService: !!r.home_service,
      whatsapp: r.whatsapp || '', phone: r.phone || '', instagram: r.instagram || '', website: r.website || '',
      hours: parseObject(r.hours), photos: files.map(media), photoFiles: files,
      status: r.status, rejectReason: r.reject_reason || '',
      featured: fu === 0 || (fu != null && fu > now()), featuredUntil: fu == null ? null : fu,
      imported: !!r.imported, claimed: !!r.owner_id, claimToken: r.claim_token || null,
      consentBy: r.consent_by || '', consentAt: r.consent_at || null,
      createdAt: r.created_at, updatedAt: r.updated_at, approvedAt: r.approved_at || null,
    };
  }
  uniquePlaceSlug(name, exceptId = '') {
    const root = slugify(name) || 'ficha';
    for (let i = 1; ; i++) {
      const slug = i === 1 ? root : `${root}-${i}`;
      if (!this.one('SELECT 1 AS x FROM places WHERE slug=? AND id<>?', slug, exceptId)) return slug;
    }
  }
  insertPlace(p) {
    const id = uid('p');
    const t = now();
    const status = p.status || 'pending';
    this.run(`INSERT INTO places(id,slug,owner_type,owner_id,section,category,name,name_norm,description,localities,address,
      home_service,whatsapp,phone,phone_norm,instagram,website,hours,photos,status,featured_until,imported,claim_token,
      consent_by,consent_at,created_at,updated_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, this.uniquePlaceSlug(p.name), p.ownerType || null, p.ownerId || null, p.section, p.category, p.name, normName(p.name),
    p.description || '', JSON.stringify(p.localities || []), p.address || '', p.homeService ? 1 : 0,
    p.whatsapp || '', p.phone || '', placePhoneNorm(p), p.instagram || '', p.website || '',
    p.hours ? JSON.stringify(p.hours) : null, JSON.stringify(p.photoFiles || []), status,
    p.featuredUntil == null ? null : p.featuredUntil, p.imported ? 1 : 0, p.claimToken || null,
    p.consentBy || null, p.consentAt || null, t, t, status === 'approved' ? t : null);
    return this.place(id);
  }
  updatePlace(id, patch) {
    const cur = this.place(id);
    if (!cur) return null;
    const n = { ...cur, ...patch };
    this.run(`UPDATE places SET section=?, category=?, name=?, name_norm=?, description=?, localities=?, address=?,
      home_service=?, whatsapp=?, phone=?, phone_norm=?, instagram=?, website=?, hours=?, photos=?, updated_at=?
      ${n.name !== cur.name ? ', slug=?' : ''} WHERE id=?`,
    n.section, n.category, n.name, normName(n.name), n.description || '', JSON.stringify(n.localities || []), n.address || '',
    n.homeService ? 1 : 0, n.whatsapp || '', n.phone || '', placePhoneNorm(n), n.instagram || '', n.website || '',
    n.hours ? JSON.stringify(n.hours) : null, JSON.stringify(n.photoFiles || []), Math.max(now(), (cur.updatedAt || 0) + 1),
    ...(n.name !== cur.name ? [this.uniquePlaceSlug(n.name, id)] : []), id);
    return this.place(id);
  }
  place(id) { return this.rowToPlace(this.one('SELECT * FROM places WHERE id=?', id)); }
  placeBySlug(slug) { return this.rowToPlace(this.one('SELECT * FROM places WHERE slug=?', slug)); }
  placesOf(ownerType, ownerId) {
    return this.all('SELECT * FROM places WHERE owner_type=? AND owner_id=? ORDER BY created_at DESC', ownerType, ownerId).map((r) => this.rowToPlace(r));
  }
  countPlacesOf(ownerType, ownerId) {
    return this.one('SELECT COUNT(*) AS n FROM places WHERE owner_type=? AND owner_id=?', ownerType, ownerId).n;
  }
  /* Sólo aprobadas. Orden: destacadas vigentes, después las actualizadas más recientemente. */
  searchPlaces({ section = '', category = '', locality = '', q = '', page = 1, limit = 12 } = {}) {
    const where = ["status='approved'"];
    const args = [];
    if (section) { where.push('section=?'); args.push(section); }
    if (category) { where.push('category=?'); args.push(category); }
    if (locality) { where.push('localities LIKE ?'); args.push(`%"${locality}"%`); }
    if (q) {
      where.push(matchAny(['name', 'description', 'category']));
      const like = likeFold(q); args.push(like, like, like);
    }
    const w = where.join(' AND ');
    const total = this.one(`SELECT COUNT(*) AS n FROM places WHERE ${w}`, ...args).n;
    const pages = Math.max(1, Math.ceil(total / limit));
    const pg = Math.min(Math.max(1, page), pages);
    const rows = this.all(`SELECT * FROM places WHERE ${w}
      ORDER BY (CASE WHEN featured_until=0 OR featured_until>? THEN 0 ELSE 1 END), updated_at DESC
      LIMIT ? OFFSET ?`, ...args, now(), limit, (pg - 1) * limit);
    return { places: rows.map((r) => this.rowToPlace(r)), total, pages, page: pg };
  }
  allPlaces({ status = '' } = {}) {
    const rows = status
      ? this.all('SELECT * FROM places WHERE status=? ORDER BY updated_at DESC', status)
      : this.all('SELECT * FROM places ORDER BY updated_at DESC');
    return rows.map((r) => this.rowToPlace(r));
  }
  setPlaceStatus(id, status, reason = null) {
    this.run(`UPDATE places SET status=?, reject_reason=?, approved_at=CASE WHEN ?='approved' THEN ? ELSE approved_at END WHERE id=?`,
      status, reason, status, now(), id);
    return this.place(id);
  }
  setPlaceFeatured(id, untilMs) {
    this.run('UPDATE places SET featured_until=? WHERE id=?', untilMs == null ? null : untilMs, id);
    return this.place(id);
  }
  bumpPlaceStat(id, kind) {
    if (!['views', 'whatsapp', 'calls', 'maps'].includes(kind)) return;
    const day = new Date(now() - 3 * 3600e3).toISOString().slice(0, 10);
    this.run(`INSERT INTO place_stats(place_id, day, ${kind}) VALUES(?,?,1)
      ON CONFLICT(place_id, day) DO UPDATE SET ${kind}=${kind}+1`, id, day);
  }
  placeStats(id) {
    const since = (days) => new Date(now() - 3 * 3600e3 - (days - 1) * 86400000).toISOString().slice(0, 10);
    const sum = (from) => {
      const r = this.one(`SELECT COALESCE(SUM(views),0) AS v, COALESCE(SUM(whatsapp+calls+maps),0) AS c
        FROM place_stats WHERE place_id=? AND day>=?`, id, from);
      return { views: r.v, contacts: r.c };
    };
    return { week: sum(since(7)), month: sum(since(30)) };
  }
  /* ---------------- gestión del admin ---------------- */
  adminMeta(key) { const r = this.one('SELECT value FROM admin_meta WHERE key=?', key); return r ? r.value : null; }
  setAdminMeta(key, value) {
    this.run('INSERT INTO admin_meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
  }
  /** Números de un aviso para el admin: vistas totales y de la semana, postulaciones. */
  jobAdminStats(id) {
    const r = this.one(`SELECT j.views,
      (SELECT COALESCE(SUM(s.views),0) FROM job_views s WHERE s.job_id=j.id AND s.day>=?) AS views_week,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applications,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id AND a.stage='nuevo') AS new_applications
      FROM jobs j WHERE j.id=?`, dayAR(-6), id);
    return r ? { views: r.views || 0, viewsWeek: r.views_week, applications: r.applications, newApplications: r.new_applications } : null;
  }
  /**
   * Bandeja "para revisar": lo pendiente siempre; lo nuevo ya publicado (fichas de usuarios, empresas) sólo
   * si llegó después de la última vez que el admin tocó "ya lo vi" (la primera vez, los últimos 14 días).
   */
  adminInbox() {
    const seen = Number(this.adminMeta('inbox_seen_at')) || now() - 14 * 86400000;
    const jobs = this.allJobs({ status: 'pending' });
    const places = this.all(`SELECT * FROM places WHERE status='pending'
      OR (owner_id IS NOT NULL AND status='approved' AND created_at>?) ORDER BY created_at DESC LIMIT 100`, seen).map((r) => this.rowToPlace(r));
    const companies = this.all(`SELECT id, name, email, phone, verified, created_at FROM companies
      WHERE created_at>? AND (claimed IS NULL OR claimed<>0) ORDER BY created_at DESC LIMIT 50`, seen);
    const featureRequests = this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until, c.logo_file AS company_logo,
      c.gallery AS company_gallery FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE j.featured_req_at IS NOT NULL ORDER BY j.featured_req_at`).map((r) => this.rowToJob(r));
    const importResponses = this.importResponses({ since: seen });
    return { jobs, places, companies, featureRequests, importResponses, seenAt: seen };
  }
  /** Personas para el admin: todas o sólo las disponibles, por localidad o texto. */
  adminCandidates({ q = '', locality = '', available = false } = {}) {
    const where = ['1=1'];
    const args = [];
    if (available) where.push('c.open_to_work=1');
    if (locality) { where.push('c.locality=?'); args.push(locality); }
    const text = String(q || '').trim().slice(0, 80);
    if (text) {
      const like = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(`(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.headline LIKE ? ESCAPE '\\' OR c.skills LIKE ? ESCAPE '\\')`);
      args.push(like, like, like, like);
    }
    const people = this.all(`SELECT c.*, (SELECT COUNT(*) FROM applications a WHERE a.candidate_id=c.id) AS applications
      FROM candidates c WHERE ${where.join(' AND ')} ORDER BY c.open_to_work DESC, c.created_at DESC LIMIT 300`, ...args);
    const counts = {
      total: this.one('SELECT COUNT(*) AS n FROM candidates').n,
      available: this.one('SELECT COUNT(*) AS n FROM candidates WHERE open_to_work=1').n,
    };
    return { people, counts };
  }

  /* ---------------- pagos (Mercado Pago) ---------------- */
  insertPayment({ companyId, jobId = null, jobTitle, days = 0, amount, kind = 'destacado', refId = null }) {
    const id = `wk${crypto.randomBytes(9).toString('hex')}`;
    this.run(`INSERT INTO payments(id, company_id, job_id, job_title, days, amount, status, created_at, kind, ref_id)
      VALUES(?,?,?,?,?,?, 'created', ?,?,?)`, id, companyId, jobId, jobTitle || '', days, amount, now(), kind, refId);
    return this.payment(id);
  }

  /* ---------------- CV Pro ---------------- */
  rowToCvOrder(r) {
    if (!r) return null;
    /* jparse sólo devuelve listas; acá las columnas guardan objetos */
    const jobj = (v, fb) => { try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : fb; } catch (_) { return fb; } };
    return {
      id: r.id, candidateId: r.candidate_id, status: r.status, sourceKind: r.source_kind, sourceText: r.source_text || '',
      analysis: jobj(r.analysis, null), inputs: jobj(r.inputs, {}), cv: jobj(r.cv, null),
      versions: r.versions, rewritesLeft: r.rewrites_left, price: r.price, paymentId: r.payment_id || '',
      createdAt: r.created_at, updatedAt: r.updated_at, paidAt: r.paid_at || null,
    };
  }
  insertCvOrder({ candidateId, sourceKind, sourceText, analysis, price }) {
    const id = `cv${crypto.randomBytes(8).toString('hex')}`;
    const t = now();
    this.run(`INSERT INTO cv_orders(id, candidate_id, status, source_kind, source_text, analysis, inputs, price, created_at, updated_at)
      VALUES(?,?, 'analizado', ?,?,?, '{}', ?,?,?)`, id, candidateId, sourceKind, sourceText || '', JSON.stringify(analysis), price, t, t);
    return this.cvOrder(id);
  }
  cvOrder(id) { return this.rowToCvOrder(this.one('SELECT * FROM cv_orders WHERE id=?', String(id || ''))); }
  cvOrdersOf(candidateId) {
    return this.all('SELECT * FROM cv_orders WHERE candidate_id=? ORDER BY created_at DESC', candidateId).map((r) => this.rowToCvOrder(r));
  }
  updateCvOrder(id, patch) {
    const cols = { status: 'status', inputs: 'inputs', cv: 'cv', versions: 'versions', rewritesLeft: 'rewrites_left', paymentId: 'payment_id', paidAt: 'paid_at' };
    const sets = []; const args = [];
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in patch)) continue;
      sets.push(`${col}=?`);
      args.push(k === 'inputs' || k === 'cv' ? JSON.stringify(patch[k]) : patch[k]);
    }
    if (sets.length) this.run(`UPDATE cv_orders SET ${sets.join(', ')}, updated_at=? WHERE id=?`, ...args, now(), id);
    return this.cvOrder(id);
  }
  /** Marca la orden como pagada una sola vez; devuelve true sólo la primera vez. */
  payCvOrder(id, paymentId) {
    return this.run("UPDATE cv_orders SET status='pagado', payment_id=?, paid_at=?, updated_at=? WHERE id=? AND status<>'pagado'",
      String(paymentId), now(), now(), id).changes > 0;
  }
  countCvAnalysesToday(candidateId) {
    /* día de Argentina (UTC-3) */
    const start = Date.parse(`${dayAR(0)}T00:00:00-03:00`);
    return this.one('SELECT COUNT(*) AS n FROM cv_orders WHERE candidate_id=? AND created_at>=?', candidateId, start).n;
  }
  payment(id) { return this.one('SELECT * FROM payments WHERE id=?', String(id || '')); }
  setPaymentPreference(id, prefId) { this.run('UPDATE payments SET mp_preference_id=? WHERE id=?', prefId, id); }
  /** Marca el pago como aprobado una sola vez; devuelve true sólo la primera vez. */
  approvePayment(id, mpPaymentId) {
    return this.run(`UPDATE payments SET status='approved', mp_payment_id=?, paid_at=? WHERE id=? AND status<>'approved'`,
      String(mpPaymentId), now(), id).changes > 0;
  }
  setPaymentStatus(id, status, mpPaymentId) {
    this.run(`UPDATE payments SET status=?, mp_payment_id=COALESCE(?, mp_payment_id) WHERE id=? AND status<>'approved'`,
      status, mpPaymentId == null ? null : String(mpPaymentId), id);
  }
  allPayments(limit = 200) {
    /* el nombre sale de la empresa (destacados) o de la persona (CV Pro) */
    return this.all(`SELECT p.*, COALESCE(c.name, k.name) AS company_name FROM payments p
      LEFT JOIN companies c ON c.id=p.company_id AND p.kind='destacado'
      LEFT JOIN candidates k ON k.id=p.company_id AND p.kind='cv'
      ORDER BY p.created_at DESC LIMIT ?`, limit);
  }
  paymentTotals() {
    return {
      approved: this.one("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status='approved'").n,
      count: this.one("SELECT COUNT(*) AS n FROM payments WHERE status='approved'").n,
    };
  }

  /** Buscador del admin: avisos (de cualquier estado), fichas de la Guía y empresas. */
  adminSearch(q, limit = 20) {
    const text = String(q || '').trim().slice(0, 80);
    if (text.length < 2) return { jobs: [], places: [], companies: [] };
    const like = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const jobs = this.all(`SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.cosecha_until AS company_cosecha_until, c.logo_file AS company_logo,
      c.gallery AS company_gallery FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE j.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\'
      ORDER BY j.created_at DESC LIMIT ?`, like, like, like, limit).map((r) => this.rowToJob(r));
    const places = this.all(`SELECT * FROM places WHERE name LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\'
      OR description LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`, like, like, like, limit).map((r) => this.rowToPlace(r));
    const companies = this.all(`SELECT id, name, email, phone, verified, created_at FROM companies
      WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`, like, like, limit);
    return { jobs, places, companies };
  }
  recentPlaceChanges(limit = 50) {
    return this.all(`SELECT * FROM places WHERE status='approved' AND approved_at IS NOT NULL AND updated_at>approved_at
      ORDER BY updated_at DESC LIMIT ?`, limit).map((r) => this.rowToPlace(r));
  }
  placeByClaimToken(token) {
    return this.rowToPlace(this.one('SELECT * FROM places WHERE claim_token=? AND owner_id IS NULL', token));
  }
  claimPlace(id, ownerType, ownerId) {
    const r = this.run(`UPDATE places SET owner_type=?, owner_id=?, claim_token=NULL, updated_at=?
      WHERE id=? AND owner_id IS NULL`, ownerType, ownerId, now(), id);
    return r.changes > 0 ? this.place(id) : null;
  }
  placeBlocked(phoneNorm, nameNorm) {
    return !!this.one(`SELECT 1 AS x FROM import_blocklist
      WHERE (kind='place_phone' AND value=? AND ?<>'') OR (kind='place_name' AND value=? AND ?<>'') LIMIT 1`,
    phoneNorm || '', phoneNorm || '', nameNorm || '', nameNorm || '');
  }
  addPlaceBlock(phoneNorm, nameNorm, label = '') {
    if (phoneNorm) this.addBlock('place_phone', phoneNorm, label);
    if (nameNorm) this.addBlock('place_name', nameNorm, label);
  }
  deletePlace(id) {
    const p = this.place(id);
    if (!p) return [];
    this.tx(() => {
      this.run('DELETE FROM place_stats WHERE place_id=?', id);
      this.run('DELETE FROM places WHERE id=?', id);
    });
    return p.photoFiles.filter((f) => f && !/^https?:|^\//.test(f));
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
  Store, uid, slugify, now, jparse, IMPORT_REASONS,
  LOCALITIES, CATEGORIES, TYPES, MODALITIES, BENEFITS, STAGES, STAGE_LABEL, SALARY_PERIODS, MONTH_FACTOR,
};
