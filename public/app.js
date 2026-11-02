/* Workuco — frontend compartido */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const state = { user: null, meta: null };

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  const min = Math.round(diff / 60000);
  if (min < 60) return min <= 1 ? 'Hace un momento' : `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return fmtDate(ts);
};

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    err.fields = data.fields || null;
    throw err;
  }
  return data;
}

function toast(msg, type = '') {
  let wrap = $('#toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.id = 'toasts';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function showAlert(container, msg, type = 'error') {
  if (!container) return;
  container.hidden = false;
  container.className = `alert alert-${type}`;
  container.textContent = msg;
}
function hideAlert(container) { if (container) { container.hidden = true; container.textContent = ''; } }

function setFieldErrors(form, fields) {
  $$('.error-text', form).forEach((el) => { el.hidden = true; el.textContent = ''; });
  $$('.input', form).forEach((el) => el.classList.remove('is-error'));
  if (!fields) return;
  for (const [name, msg] of Object.entries(fields)) {
    const err = $(`[data-error="${name}"]`, form);
    if (err) { err.hidden = false; err.textContent = msg; }
    const input = $(`[name="${name}"]`, form) || $(`#a-${name}`, form);
    if (input) input.classList.add('is-error');
  }
  const first = $('.is-error', form);
  if (first) first.focus();
}

/* ---------------- iconos ---------------- */
const ICONS = {
  Administración: '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z"/><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  Agricultura: '<path d="M12 21V11"/><path d="M12 11C12 7 9 4 5 4c0 4 3 7 7 7Z"/><path d="M12 14c0-3 3-6 7-6 0 3-3 6-7 6Z"/>',
  Gastronomía: '<path d="M6 3v7a2 2 0 0 0 4 0V3"/><path d="M8 10v11"/><path d="M17 3c-1.5 1.5-2 3.5-2 6s.5 4 2 5v7"/>',
  Comercio: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  Turismo: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5 5-2Z"/>',
  Construcción: '<path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/>',
  Tecnología: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  Mantenimiento: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3-3-6.3-6.3a4 4 0 0 1-5-5l3-3 3 3-3 3"/>',
  Otros: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};
const icon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.Otros}</svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>`;

/* ---------------- navegación / sesión ---------------- */
function initNav() {
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-mobile-menu]');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-logout]');
    if (!btn) return;
    ev.preventDefault();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    location.href = '/';
  });
}

function paintAuth() {
  const slot = $('[data-auth-slot]');
  const mobile = $('[data-auth-mobile]');
  if (!slot) return;
  const u = state.user;
  if (u && u.role === 'company') {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="/panel">Mi panel</a>
      <button class="btn btn-outline btn-sm" type="button" data-logout>Salir</button>`;
    if (mobile) { mobile.textContent = 'Mi panel'; mobile.href = '/panel'; }
  } else if (u && u.role === 'admin') {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="/admin">Admin</a>
      <button class="btn btn-outline btn-sm" type="button" data-logout>Salir</button>`;
    if (mobile) { mobile.textContent = 'Admin'; mobile.href = '/admin'; }
  }
}

async function loadMe() {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch (_) { state.user = null; }
  paintAuth();
  return state.user;
}

async function loadMeta() {
  if (state.meta) return state.meta;
  state.meta = await api('/api/meta');
  return state.meta;
}

function fillSelect(el, items, { all, value } = {}) {
  if (!el) return;
  const current = value !== undefined ? value : el.value;
  el.innerHTML = (all !== undefined ? `<option value="">${esc(all)}</option>` : '') +
    items.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  if (current && Array.from(el.options).some((o) => o.value === current)) el.value = current;
}

/* ---------------- tarjetas ---------------- */
function jobCard(j) {
  return `<a class="job-card" href="/oferta/${j.id}">
    <div class="job-top">
      <div>
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified" title="Empresa verificada">${checkIcon}</span>` : ''}</div>
      </div>
      ${j.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}
    </div>
    <div class="job-meta">
      <span class="badge">${esc(j.locality)}</span>
      <span class="badge">${esc(j.modality)}</span>
      <span class="badge">${esc(j.category)}</span>
    </div>
    <div class="job-salary">${esc(j.salary || 'Remuneración a convenir')}</div>
    <div class="job-foot"><span>${timeAgo(j.publishedAt)}</span><span>Ver oferta →</span></div>
  </a>`;
}

function jobRow(j) {
  return `<a class="job-row" href="/oferta/${j.id}">
    <div>
      <div class="job-title">${esc(j.title)}</div>
      <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified">${checkIcon}</span>` : ''}</div>
      <div class="badges">
        <span class="badge">${esc(j.locality)}</span>
        <span class="badge">${esc(j.type)}</span>
        <span class="badge">${esc(j.modality)}</span>
        ${j.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}
      </div>
    </div>
    <div class="side">
      <span class="job-salary">${esc(j.salary || 'A convenir')}</span>
      <span class="date">${timeAgo(j.publishedAt)}</span>
    </div>
  </a>`;
}

const statusBadge = (s) => s === 'approved' ? '<span class="badge badge-green">Publicada</span>'
  : s === 'pending' ? '<span class="badge badge-amber">Pendiente</span>'
  : s === 'rejected' ? '<span class="badge badge-red">Rechazada</span>'
  : '<span class="badge">Cerrada</span>';

/* ---------------- home ---------------- */
async function initHome() {
  const meta = await loadMeta();
  fillSelect($('#home-loc'), meta.localities, { all: 'Toda la zona' });
  fillSelect($('#home-cat'), meta.categories, { all: 'Todas las categorías' });

  $('#categories-grid').innerHTML = meta.categories.map((c) =>
    `<a class="cat-card" href="/buscar?category=${encodeURIComponent(c)}">
      <span class="cat-icon">${icon(c)}</span>
      <span class="cat-name">${esc(c)}</span>
    </a>`).join('');

  $('#home-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    const q = $('#home-q').value.trim();
    if (q) p.set('q', q);
    if ($('#home-loc').value) p.set('locality', $('#home-loc').value);
    if ($('#home-cat').value) p.set('category', $('#home-cat').value);
    location.href = `/buscar${p.toString() ? '?' + p : ''}`;
  });

  try {
    const { jobs } = await api('/api/jobs?limit=6');
    const grid = $('#featured-jobs');
    grid.innerHTML = jobs.length ? jobs.map(jobCard).join('')
      : '<div class="empty" style="grid-column:1/-1"><h3>Todavía no hay ofertas publicadas</h3><p>Volvé pronto o publicá la primera búsqueda.</p></div>';
  } catch (err) {
    $('#featured-jobs').innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar las ofertas</h3><p>${esc(err.message)}</p></div>`;
  }
}

/* ---------------- buscar ---------------- */
async function initSearch() {
  const meta = await loadMeta();
  const form = $('#filters-form');
  const params = new URLSearchParams(location.search);
  const f = {
    q: params.get('q') || '',
    locality: params.get('locality') || '',
    category: params.get('category') || '',
    type: params.get('type') || '',
    modality: params.get('modality') || '',
    sort: params.get('sort') === 'old' ? 'old' : 'recent',
  };
  fillSelect($('#f-locality'), meta.localities, { all: 'Todas', value: f.locality });
  fillSelect($('#f-category'), meta.categories, { all: 'Todas', value: f.category });
  fillSelect($('#f-type'), meta.types, { all: 'Todos', value: f.type });
  fillSelect($('#f-modality'), meta.modalities, { all: 'Todas', value: f.modality });
  $('#f-q').value = f.q;
  $('#f-sort').value = f.sort;

  let page = 1;
  let pages = 1;
  const results = $('#results');

  async function load(reset) {
    if (reset) { page = 1; results.innerHTML = '<div class="skeleton" style="height:110px"></div><div class="skeleton" style="height:110px;margin-top:12px"></div>'; }
    const p = new URLSearchParams();
    const vals = {
      q: $('#f-q').value.trim(), locality: $('#f-locality').value, category: $('#f-category').value,
      type: $('#f-type').value, modality: $('#f-modality').value, sort: $('#f-sort').value,
    };
    for (const [k, v] of Object.entries(vals)) if (v) p.set(k, v);
    p.set('page', String(page));
    p.set('limit', '10');
    try {
      const data = await api(`/api/jobs?${p}`);
      pages = data.pages;
      $('#results-count').textContent = data.total === 1 ? '1 oferta encontrada' : `${data.total} ofertas encontradas`;
      const html = data.jobs.map(jobRow).join('');
      if (reset) results.innerHTML = html || `<div class="empty"><h3>No encontramos ofertas</h3><p>Probá con otras palabras o quitá algunos filtros.</p></div>`;
      else results.insertAdjacentHTML('beforeend', html);
      $('#load-more-wrap').hidden = page >= pages;
      history.replaceState(null, '', `/buscar${p.toString() ? '?' + p : ''}`);
    } catch (err) {
      results.innerHTML = `<div class="empty"><h3>Error al buscar</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); load(true); });
  $('#f-sort').addEventListener('change', () => load(true));
  $('#clear-filters').addEventListener('click', () => {
    form.reset(); $('#f-q').value = ''; $('#f-sort').value = 'recent';
    load(true);
  });
  $('#load-more').addEventListener('click', () => { page += 1; load(false); });
  await load(true);
}

/* ---------------- detalle ---------------- */
async function initJob() {
  const id = location.pathname.split('/').pop();
  const view = $('#job-view');
  try {
    const { job, canApply } = await api(`/api/jobs/${id}`);
    document.title = `${job.title} · Workuco`;
    $('#crumb-job').textContent = job.title;
    const list = (txt) => String(txt || '').split('\n').map((s) => s.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
    const reqs = list(job.requirements);
    const resps = list(job.responsibilities);
    const expired = !canApply;
    view.innerHTML = `<div class="detail-grid">
      <article class="detail-main">
        <div class="job-meta">
          ${job.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}
          <span class="badge badge-green">${esc(job.category)}</span>
          <span class="badge">${esc(job.locality)}</span>
          <span class="badge">${esc(job.modality)}</span>
        </div>
        <h1>${esc(job.title)}</h1>
        <div class="detail-company">${esc(job.companyName)} ${job.companyVerified ? `<span class="verified">${checkIcon} Empresa verificada</span>` : ''}</div>

        <div class="detail-block">
          <h2>Descripción del trabajo</h2>
          <div class="prose">${esc(job.description)}</div>
        </div>
        ${resps.length ? `<div class="detail-block"><h2>Responsabilidades</h2><ul>${resps.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
        ${reqs.length ? `<div class="detail-block"><h2>Requisitos</h2><ul>${reqs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}

        <div class="detail-block">
          <h2>Información de contacto</h2>
          <p>${job.contactEmail ? `<a href="mailto:${esc(job.contactEmail)}" style="color:var(--green-dark);font-weight:600">${esc(job.contactEmail)}</a>` : 'Postulate desde esta página y la empresa recibirá tus datos.'}</p>
          ${job.contactPhone ? `<p style="margin-top:4px">Teléfono: ${esc(job.contactPhone)}</p>` : ''}
        </div>
      </article>

      <aside class="detail-aside">
        <div class="aside-card">
          ${expired
            ? '<div class="alert alert-info">Esta búsqueda ya cerró. Podés ver otras ofertas disponibles.</div><a class="btn btn-outline btn-block" href="/buscar" style="margin-top:12px">Ver otras ofertas</a>'
            : `<button class="btn btn-primary btn-block" type="button" id="open-apply">Postularme</button>
               <p class="aside-note">Postulación directa a la empresa. Sin intermediarios.</p>`}
        </div>
        <div class="aside-card">
          <h3>Resumen del puesto</h3>
          <div class="kv"><span>Localidad</span><span>${esc(job.locality)}</span></div>
          <div class="kv"><span>Tipo de empleo</span><span>${esc(job.type)}</span></div>
          <div class="kv"><span>Modalidad</span><span>${esc(job.modality)}</span></div>
          <div class="kv"><span>Jornada</span><span>${esc(job.schedule || 'A convenir')}</span></div>
          <div class="kv"><span>Experiencia</span><span>${esc(job.experience || 'No excluyente')}</span></div>
          <div class="kv"><span>Remuneración</span><span>${esc(job.salary || 'A convenir')}</span></div>
          <div class="kv"><span>Publicada</span><span>${fmtDate(job.publishedAt)}</span></div>
          ${job.closesAt ? `<div class="kv"><span>Cierra</span><span>${fmtDate(job.closesAt + 'T12:00:00')}</span></div>` : ''}
        </div>
        ${job.companyDescription ? `<div class="aside-card"><h3>Sobre la empresa</h3><p style="font-size:13.8px;color:#3c4842">${esc(job.companyDescription)}</p>${job.companyWebsite ? `<a class="link-arrow" style="display:inline-block;margin-top:10px" href="${esc(job.companyWebsite)}" target="_blank" rel="noopener">Sitio web →</a>` : ''}</div>` : ''}
      </aside>
    </div>`;

    if (canApply) initApply(job);
  } catch (err) {
    view.innerHTML = `<div class="empty"><h3>Oferta no disponible</h3><p>${esc(err.message)}</p><a class="btn btn-outline" href="/buscar" style="margin-top:16px">Volver a buscar</a></div>`;
  }
}

function initApply(job) {
  const modal = $('#apply-modal');
  const form = $('#apply-form');
  const alertBox = $('#apply-alert');
  $('#apply-job-title').textContent = job.title;

  const open = () => { modal.hidden = false; document.body.style.overflow = 'hidden'; $('#a-name').focus(); };
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
  $('#open-apply').addEventListener('click', open);
  $$('[data-close-modal]', modal).forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = $('#apply-submit');
    const cvInput = $('#a-cv');
    const payload = {
      name: $('#a-name').value.trim(),
      email: $('#a-email').value.trim(),
      phone: $('#a-phone').value.trim(),
      message: $('#a-message').value.trim(),
    };
    if (cvInput.files && cvInput.files[0]) {
      const file = cvInput.files[0];
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        setFieldErrors(form, { cv: 'El archivo debe ser un PDF' }); return;
      }
      if (file.size > 4 * 1024 * 1024) { setFieldErrors(form, { cv: 'El PDF supera los 4 MB' }); return; }
      payload.cv = { name: file.name, data: await fileToBase64(file) };
    }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await api(`/api/jobs/${job.id}/apply`, { method: 'POST', body: payload });
      modal.querySelector('.modal').innerHTML = `<div style="text-align:center;padding:20px 6px">
        <div style="width:52px;height:52px;border-radius:50%;background:var(--green-soft);color:var(--green);display:grid;place-items:center;margin:0 auto 16px">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m5 12 4 4L19 6"/></svg>
        </div>
        <h2 style="margin-bottom:6px">Postulación enviada</h2>
        <p style="color:var(--muted);font-size:14px">La empresa recibió tus datos. Si les interesa, se van a contactar con vos.</p>
        <button class="btn btn-primary" type="button" data-close-modal style="margin-top:20px">Listo</button>
      </div>`;
      modal.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => {
        modal.hidden = true; document.body.style.overflow = ''; location.reload();
      }));
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setFieldErrors(form, err.fields);
      btn.disabled = false; btn.textContent = 'Enviar postulación';
    }
  });
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = reject;
  r.readAsDataURL(file);
});

/* ---------------- publicar / editar ---------------- */
async function initPublish() {
  const meta = await loadMeta();
  const user = await loadMe();
  const gate = $('#publish-gate');
  const app = $('#publish-app');

  if (!user || user.role !== 'company') {
    gate.hidden = false;
    return;
  }
  gate.hidden = true;
  app.hidden = false;

  fillSelect($('#j-locality'), meta.localities);
  fillSelect($('#j-category'), meta.categories);
  fillSelect($('#j-type'), meta.types);
  fillSelect($('#j-modality'), meta.modalities);
  $('#j-contact-email').value = user.company.email || '';

  const editId = new URLSearchParams(location.search).get('edit');
  let editing = null;
  if (editId) {
    try {
      const { jobs } = await api('/api/company/jobs');
      editing = jobs.find((j) => j.id === editId);
    } catch (_) {}
    if (!editing) {
      showAlert($('#publish-alert'), 'No encontramos esa publicación.', 'error');
    } else {
      document.title = 'Editar empleo · Workuco';
      $('.app-head h1').textContent = 'Editar empleo';
      $('.app-head p').textContent = 'Al guardar, la publicación vuelve a revisión.';
      $('#job-submit').textContent = 'Guardar y reenviar';
      $('#j-title').value = editing.title;
      $('#j-locality').value = editing.locality;
      $('#j-category').value = editing.category;
      $('#j-type').value = editing.type;
      $('#j-modality').value = editing.modality;
      $('#j-description').value = editing.description;
      $('#j-responsibilities').value = editing.responsibilities || '';
      $('#j-requirements').value = editing.requirements || '';
      $('#j-experience').value = editing.experience || '';
      $('#j-schedule').value = editing.schedule || '';
      $('#j-salary').value = editing.salary || '';
      $('#j-contact-email').value = editing.contactEmail || user.company.email;
      $('#j-contact-phone').value = editing.contactPhone || '';
      $('#j-closes').value = editing.closesAt || '';
    }
  }

  const alertBox = $('#publish-alert');
  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = $('#job-submit');
    const body = {
      title: $('#j-title').value.trim(),
      locality: $('#j-locality').value,
      category: $('#j-category').value,
      type: $('#j-type').value,
      modality: $('#j-modality').value,
      description: $('#j-description').value.trim(),
      responsibilities: $('#j-responsibilities').value.trim(),
      requirements: $('#j-requirements').value.trim(),
      experience: $('#j-experience').value.trim(),
      schedule: $('#j-schedule').value.trim(),
      salary: $('#j-salary').value.trim(),
      contactEmail: $('#j-contact-email').value.trim(),
      contactPhone: $('#j-contact-phone').value.trim(),
      closesAt: $('#j-closes').value,
    };
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (editing) await api(`/api/company/jobs/${editing.id}`, { method: 'PUT', body });
      else await api('/api/company/jobs', { method: 'POST', body });
      app.innerHTML = `<div class="card" style="text-align:center;padding:44px 26px">
        <div style="width:52px;height:52px;border-radius:50%;background:var(--green-soft);color:var(--green);display:grid;place-items:center;margin:0 auto 16px">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m5 12 4 4L19 6"/></svg>
        </div>
        <h1 style="font-size:25px;margin-bottom:8px">${editing ? 'Cambios enviados' : 'Publicación enviada'}</h1>
        <p style="color:var(--muted);max-width:460px;margin:0 auto 22px">Quedó pendiente de aprobación. Cuando la revisemos, va a aparecer en las búsquedas y te avisamos en el panel.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn btn-primary" href="/panel">Ir a mis publicaciones</a>
          <a class="btn btn-outline" href="/publicar">Publicar otra</a>
        </div>
      </div>`;
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setFieldErrors($('#job-form'), err.fields);
      btn.disabled = false; btn.textContent = editing ? 'Guardar y reenviar' : 'Enviar para revisión';
    }
  });
}

/* ---------------- acceso ---------------- */
async function initAuth() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/panel';
  const isRegister = params.get('modo') === 'registro';
  const alertBox = $('#auth-alert');
  const loginForm = $('#login-form');
  const regForm = $('#register-form');
  const tabLogin = $('#tab-login');
  const tabReg = $('#tab-register');

  const setTab = (reg) => {
    tabLogin.classList.toggle('is-active', !reg);
    tabReg.classList.toggle('is-active', reg);
    tabLogin.setAttribute('aria-selected', String(!reg));
    tabReg.setAttribute('aria-selected', String(reg));
    loginForm.hidden = reg;
    regForm.hidden = !reg;
    $('#auth-title').textContent = reg ? 'Creá tu cuenta de empresa' : 'Accedé a tu cuenta';
    $('#auth-sub').textContent = reg ? 'Publicá búsquedas y recibí postulaciones.' : 'Administrá tus publicaciones y postulaciones.';
    hideAlert(alertBox);
  };
  tabLogin.addEventListener('click', () => setTab(false));
  tabReg.addEventListener('click', () => setTab(true));
  if (isRegister) setTab(true);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    try {
      await api('/api/auth/login', { method: 'POST', body: {
        email: $('#l-email').value.trim(), password: $('#l-pass').value,
      } });
      location.href = next;
    } catch (err) { showAlert(alertBox, err.message, 'error'); }
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    try {
      await api('/api/auth/register', { method: 'POST', body: {
        name: $('#r-name').value.trim(),
        email: $('#r-email').value.trim(),
        phone: $('#r-phone').value.trim(),
        password: $('#r-pass').value,
      } });
      location.href = next;
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setFieldErrors(regForm, err.fields);
    }
  });
}

/* ---------------- panel empresa ---------------- */
async function initPanel() {
  const user = await loadMe();
  $('#panel-loading').hidden = true;
  if (!user || user.role !== 'company') { $('#panel-gate').hidden = false; return; }
  $('#panel-app').hidden = false;
  $('#panel-company').textContent = user.company.name;

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));

  let jobs = [];
  let apps = [];

  async function load() {
    try {
      const data = await api('/api/company/jobs');
      jobs = data.jobs;
      const { applications } = await api('/api/company/applications');
      apps = applications;
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function render() {
    const published = jobs.filter((j) => j.status === 'approved').length;
    const pending = jobs.filter((j) => j.status === 'pending').length;
    const views = jobs.reduce((n, j) => n + (j.views || 0), 0);
    $('#kpi-published').textContent = published;
    $('#kpi-pending').textContent = pending;
    $('#kpi-apps').textContent = apps.length;
    $('#kpi-views').textContent = views;

    $('#jobs-list').innerHTML = jobs.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Puesto</th><th>Estado</th><th>Postulaciones</th><th>Publicada</th><th></th></tr></thead>
      <tbody>${jobs.map((j) => `<tr>
        <td><div class="cell-title">${esc(j.title)}</div><div class="cell-sub">${esc(j.locality)} · ${esc(j.category)}</div></td>
        <td>${statusBadge(j.status)}${j.status === 'rejected' && j.rejectReason ? `<div class="cell-sub" style="max-width:220px">${esc(j.rejectReason)}</div>` : ''}</td>
        <td>${j.applications}</td>
        <td class="cell-sub">${j.publishedAt ? fmtDate(j.publishedAt) : '—'}</td>
        <td><div class="row-actions">
          ${j.status === 'approved' ? `<a class="btn btn-ghost btn-sm" href="/oferta/${j.id}" target="_blank" rel="noopener">Ver</a>` : ''}
          <a class="btn btn-outline btn-sm" href="/publicar?edit=${j.id}">Editar</a>
          <button class="btn btn-danger btn-sm" type="button" data-del="${j.id}">Eliminar</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="list-empty">Todavía no publicaste ninguna búsqueda. <a href="/publicar" style="color:var(--green-dark);font-weight:600">Publicá la primera</a>.</div>`;

    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta publicación? También se borran sus postulaciones.')) return;
      try { await api(`/api/company/jobs/${b.dataset.del}`, { method: 'DELETE' }); toast('Publicación eliminada', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    }));

    $('#apps-list').innerHTML = apps.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Candidato</th><th>Oferta</th><th>Contacto</th><th>CV</th><th>Estado</th></tr></thead>
      <tbody>${apps.map((a) => `<tr>
        <td><div class="cell-title">${esc(a.name)}</div><div class="cell-sub">${timeAgo(a.createdAt)}</div></td>
        <td class="cell-sub">${esc(a.jobTitle)}</td>
        <td class="cell-sub">${esc(a.email)}<br>${esc(a.phone)}</td>
        <td>${a.hasCv ? `<a class="btn btn-outline btn-sm" href="/api/company/cv/${a.id}" target="_blank" rel="noopener">Ver CV</a>` : '<span class="cell-sub">Sin CV</span>'}</td>
        <td><select class="input" data-app="${a.id}" style="min-height:34px;padding:4px 8px;font-size:13px">
          <option value="nueva"${a.status === 'nueva' ? ' selected' : ''}>Nueva</option>
          <option value="contactada"${a.status === 'contactada' ? ' selected' : ''}>Contactada</option>
          <option value="descartada"${a.status === 'descartada' ? ' selected' : ''}>Descartada</option>
        </select></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="list-empty">Todavía no recibiste postulaciones.</div>';

    $$('[data-app]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api(`/api/company/applications/${sel.dataset.app}`, { method: 'PATCH', body: { status: sel.value } }); toast('Estado actualizado', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
    }));

    $('#p-name').value = user.company.name || '';
    $('#p-phone').value = user.company.phone || '';
    $('#p-website').value = user.company.website || '';
    $('#p-desc').value = user.company.description || '';
  }

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { company } = await api('/api/company/profile', { method: 'PATCH', body: {
        name: $('#p-name').value.trim(), phone: $('#p-phone').value.trim(),
        website: $('#p-website').value.trim(), description: $('#p-desc').value.trim(),
      } });
      state.user.company = company;
      $('#panel-company').textContent = company.name;
      showAlert($('#profile-alert'), 'Perfil actualizado.', 'ok');
      setTimeout(() => hideAlert($('#profile-alert')), 3000);
    } catch (err) {
      showAlert($('#profile-alert'), err.message, 'error');
    }
  });

  await load();
}

/* ---------------- admin ---------------- */
async function initAdmin() {
  const user = await loadMe();
  if (!user || user.role !== 'admin') { $('#admin-gate').hidden = false; }
  else { $('#admin-gate').hidden = true; $('#admin-app').hidden = false; await adminData(); }

  $('#admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert($('#admin-login-alert'));
    try {
      await api('/api/admin/login', { method: 'POST', body: {
        email: $('#ad-email').value.trim(), password: $('#ad-pass').value,
      } });
      location.reload();
    } catch (err) { showAlert($('#admin-login-alert'), err.message, 'error'); }
  });

  $('#admin-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  });

  $$('[data-close-edit]').forEach((b) => b.addEventListener('click', closeEdit));
  $('#edit-modal').addEventListener('click', (e) => { if (e.target.id === 'edit-modal') closeEdit(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#edit-modal').hidden) closeEdit(); });

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));

  $('#jobs-filter').addEventListener('change', () => adminJobs($('#jobs-filter').value));
}

let ADMIN_JOBS = [];
async function adminData() {
  try {
    const { stats } = await api('/api/admin/stats');
    $('#s-published').textContent = stats.published;
    $('#s-pending').textContent = stats.pending;
    $('#s-apps').textContent = stats.applications;
    $('#s-companies').textContent = stats.companies;
    await adminJobs('');
    await adminApps();
    await adminCompanies();
  } catch (err) { toast(err.message, 'err'); }
}

async function adminJobs(status) {
  const wrap = $('#admin-jobs');
  wrap.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    const { jobs } = await api(`/api/admin/jobs${status ? '?status=' + status : ''}`);
    ADMIN_JOBS = jobs;
    wrap.innerHTML = jobs.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Oferta</th><th>Empresa</th><th>Estado</th><th>Post.</th><th></th></tr></thead>
      <tbody>${jobs.map((j) => `<tr>
        <td><div class="cell-title">${esc(j.title)}</div><div class="cell-sub">${esc(j.locality)} · ${esc(j.category)} · ${timeAgo(j.createdAt)}</div></td>
        <td class="cell-sub">${esc(j.companyName)}${j.companyVerified ? ' ✓' : ''}</td>
        <td>${statusBadge(j.status)}${j.featured ? '<div style="margin-top:4px"><span class="badge badge-featured">Destacada</span></div>' : ''}</td>
        <td>${j.applications}</td>
        <td><div class="row-actions">
          ${j.status !== 'approved' ? `<button class="btn btn-primary btn-sm" data-approve="${j.id}">Aprobar</button>` : ''}
          ${j.status !== 'rejected' ? `<button class="btn btn-outline btn-sm" data-reject="${j.id}">Rechazar</button>` : ''}
          <button class="btn btn-outline btn-sm" data-feature="${j.id}">${j.featured ? 'Quitar destacado' : 'Destacar'}</button>
          <button class="btn btn-outline btn-sm" data-edit="${j.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-remove="${j.id}">Eliminar</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="list-empty">No hay ofertas con ese estado.</div>';

    $$('[data-approve]').forEach((b) => b.addEventListener('click', () => patchJob(b.dataset.approve, { status: 'approved' })));
    $$('[data-reject]').forEach((b) => b.addEventListener('click', () => {
      const reason = prompt('Motivo del rechazo (lo ve la empresa):', 'Faltan datos obligatorios o la oferta no cumple las normas.');
      if (reason === null) return;
      patchJob(b.dataset.reject, { status: 'rejected', rejectReason: reason });
    }));
    $$('[data-feature]').forEach((b) => b.addEventListener('click', () => {
      const j = jobs.find((x) => x.id === b.dataset.feature);
      patchJob(j.id, { featured: !j.featured });
    }));
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openEdit(b.dataset.edit)));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta oferta y sus postulaciones?')) return;
      try { await api(`/api/admin/jobs/${b.dataset.remove}`, { method: 'DELETE' }); toast('Oferta eliminada', 'ok'); adminData(); }
      catch (err) { toast(err.message, 'err'); }
    }));
  } catch (err) { wrap.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; }
}

async function patchJob(id, patch) {
  try {
    await api(`/api/admin/jobs/${id}`, { method: 'PATCH', body: patch });
    toast('Oferta actualizada', 'ok');
    const { stats } = await api('/api/admin/stats');
    $('#s-published').textContent = stats.published;
    $('#s-pending').textContent = stats.pending;
    await adminJobs($('#jobs-filter').value);
  } catch (err) { toast(err.message, 'err'); }
}

async function openEdit(id) {
  const j = ADMIN_JOBS.find((x) => x.id === id);
  if (!j) return;
  const meta = await loadMeta();
  fillSelect($('#e-locality'), meta.localities, { value: j.locality });
  fillSelect($('#e-category'), meta.categories, { value: j.category });
  fillSelect($('#e-type'), meta.types, { value: j.type });
  fillSelect($('#e-modality'), meta.modalities, { value: j.modality });
  $('#e-id').value = j.id;
  $('#e-title').value = j.title;
  $('#e-desc').value = j.description;
  $('#e-salary').value = j.salary || '';
  $('#e-contact').value = j.contactEmail || '';
  $('#e-closes').value = j.closesAt || '';
  $('#edit-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#edit-form').onsubmit = async (e) => {
    e.preventDefault();
    hideAlert($('#edit-alert'));
    try {
      await api(`/api/admin/jobs/${j.id}`, { method: 'PATCH', body: {
        title: $('#e-title').value.trim(), locality: $('#e-locality').value,
        category: $('#e-category').value, type: $('#e-type').value, modality: $('#e-modality').value,
        description: $('#e-desc').value.trim(), salary: $('#e-salary').value.trim(),
        contactEmail: $('#e-contact').value.trim(), closesAt: $('#e-closes').value,
      } });
      closeEdit();
      toast('Oferta actualizada', 'ok');
      await adminJobs($('#jobs-filter').value);
    } catch (err) {
      showAlert($('#edit-alert'), err.message, 'error');
    }
  };
}
function closeEdit() {
  $('#edit-modal').hidden = true;
  document.body.style.overflow = '';
}

async function adminApps() {
  const wrap = $('#admin-apps');
  try {
    const { applications } = await api('/api/admin/applications');
    wrap.innerHTML = applications.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Candidato</th><th>Oferta</th><th>Contacto</th><th>Mensaje</th><th>CV</th></tr></thead>
      <tbody>${applications.map((a) => `<tr>
        <td><div class="cell-title">${esc(a.name)}</div><div class="cell-sub">${timeAgo(a.createdAt)}</div></td>
        <td class="cell-sub">${esc(a.jobTitle)}<br><span style="color:#8a968f">${esc(a.companyName)}</span></td>
        <td class="cell-sub">${esc(a.email)}<br>${esc(a.phone)}</td>
        <td class="cell-sub" style="max-width:260px">${esc(a.message || '—')}</td>
        <td>${a.hasCv ? `<a class="btn btn-outline btn-sm" href="/api/company/cv/${a.id}" target="_blank" rel="noopener">Ver</a>` : '<span class="cell-sub">—</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="list-empty">Todavía no hay postulaciones.</div>';
  } catch (err) { wrap.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; }
}

async function adminCompanies() {
  const wrap = $('#admin-companies');
  try {
    const { companies } = await api('/api/admin/companies');
    wrap.innerHTML = companies.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Empresa</th><th>Contacto</th><th>Ofertas</th><th>Plan</th><th>Verificada</th></tr></thead>
      <tbody>${companies.map((c) => `<tr>
        <td><div class="cell-title">${esc(c.name)}</div><div class="cell-sub">${timeAgo(c.createdAt)}</div></td>
        <td class="cell-sub">${esc(c.email)}<br>${esc(c.phone || '')}</td>
        <td class="cell-sub">${c.published} publicadas / ${c.jobs} totales</td>
        <td><select class="input" data-plan="${c.id}" style="min-height:34px;padding:4px 8px;font-size:13px">
          ${['free', 'pro', 'premium'].map((p) => `<option value="${p}"${c.plan === p ? ' selected' : ''}>${p}</option>`).join('')}
        </select></td>
        <td><label style="display:inline-flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" data-verify="${c.id}"${c.verified ? ' checked' : ''}> ${c.verified ? 'Sí' : 'No'}</label></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="list-empty">No hay empresas registradas.</div>';

    $$('[data-verify]').forEach((chk) => chk.addEventListener('change', async () => {
      try { await api(`/api/admin/companies/${chk.dataset.verify}`, { method: 'PATCH', body: { verified: chk.checked } }); toast('Empresa actualizada', 'ok'); adminCompanies(); }
      catch (err) { toast(err.message, 'err'); }
    }));
    $$('[data-plan]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api(`/api/admin/companies/${sel.dataset.plan}`, { method: 'PATCH', body: { plan: sel.value } }); toast('Plan actualizado', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
    }));
  } catch (err) { wrap.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; }
}

/* ---------------- info ---------------- */
const INFO = {
  acerca: `<h1>Acerca de Workuco</h1>
    <p class="lead">Workuco es el portal de empleo del Valle de Uco, pensado para conectar a quienes buscan trabajo con las empresas y emprendimientos de San Carlos, Tunuyán y Tupungato.</p>
    <p>La plataforma centraliza búsquedas laborales que antes se dispersaban en grupos de WhatsApp, carteles y contactos personales. Del lado de las empresas, permite publicar una búsqueda en minutos y recibir postulaciones ordenadas. Del lado de las personas, permite buscar por categoría, localidad y modalidad, y postularse con un formulario simple.</p>
    <h2>Cómo funciona</h2>
    <ul>
      <li>Las empresas crean una cuenta y publican su búsqueda.</li>
      <li>El equipo de Workuco revisa cada publicación antes de que sea visible.</li>
      <li>Las personas se postulan desde la página de la oferta, con o sin CV.</li>
      <li>La empresa recibe las postulaciones en su panel y decide a quién contactar.</li>
    </ul>
    <h2>Gratis para empezar</h2>
    <p>Publicar y postularse es gratuito. Más adelante vamos a sumar opciones para destacar búsquedas y planes para empresas que publican con frecuencia, sin cambiar lo que ya funciona.</p>`,
  contacto: `<h1>Contacto</h1>
    <p class="lead">¿Tenés una consulta sobre una oferta, tu cuenta o una publicación?</p>
    <div class="info-card">
      <h2 style="margin-top:0">Escribinos</h2>
      <p>Email: <a href="mailto:hola@workuco.com.ar" style="color:var(--green-dark);font-weight:600">hola@workuco.com.ar</a></p>
      <p>Horario de atención: lunes a viernes de 9 a 18 h.</p>
      <p>También podés escribirnos desde la cuenta de empresa que creaste; respondemos dentro de las 24 horas hábiles.</p>
    </div>
    <h2>Para empresas</h2>
    <p>Si necesitás ayuda para publicar tu primera búsqueda, escribinos con el asunto “Publicar empleo” y te acompañamos.</p>`,
  faq: `<h1>Preguntas frecuentes</h1>
    <h2>¿Publicar tiene costo?</h2>
    <p>No. Publicar una búsqueda y postularse son gratuitos. En el futuro habrá opciones pagas para destacar ofertas, pero el uso básico va a seguir siendo gratis.</p>
    <h2>¿Cuánto tarda en aprobarse una publicación?</h2>
    <p>Revisamos las publicaciones dentro de las 24 horas hábiles. Si falta información, la rechazamos con un motivo para que puedas corregirla y reenviarla.</p>
    <h2>¿Necesito CV para postularme?</h2>
    <p>No es obligatorio. Cada oferta indica si lo pide. Podés adjuntar un PDF de hasta 4 MB o postularte solo con tus datos y un mensaje.</p>
    <h2>¿Quién ve mis datos?</h2>
    <p>Solo la empresa que publicó la oferta y el equipo de administración de Workuco. No vendemos datos ni los compartimos con terceros.</p>
    <h2>¿Puedo postularme a la misma oferta dos veces?</h2>
    <p>No. El sistema toma tu email como referencia para evitar postulaciones duplicadas a la misma búsqueda.</p>
    <h2>¿Cómo elimino mi cuenta de empresa?</h2>
    <p>Escribinos a hola@workuco.com.ar desde el email registrado y la eliminamos junto con las publicaciones asociadas.</p>`,
  terminos: `<h1>Términos y condiciones</h1>
    <p class="lead">Última actualización: noviembre de 2026.</p>
    <h2>Uso de la plataforma</h2>
    <p>Workuco es un espacio de publicación y búsqueda de empleo. No somos empleadores ni participamos en la relación laboral entre empresas y candidatos. No garantizamos la obtención de un empleo ni la cobertura de una búsqueda.</p>
    <h2>Publicaciones</h2>
    <ul>
      <li>Las empresas son responsables de la veracidad de los datos que publican.</li>
      <li>No se permiten ofertas discriminatorias, engañosas ni que soliciten pagos a los postulantes.</li>
      <li>Workuco puede rechazar o eliminar publicaciones que incumplan estas condiciones.</li>
    </ul>
    <h2>Postulaciones</h2>
    <p>Al postularte, autorizás que tus datos sean compartidos con la empresa responsable de la oferta. La empresa debe usarlos únicamente para evaluar tu candidatura.</p>
    <h2>Cuentas</h2>
    <p>Las cuentas de empresa son personales e intransferibles. Sos responsable de mantener tu contraseña segura y de la actividad realizada desde tu cuenta.</p>
    <h2>Cambios</h2>
    <p>Podemos actualizar estos términos. Los cambios importantes se comunican en la plataforma.</p>`,
  privacidad: `<h1>Política de privacidad</h1>
    <p class="lead">Cómo tratamos tus datos en Workuco.</p>
    <h2>Qué datos recopilamos</h2>
    <ul>
      <li><strong>Empresas:</strong> nombre, email, teléfono, sitio web y descripción.</li>
      <li><strong>Postulantes:</strong> nombre, email, teléfono, mensaje y CV si lo adjuntás.</li>
      <li><strong>Uso:</strong> datos técnicos básicos para seguridad y funcionamiento del servicio.</li>
    </ul>
    <h2>Para qué los usamos</h2>
    <p>Para publicar ofertas, recibir postulaciones, permitir el contacto entre empresas y candidatos, y mantener la seguridad de la plataforma.</p>
    <h2>Con quién se comparten</h2>
    <p>Las postulaciones se comparten únicamente con la empresa que publicó la oferta. No vendemos ni cedemos datos a terceros con fines publicitarios.</p>
    <h2>Conservación y seguridad</h2>
    <p>Los CV se almacenan en un servidor privado y solo son accesibles para la empresa destinataria y el equipo de administración. Las contraseñas se guardan cifradas. Podés pedir la eliminación de tus datos escribiendo a hola@workuco.com.ar.</p>
    <h2>Tus derechos</h2>
    <p>Podés solicitar acceso, corrección o eliminación de tus datos personales en cualquier momento.</p>`,
};

function initInfo() {
  const key = location.pathname.replace('/', '');
  const root = $('[data-info]');
  if (root && INFO[key]) root.innerHTML = INFO[key];
}

/* ---------------- arranque ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  const page = document.body.dataset.page;
  try {
    switch (page) {
      case 'home': await loadMe(); await initHome(); break;
      case 'search': await loadMe(); await initSearch(); break;
      case 'job': await loadMe(); await initJob(); break;
      case 'publish': await initPublish(); break;
      case 'auth': await loadMe(); await initAuth(); break;
      case 'panel': await initPanel(); break;
      case 'admin': await initAdmin(); break;
      case 'info': await loadMe(); initInfo(); break;
      default: await loadMe();
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Ocurrió un error', 'err');
  }
});
