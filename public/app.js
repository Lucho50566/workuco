/* Workuco — frontend público y compartido */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const state = { user: null, meta: null, saved: new Set() };

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
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
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
  if (!form) return;
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
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 20a6 6 0 0 0-3-5.2"/>',
  sparkles: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="M18 15.5 19 18l2.5 1L19 20l-1 2.5L17 20l-2.5-1L17 18l1-2.5Z"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.4"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  external: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1C10.6 20 4 13.4 4 5a1 1 0 0 1 1-1Z"/>',
  whatsapp: '<path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 8.5c0 3 2.5 5.5 5.5 5.5.6 0 1.2-.5 1.2-1.1l-1.7-.9-1 .8a5 5 0 0 1-2-2l.8-1L11 8c-.7 0-1.2.5-1.2 1"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4M9 13h6M9 17h6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  wand: '<path d="m4 20 9-9M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  inbox: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/>',
  share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.7 7.4-4.3M8.3 13.3l7.4 4.3"/>',
};
const icon = (name, size = 18, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.briefcase}</svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>`;

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const logoHtml = (name, logo, cls = 'logo') => (logo
  ? `<img class="${cls}" src="${esc(logo)}" alt="${esc(name)}" loading="lazy">`
  : `<span class="${cls} logo-fallback" aria-hidden="true">${esc(initials(name))}</span>`);
const avatarHtml = (name, photo, cls = 'avatar') => (photo
  ? `<img class="${cls}" src="${esc(photo)}" alt="${esc(name)}">`
  : `<span class="${cls} avatar-fallback" aria-hidden="true">${esc(initials(name))}</span>`);

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
    slot.innerHTML = `${bellHtml()}<a class="btn btn-ghost btn-sm" href="/panel">${icon('chart', 16)} Mi panel</a>
      <a class="btn btn-primary btn-sm" href="/publicar">Publicar empleo</a>`;
    if (mobile) { mobile.textContent = 'Mi panel'; mobile.href = '/panel'; }
  } else if (u && u.role === 'candidate') {
    slot.innerHTML = `${bellHtml()}<a class="btn btn-ghost btn-sm btn-avatar" href="/mi-perfil">${avatarHtml(u.candidate.name, u.candidate.photo, 'avatar-xs')} Mi perfil</a>
      <a class="btn btn-primary btn-sm" href="/buscar">Buscar empleo</a>`;
    if (mobile) { mobile.textContent = 'Mi perfil'; mobile.href = '/mi-perfil'; }
  } else if (u && u.role === 'admin') {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="/admin">Admin</a>
      <button class="btn btn-outline btn-sm" type="button" data-logout>Salir</button>`;
    if (mobile) { mobile.textContent = 'Admin'; mobile.href = '/admin'; }
  }
}

/* ---------------- campanita de notificaciones ---------------- */
const bellHtml = () => `<div class="bell-wrap"><button class="bell" type="button" aria-label="Notificaciones" aria-expanded="false" data-bell>
  ${icon('bell', 19)}<span class="bell-count" data-bell-count hidden>0</span></button></div>`;

async function initBell() {
  const btn = $('[data-bell]');
  if (!btn) return;
  const wrap = btn.parentElement;
  const count = $('[data-bell-count]', wrap);
  let data = { items: [], unread: 0 };
  const paintCount = () => {
    count.hidden = !data.unread;
    count.textContent = data.unread > 9 ? '9+' : String(data.unread);
    btn.setAttribute('aria-label', data.unread ? `Notificaciones: ${data.unread} sin leer` : 'Notificaciones');
  };
  const close = () => { const p = $('.bell-panel', wrap); if (p) p.remove(); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('.bell-panel', wrap)) { close(); return; }
    const panel = document.createElement('div');
    panel.className = 'bell-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notificaciones');
    panel.innerHTML = `<div class="bell-head"><b>Novedades</b>${data.unread ? '<button class="muted-link" type="button" data-bell-read>Marcar todo leído</button>' : ''}</div>
      <div class="bell-list">${data.items.length ? data.items.map((n) => `<a class="bell-item${n.read ? '' : ' is-unread'}" href="${esc(n.link || '#')}" data-bell-item="${esc(n.id)}">
        <div><strong>${esc(n.title)}</strong>${n.body ? `<span>${esc(n.body)}</span>` : ''}<time>${esc(timeAgo(n.createdAt))}</time></div></a>`).join('')
        : '<div class="bell-empty">Todavía no tenés novedades. Cuando haya movimiento en tus búsquedas, aparece acá.</div>'}</div>`;
    wrap.appendChild(panel);
    btn.setAttribute('aria-expanded', 'true');
    panel.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (ev.target.closest('[data-bell-read]')) {
        await api('/api/notifications/read', { method: 'POST', body: {} }).catch(() => {});
        data.unread = 0; data.items.forEach((n) => { n.read = true; }); paintCount(); close();
        return;
      }
      const item = ev.target.closest('[data-bell-item]');
      if (item) api('/api/notifications/read', { method: 'POST', body: { id: item.dataset.bellItem } }).catch(() => {});
    });
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.bell-panel', wrap)) { close(); btn.focus(); } });
  try { data = await api('/api/notifications'); paintCount(); } catch (_) {}
}

async function loadMe() {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch (_) { state.user = null; }
  paintAuth();
  initBell();
  return state.user;
}

async function loadMeta() {
  if (state.meta) return state.meta;
  state.meta = await api('/api/meta');
  return state.meta;
}

/* ---------------- componentes ---------------- */
function matchPill(m) {
  if (!m || m.score == null) return '';
  const cls = m.score >= 70 ? '' : m.score >= 45 ? ' is-mid' : ' is-low';
  return `<span class="match-pill${cls}" style="--pct:${Number(m.score)}" title="${esc((m.reasons || []).join(' · '))}">${Number(m.score)}% compatible</span>`;
}
const PERIOD_WORD = { mes: 'por mes', 'día': 'por día', hora: 'por hora' };
/* "$ 900.000" nunca se parte entre el signo y el número */
const nbMoney = (t) => String(t).replace(/\$ /g, '$\u00a0');
function payHtml(j) {
  if (j.salaryMin > 0) {
    const label = nbMoney(String(j.salaryLabel || '').replace(/ por (mes|día|hora)$/, ''));
    return `<span class="job-pay"><b>${esc(label)}</b><small>${esc(PERIOD_WORD[j.salaryPeriod] || '')}</small></span>`;
  }
  return `<span class="job-pay"><span class="is-empty">${esc(j.salaryLabel || j.salary || 'Sueldo a convenir')}</span></span>`;
}

function jobCard(j) {
  const cover = (j.companyGallery || [])[0];
  return `<a class="job-card" href="/oferta/${j.id}">
    <div class="job-cover${cover ? ' has-img' : ''}"${cover ? ` style="background-image:url('${esc(cover)}')"` : ''}>
      <span class="job-cover-shade"></span>
      ${j.gig ? '<span class="badge badge-gig">Changa</span>' : j.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}
    </div>
    <div class="job-card-body">
      ${logoHtml(j.companyName, j.companyLogo, 'logo')}
      <div class="job-top">
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified" title="Empresa verificada">${checkIcon}</span>` : ''}</div>
      </div>
      <div class="job-meta">
        <span class="badge">${esc(j.locality)}</span>
        <span class="badge">${esc(j.modality)}</span>
        <span class="badge">${esc(j.category)}</span>
      </div>
      <div class="job-foot">${payHtml(j)}${matchPill(j.match) || `<span>${timeAgo(j.publishedAt)}</span>`}</div>
    </div>
  </a>`;
}

function jobRow(j, saved = false) {
  const cover = (j.companyGallery || [])[0];
  return `<div class="job-row">
    <a class="job-row-main" href="/oferta/${j.id}">
      ${logoHtml(j.companyName, j.companyLogo, 'logo')}
      <div class="job-row-info">
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified">${checkIcon}</span>` : ''}</div>
        <div class="badges">
          <span class="badge">${esc(j.locality)}</span>
          <span class="badge">${esc(j.type)}</span>
          <span class="badge">${esc(j.modality)}</span>
          <span class="badge">${esc(j.category)}</span>
        </div>
      </div>
      <div class="side">
        ${payHtml(j)}
        ${matchPill(j.match)}
        <span class="date">${j.gig ? 'Changa · ' : ''}${timeAgo(j.publishedAt)}</span>
      </div>
    </a>
    ${state.user && state.user.role === 'candidate' ? `<button class="save-btn${saved ? ' is-on' : ''}" type="button" data-save="${j.id}" title="${saved ? 'Quitar de guardadas' : 'Guardar oferta'}">${icon('heart', 18)}</button>` : ''}
    ${cover ? `<span class="job-row-cover" style="background-image:url('${esc(cover)}')" aria-hidden="true"></span>` : ''}
  </div>`;
}

const statusBadge = (s) => s === 'approved' ? '<span class="badge badge-green">Publicada</span>'
  : s === 'pending' ? '<span class="badge badge-amber">Pendiente</span>'
  : s === 'rejected' ? '<span class="badge badge-red">Rechazada</span>'
  : '<span class="badge">Cerrada</span>';

const STAGE_LABEL = {
  nuevo: 'Nuevo', revisado: 'En revisión', entrevista: 'Entrevista',
  ofrecido: 'Oferta enviada', contratado: 'Contratado', descartado: 'Descartado',
};
const stageBadge = (s) => `<span class="stage-badge stage-${esc(s)}">${esc(STAGE_LABEL[s] || s)}</span>`;

function profileCompleteness(c) {
  if (!c) return 0;
  const checks = [
    !!c.name, !!c.phone, !!c.locality, !!c.headline, !!c.about,
    (c.skills || []).length > 0, !!c.experience, !!c.education, !!c.photo,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function setupCarousel(root) {
  if (!root) return;
  const slides = $$('.carousel-slide', root);
  if (slides.length <= 1) return;
  let i = 0;
  const dots = $$('.carousel-dot', root);
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
  };
  $$('.carousel-nav', root).forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    show(i + (b.dataset.dir === 'prev' ? -1 : 1));
  }));
  dots.forEach((d, k) => d.addEventListener('click', (e) => { e.preventDefault(); show(k); }));
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const play = () => {
    stop();
    if (!calm && !document.hidden) timer = setInterval(() => show(i + 1), 5500);
  };
  root.addEventListener('pointerenter', stop);
  root.addEventListener('pointerleave', play);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', play);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  play();
  let x0 = null;
  root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  show(0);
}

/* ================================================================== */
/* HOME                                                               */
/* ================================================================== */
async function initHome() {
  const root = $('main.home');
  const meta = await loadMeta();
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* rol: busco / contrato (se recuerda en este navegador) */
  const setRole = (role, animate) => {
    root.dataset.role = role;
    $$('[data-set-role]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.setRole === role)));
    try { localStorage.setItem('wk_role', role); } catch (_) {}
    if (animate && !calm) {
      $$(`[data-for="${role}"]`, $('.vh-copy')).forEach((el) => { el.classList.remove('role-swap'); void el.offsetWidth; el.classList.add('role-swap'); });
    }
  };
  let saved = '';
  try { saved = localStorage.getItem('wk_role') || ''; } catch (_) {}
  if (state.user && state.user.role === 'company') saved = 'employer';
  if (state.user && state.user.role === 'candidate') saved = 'seeker';
  setRole(saved === 'employer' ? 'employer' : 'seeker', false);
  $$('[data-set-role]').forEach((x) => x.addEventListener('click', () => setRole(x.dataset.setRole, true)));

  /* palabra rotativa */
  if (!calm) {
    $$('[data-rotate]').forEach((el) => {
      const words = el.dataset.rotate.split(',');
      let i = 0;
      setInterval(() => {
        if (document.hidden || el.offsetParent === null) return;
        el.classList.remove('is-in'); el.classList.add('is-swapping');
        setTimeout(() => {
          i = (i + 1) % words.length; el.textContent = words[i];
          el.classList.remove('is-swapping'); el.classList.add('is-in');
        }, 320);
      }, 2600);
    });
  }

  const locSel = $('#home-loc');
  locSel.innerHTML = '<option value="">Todo el Valle</option>' + meta.localities.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  $('#home-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    const qv = $('#home-q').value.trim();
    if (qv) p.set('q', qv);
    if (locSel.value) p.set('locality', locSel.value);
    location.href = `/buscar${p.toString() ? '?' + p : ''}`;
  });

  /* cinta de rubros (duplicada para el loop continuo) */
  const cats = meta.categories.filter((c) => c !== 'Otros');
  const links = cats.map((c) => `<a href="/buscar?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('');
  $('#marquee').innerHTML = links + links.replace(/<a /g, '<a aria-hidden="true" tabindex="-1" ');

  const counts = meta.counts || {};
  const tl = $('[data-talent-line]');
  if (tl && counts.candidates) tl.textContent = `${counts.candidates} personas del Valle ya tienen su perfil en Workuco.`;

  /* pueblos: búsquedas abiertas reales por localidad */
  $$('[data-town]').forEach(async (el) => {
    const label = $('[data-town-count]', el);
    try {
      const { total } = await api(`/api/jobs?limit=3&locality=${encodeURIComponent(el.dataset.town)}`);
      label.textContent = total === 1 ? '1 búsqueda' : `${total} búsquedas`;
      el.setAttribute('aria-label', `${el.dataset.town}: ${total} búsquedas abiertas`);
    } catch (_) { label.textContent = 'Ver búsquedas'; }
  });

  const fail = (el, err) => { if (el) el.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar esto</h3><p>${esc(err.message)}</p></div>`; };

  if (state.user && state.user.role === 'candidate') {
    api('/api/candidate/recommended').then(({ jobs }) => {
      if (!jobs.length) return;
      $('#rec-jobs').innerHTML = jobs.slice(0, 3).map(jobCard).join('');
      $('#recomendadas').hidden = false;
    }).catch(() => {});
  }

  api('/api/jobs?limit=6&gig=0').then(({ jobs }) => {
    $('#featured-jobs').innerHTML = jobs.length ? jobs.map(jobCard).join('')
      : '<div class="empty" style="grid-column:1/-1"><h3>Todavía no hay ofertas publicadas</h3><p>Volvé pronto o publicá la primera búsqueda.</p></div>';
  }).catch((err) => fail($('#featured-jobs'), err));

  api('/api/jobs?limit=3&gig=1').then(({ jobs }) => {
    if (!jobs.length) { $('#changas').hidden = true; return; }
    $('#home-gigs').innerHTML = jobs.map(gigCard).join('');
  }).catch((err) => fail($('#home-gigs'), err));

  api('/api/companies').then(({ companies }) => {
    $('#companies-strip').innerHTML = companies.slice(0, 8).map((c) => `<a class="company-pill" href="/empresa/${c.id}">
      ${logoHtml(c.name, c.logo, 'logo-sm')}
      <span><strong>${esc(c.name)}</strong><small>${esc(c.locality || 'Valle de Uco')} · ${c.jobs} ${c.jobs === 1 ? 'búsqueda' : 'búsquedas'}${c.response ? ` · responde el ${c.response.rate}%` : ''}</small></span>
    </a>`).join('') || '<p class="muted">Las empresas del Valle van a aparecer acá.</p>';
  }).catch(() => {});
}

function catIcon(c) {
  return ({ Administración: 'briefcase', Agricultura: 'sparkles', Gastronomía: 'money', Comercio: 'building', Turismo: 'pin', Construcción: 'building', Tecnología: 'settings', Mantenimiento: 'settings', Otros: 'inbox' })[c] || 'briefcase';
}

/* ================================================================== */
/* BUSCAR                                                             */
/* ================================================================== */
async function initSearch() {
  const meta = await loadMeta();
  const params = new URLSearchParams(location.search);
  const f = {
    q: params.get('q') || '',
    locality: params.get('locality') || '',
    category: params.get('category') || '',
    type: params.get('type') || '',
    modality: params.get('modality') || '',
    sort: ['old', 'salary', 'match'].includes(params.get('sort')) ? params.get('sort') : 'recent',
    withSalary: params.get('withSalary') === '1' ? '1' : '',
    gig: params.get('gig') === '1' ? '1' : '',
  };
  const isCand = !!(state.user && state.user.role === 'candidate');
  $$('[data-candidate-only]').forEach((o) => { o.hidden = !isCand; });
  if (f.sort === 'match' && !isCand) f.sort = 'recent';
  $('#save-alert').hidden = !isCand;
  $('#alert-login').hidden = isCand || !!state.user;
  $('#f-q').value = f.q;
  $('#f-sort').value = f.sort;

  const chip = (group, value, label, active) => `<button type="button" class="filter-chip${active ? ' is-active' : ''}" data-filter="${group}" data-value="${esc(value)}">${esc(label)}</button>`;
  const renderChips = () => {
    $('#chips-locality').innerHTML = chip('locality', '', 'Toda la zona', !f.locality) +
      meta.localities.map((l) => chip('locality', l, l, f.locality === l)).join('');
    $('#chips-category').innerHTML = chip('category', '', 'Todas', !f.category) +
      meta.categories.map((c) => chip('category', c, c, f.category === c)).join('');
    $('#chips-modality').innerHTML = chip('modality', '', 'Todas', !f.modality) +
      meta.modalities.map((m) => chip('modality', m, m, f.modality === m)).join('');
    $('#chips-type').innerHTML = chip('type', '', 'Todos', !f.type) +
      meta.types.map((t) => chip('type', t, t, f.type === t)).join('');
    $('#chips-extra').innerHTML = chip('withSalary', f.withSalary ? '' : '1', 'Con sueldo publicado', !!f.withSalary) +
      chip('gig', f.gig ? '' : '1', 'Solo changas', !!f.gig);
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      f[b.dataset.filter] = b.dataset.value;
      renderChips();
      load(true);
    }));
  };
  renderChips();

  let page = 1; let pages = 1;
  const results = $('#results');

  async function load(reset) {
    if (reset) {
      page = 1;
      results.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px;margin-top:12px"></div>';
    }
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, locality: f.locality, category: f.category, type: f.type, modality: f.modality, withSalary: f.withSalary, gig: f.gig })) if (v) p.set(k, v);
    if (f.sort !== 'recent') p.set('sort', f.sort);
    p.set('page', String(page)); p.set('limit', '8');
    try {
      const data = await api(`/api/jobs?${p}`);
      pages = data.pages;
      const saved = new Set(data.saved || []);
      $('#results-count').textContent = data.total === 1 ? '1 oferta encontrada' : `${data.total} ofertas encontradas`;
      const html = data.jobs.map((j) => jobRow(j, saved.has(j.id))).join('');
      if (reset) results.innerHTML = html || `<div class="empty"><h3>No encontramos ofertas</h3><p>Probá con otras palabras o quitá algunos filtros.</p></div>`;
      else results.insertAdjacentHTML('beforeend', html);
      $('#load-more-wrap').hidden = page >= pages;
      history.replaceState(null, '', `/buscar${p.toString() ? '?' + p : ''}`);
      bindSaves();
    } catch (err) {
      results.innerHTML = `<div class="empty"><h3>Error al buscar</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function bindSaves() {
    $$('[data-save]').forEach((b) => b.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const { saved } = await api(`/api/candidate/saved/${b.dataset.save}`, { method: 'POST' });
        b.classList.toggle('is-on', saved);
        toast(saved ? 'Guardaste la oferta' : 'Quitada de guardadas', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    }));
  }

  $('[data-filters-toggle]')?.addEventListener('click', () => {
    const box = $('#filters-box');
    box.classList.toggle('is-open');
  });
  $('#filters-form')?.addEventListener('submit', (e) => { e.preventDefault(); f.q = $('#f-q').value.trim(); load(true); });
  $('#f-q').addEventListener('search', () => { f.q = $('#f-q').value.trim(); load(true); });
  $('#f-sort').addEventListener('change', () => { f.sort = $('#f-sort').value; load(true); });
  $('#clear-filters')?.addEventListener('click', () => {
    Object.assign(f, { q: '', locality: '', category: '', type: '', modality: '', sort: 'recent', withSalary: '', gig: '' });
    $('#f-q').value = ''; $('#f-sort').value = 'recent';
    renderChips(); load(true);
  });
  $('#load-more')?.addEventListener('click', () => { page += 1; load(false); });
  $('#save-alert')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      const { alert } = await api('/api/candidate/alerts', { method: 'POST', body: { q: f.q, locality: f.locality, category: f.category, type: f.type, modality: f.modality, gig: !!f.gig } });
      toast(`Alerta creada: ${alert.label}. Te avisamos en la campanita.`, 'ok');
      btn.disabled = true;
    } catch (err) { toast(err.message, 'err'); }
  });
  await load(true);
}

/* ================================================================== */
/* DETALLE DE OFERTA                                                  */
/* ================================================================== */
/* sueldo grande arriba del botón de postulación */
function detailPayHtml(job) {
  if (job.salaryMin > 0) {
    const label = nbMoney(String(job.salaryLabel || '').replace(/ por (mes|día|hora)$/, ''));
    return `<div class="detail-pay"><b>${esc(label)}</b><span>${esc(PERIOD_WORD[job.salaryPeriod] || '')}${job.gig ? ' · changa' : ''}</span></div>`;
  }
  return job.salaryLabel || job.salary ? `<div class="detail-pay is-text"><span>Remuneración</span><b>${esc(job.salaryLabel || job.salary)}</b></div>` : '';
}

/* compatibilidad explicada (sólo personas logueadas) */
function matchBoxHtml(job) {
  const u = state.user;
  if (!u) return '<p class="match-box is-guest"><a href="/acceder?rol=empleado">Ingresá</a> para ver qué tan compatible sos con este puesto.</p>';
  if (u.role !== 'candidate') return '';
  const m = job.match;
  if (!m) return '<p class="match-box is-guest">Completá tus habilidades y tu localidad en <a href="/mi-perfil">tu perfil</a> para ver qué tan compatible sos.</p>';
  return `<div class="match-box">
    <div class="match-box-head">${matchPill(m)}</div>
    ${m.reasons.length ? `<ul class="match-why">${m.reasons.map((r) => `<li>${icon('check', 14)}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
    ${m.missing.length ? `<p class="match-missing">Te faltaría: ${m.missing.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
  </div>`;
}

/* qué tan rápido responde la empresa */
function responseHtml(r) {
  if (!r) return '';
  const slow = r.rate < 50 || r.days > 7;
  const days = r.days <= 1 ? 'en 1 día' : `en ${r.days} días`;
  return `<p class="response-line"><span class="response-badge${slow ? ' is-slow' : ''}">Responde el ${r.rate}%</span> <span class="muted">Suele responder ${days}</span></p>`;
}

async function initJob() {
  const id = location.pathname.split('/').pop();
  const view = $('#job-view');
  try {
    const { job, canApply, applied, saved } = await api(`/api/jobs/${id}`);
    document.title = `${job.title} · Workuco`;
    $('#crumb-job').textContent = job.title;
    const list = (txt) => String(txt || '').split('\n').map((s) => s.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
    const reqs = list(job.requirements);
    const resps = list(job.responsibilities);
    const gallery = job.companyGallery || [];
    const slides = gallery.length ? gallery.map((src) =>
      `<div class="carousel-slide" style="background-image:url('${esc(src)}')"></div>`).join('')
      : `<div class="carousel-slide cover-fallback"><span>${esc(initials(job.companyName))}</span></div>`;

    view.innerHTML = `<div class="detail-grid">
      <article class="detail-main">
        <div class="detail-hero">
          <div class="carousel" data-carousel>
            <div class="carousel-track">${slides}</div>
            ${gallery.length > 1 ? `
              <button class="carousel-nav prev" type="button" data-dir="prev" aria-label="Anterior">${icon('left', 20)}</button>
              <button class="carousel-nav next" type="button" data-dir="next" aria-label="Siguiente">${icon('right', 20)}</button>
              <div class="carousel-dots">${gallery.map((_, i) => `<button class="carousel-dot${i === 0 ? ' is-active' : ''}" type="button" aria-label="Foto ${i + 1}"></button>`).join('')}</div>` : ''}
          </div>
          <div class="detail-head">
            ${logoHtml(job.companyName, job.companyLogo, 'logo-xl')}
            <div class="detail-head-info">
              <div class="job-meta">
                ${job.gig ? '<span class="badge badge-gig">Changa</span>' : job.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}
                <span class="badge badge-green">${esc(job.category)}</span>
                <span class="badge">${esc(job.locality)}</span>
                <span class="badge">${esc(job.modality)}</span>
              </div>
              <h1>${esc(job.title)}</h1>
              <div class="detail-company"><a href="/empresa/${job.companyId}">${esc(job.companyName)}</a>
                ${job.companyVerified ? `<span class="verified">${checkIcon} Empresa verificada</span>` : ''}
                <span class="dot-sep">·</span><span>${timeAgo(job.publishedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-block">
          <h2>De qué se trata</h2>
          <div class="prose">${esc(job.description)}</div>
        </div>
        ${resps.length ? `<div class="detail-block"><h2>Tu día a día</h2><ul class="check-list">${resps.map((r) => `<li>${icon('check', 15)}<span>${esc(r)}</span></li>`).join('')}</ul></div>` : ''}
        ${reqs.length ? `<div class="detail-block"><h2>Lo que pedimos</h2><ul class="check-list">${reqs.map((r) => `<li>${icon('check', 15)}<span>${esc(r)}</span></li>`).join('')}</ul></div>` : ''}
        ${(job.benefits || []).length ? `<div class="detail-block"><h2>Lo que ofrecemos</h2><div class="chips">${job.benefits.map((b) => `<span class="badge badge-benefit">${icon('check', 13)} ${esc(b)}</span>`).join('')}</div></div>` : ''}

        <div class="detail-block">
          <h2>Contacto</h2>
          <p>${job.contactEmail ? `<a href="mailto:${esc(job.contactEmail)}" class="link-inline">${esc(job.contactEmail)}</a>` : 'Postulate desde esta página y la empresa recibe tus datos.'}</p>
          ${job.contactPhone ? `<p class="muted" style="margin-top:4px">Teléfono: ${esc(job.contactPhone)}</p>` : ''}
        </div>
      </article>

      <aside class="detail-aside">
        <div class="aside-card apply-card">
          ${detailPayHtml(job)}
          ${!canApply
            ? '<div class="alert alert-info">Esta búsqueda ya cerró. Podés ver otras ofertas disponibles.</div><a class="btn btn-outline btn-block" href="/buscar" style="margin-top:12px">Ver otras ofertas</a>'
            : applied
              ? `<div class="applied-box">${icon('check', 20)}<div><strong>Ya te postulaste</strong><span>La empresa tiene tus datos.</span></div></div>
                 <a class="btn btn-outline btn-block" href="/mi-perfil" style="margin-top:12px">Ver mis postulaciones</a>`
              : `<button class="btn btn-primary btn-block btn-lg" type="button" id="open-apply">Postularme ${icon('arrow', 17)}</button>
                 <p class="aside-note">Postulación directa a la empresa.<br>Sin intermediarios.</p>
                 ${state.user && state.user.role === 'candidate' ? `<p class="profile-hint">Perfil completo al <strong>${profileCompleteness(state.user.candidate)}%</strong></p>` : ''}`}
          ${matchBoxHtml(job)}
          ${responseHtml(job.companyResponse)}
          <div class="aside-actions">
            ${state.user && state.user.role === 'candidate' ? `<button class="btn btn-ghost btn-sm${saved ? ' is-on' : ''}" type="button" id="save-job">${icon('heart', 16)} ${saved ? 'Guardada' : 'Guardar'}</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" id="share-job">${icon('external', 16)} Compartir</button>
          </div>
        </div>
        <div class="aside-card">
          <h3>Resumen del puesto</h3>
          <div class="kv"><span>Localidad</span><span>${esc(job.locality)}</span></div>
          <div class="kv"><span>Tipo de empleo</span><span>${esc(job.type)}</span></div>
          <div class="kv"><span>Modalidad</span><span>${esc(job.modality)}</span></div>
          <div class="kv"><span>Jornada</span><span>${esc(job.schedule || 'A convenir')}</span></div>
          <div class="kv"><span>Experiencia</span><span>${esc(job.experience || 'No excluyente')}</span></div>
          <div class="kv"><span>Remuneración</span><span>${esc(job.salaryLabel || job.salary || 'A convenir')}</span></div>
          ${job.gig ? `<div class="kv"><span>Empieza</span><span>${esc(fmtDay(job.startDate) || 'A coordinar')}</span></div><div class="kv"><span>Duración</span><span>${esc(job.duration || 'A coordinar')}</span></div>` : ''}
          ${job.positions > 1 ? `<div class="kv"><span>Puestos</span><span>${job.positions}</span></div>` : ''}
          <div class="kv"><span>Publicada</span><span>${fmtDate(job.publishedAt)}</span></div>
          ${job.closesAt ? `<div class="kv"><span>Cierra</span><span>${fmtDate(job.closesAt + 'T12:00:00')}</span></div>` : ''}
        </div>
        ${job.companyDescription ? `<div class="aside-card"><h3>Sobre la empresa</h3><p class="soft-text">${esc(job.companyDescription)}</p><a class="link-arrow" href="/empresa/${job.companyId}">Ver perfil de la empresa →</a></div>` : ''}
      </aside>
    </div>`;

    setupCarousel($('[data-carousel]', view));
    if (canApply && !applied) initApply(job);

    $('#save-job')?.addEventListener('click', async (e) => {
      try {
        const r = await api(`/api/candidate/saved/${job.id}`, { method: 'POST' });
        e.currentTarget.classList.toggle('is-on', r.saved);
        e.currentTarget.innerHTML = `${icon('heart', 16)} ${r.saved ? 'Guardada' : 'Guardar'}`;
        toast(r.saved ? 'Guardaste la oferta' : 'Quitada de guardadas', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#share-job')?.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: job.title, text: `${job.title} en ${job.companyName}`, url });
        else { await navigator.clipboard.writeText(url); toast('Link copiado', 'ok'); }
      } catch (_) {}
    });
  } catch (err) {
    view.innerHTML = `<div class="empty"><h3>Oferta no disponible</h3><p>${esc(err.message)}</p><a class="btn btn-outline" href="/buscar" style="margin-top:16px">Volver a buscar</a></div>`;
  }
}

function initApply(job) {
  const modal = $('#apply-modal');
  const form = $('#apply-form');
  const alertBox = $('#apply-alert');
  const candidate = state.user && state.user.role === 'candidate' ? state.user.candidate : null;
  $('#apply-job-title').textContent = job.title;

  if (candidate) {
    $('#apply-guest-fields').hidden = true;
    $('#apply-profile').hidden = false;
    const pct = profileCompleteness(candidate);
    $('#apply-profile').innerHTML = `<div class="apply-profile">
      ${avatarHtml(candidate.name, candidate.photo, 'avatar-lg')}
      <div><strong>${esc(candidate.name)}</strong><span>${esc(candidate.headline || 'Completá tu titular para destacar')}</span>
      <div class="profile-bar"><span style="width:${pct}%"></span></div><small>Perfil ${pct}% completo</small></div>
    </div>
    ${!candidate.hasCv ? `<p class="apply-warn">Tu perfil se envía completo. Si querés, sumá tu CV desde <a href="/mi-perfil">Mi perfil</a>.</p>` : ''}`;
  }

  const open = () => { modal.hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => ($('#a-message') || $('#a-name')).focus(), 80); };
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
  $('#open-apply').addEventListener('click', open);
  $$('[data-close-modal]', modal).forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = $('#apply-submit');
    const payload = { message: $('#a-message').value.trim() };
    if (!candidate) {
      payload.name = $('#a-name').value.trim();
      payload.email = $('#a-email').value.trim();
      payload.phone = $('#a-phone').value.trim();
      const cvInput = $('#a-cv');
      if (cvInput.files && cvInput.files[0]) {
        const file = cvInput.files[0];
        if (!/\.pdf$/i.test(file.name)) { setFieldErrors(form, { cv: 'El archivo debe ser un PDF' }); return; }
        if (file.size > 4 * 1024 * 1024) { setFieldErrors(form, { cv: 'El PDF supera los 4 MB' }); return; }
        payload.cv = { name: file.name, data: await fileToBase64(file) };
      }
    }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await api(`/api/jobs/${job.id}/apply`, { method: 'POST', body: payload });
      modal.querySelector('.modal').innerHTML = `<div class="modal-success">
        <div class="success-ring">${icon('check', 30)}</div>
        <h2>Postulación enviada</h2>
        <p>${candidate ? 'La empresa ya recibió tu perfil.' : 'La empresa recibió tus datos.'} Si les interesa, se van a contactar con vos.</p>
        ${!candidate ? `<p class="soft-text">Creá tu perfil para postularte en un toque la próxima vez.</p><a class="btn btn-primary" href="/acceder?rol=empleado&modo=registro&next=/mi-perfil">Crear mi perfil</a>` : '<a class="btn btn-primary" href="/mi-perfil">Ver mis postulaciones</a>'}
        <button class="btn btn-ghost" type="button" data-close-modal>Listo</button>
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

/* ================================================================== */
/* PUBLICAR — wizard                                                  */
/* ================================================================== */
const PUBLISH_TEMPLATES = {
  atencion: {
    description: 'Buscamos una persona para sumarse al equipo de atención al público. El puesto combina trato con clientes, organización del local y tareas de caja.\n\nNos importa la buena predisposición, la puntualidad y las ganas de aprender. Trabajamos en un equipo chico, con acompañamiento diario.',
    responsibilities: ['Atender a los clientes y resolver consultas', 'Manejar la caja y cerrar el turno', 'Mantener el orden del local', 'Reponer mercadería'],
    requirements: ['Buena comunicación', 'Disponibilidad los fines de semana', 'Secundario completo'],
  },
  produccion: {
    description: 'Incorporamos una persona para el área de producción. El trabajo es en equipo, con tareas concretas y supervisión cercana.\n\nValoramos la responsabilidad, el cuidado de las herramientas y el cumplimiento de las normas de seguridad.',
    responsibilities: ['Ejecutar las tareas de producción asignadas', 'Controlar la calidad del trabajo', 'Cuidar herramientas y materiales', 'Registrar lo producido en el día'],
    requirements: ['Experiencia previa en tareas similares', 'Puntualidad y trabajo en equipo', 'Cumplir normas de seguridad'],
  },
  admin: {
    description: 'Buscamos una persona para tareas administrativas y de organización. El puesto es de oficina, con contacto con clientes y proveedores.\n\nSe trabaja con herramientas simples y se valora el orden, la prolijidad y la confidencialidad.',
    responsibilities: ['Cargar y archivar documentación', 'Atender consultas por teléfono y correo', 'Realizar seguimiento de pagos y facturas', 'Apoyar la organización general'],
    requirements: ['Manejo de Excel y correo', 'Buena redacción', 'Experiencia administrativa deseable'],
  },
};

async function initPublish() {
  const meta = await loadMeta();
  const user = await loadMe();
  const gate = $('#publish-gate');
  const app = $('#publish-app');

  if (!user || user.role !== 'company') {
    gate.hidden = false;
    gate.innerHTML = `<div class="card gate-card">
      ${user && user.role === 'candidate'
        ? `<h1>Estás con tu cuenta de persona</h1><p>Para publicar una búsqueda necesitás una cuenta de empresa. Podés crear otra cuenta o volver a tu perfil.</p>
           <div class="gate-actions"><a class="btn btn-primary" href="/acceder?rol=empresa&modo=registro&next=/publicar">Crear cuenta de empresa</a><a class="btn btn-outline" href="/mi-perfil">Ir a mi perfil</a></div>`
        : `<h1>Publicá tu búsqueda laboral</h1><p>Creá una cuenta de empresa gratis y publicá en minutos. Vas a poder ver postulantes, ordenarlos y contactarlos desde un solo panel.</p>
           <div class="gate-actions"><a class="btn btn-primary" href="/acceder?rol=empresa&modo=registro&next=/publicar">Crear cuenta de empresa</a><a class="btn btn-outline" href="/acceder?rol=empresa&next=/publicar">Ya tengo cuenta</a></div>`}
    </div>`;
    return;
  }
  gate.hidden = true;
  app.hidden = false;

  const editId = new URLSearchParams(location.search).get('edit');
  let editing = null;
  if (editId) {
    try {
      const { jobs } = await api('/api/company/jobs');
      editing = jobs.find((j) => j.id === editId);
    } catch (_) {}
    if (editing) {
      document.title = 'Editar empleo · Workuco';
      $('.app-head h1').textContent = 'Editar empleo';
      $('.app-head p').textContent = 'Al guardar, la publicación vuelve a revisión.';
      $('#job-submit').textContent = 'Guardar y reenviar';
    }
  }

  const s = {
    step: 1,
    title: editing ? editing.title : '',
    category: editing ? editing.category : '',
    locality: editing ? editing.locality : '',
    modality: editing ? editing.modality : '',
    type: editing ? editing.type : '',
    positions: editing ? (editing.positions || 1) : 1,
    description: editing ? editing.description : '',
    responsibilities: editing ? String(editing.responsibilities || '').split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean) : [],
    requirements: editing ? String(editing.requirements || '').split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean) : [],
    experience: editing ? (editing.experience || '') : '',
    schedule: editing ? (editing.schedule || '') : '',
    salary: editing ? (editing.salary || '') : '',
    benefits: editing ? (editing.benefits || []) : [],
    closesAt: editing ? (editing.closesAt || '') : '',
    contactEmail: editing ? (editing.contactEmail || user.company.email) : user.company.email,
    contactPhone: editing ? (editing.contactPhone || '') : (user.company.phone || ''),
  };
  $('#j-title').value = s.title;
  $('#j-description').value = s.description;
  $('#j-experience').value = s.experience;
  $('#j-schedule').value = s.schedule;
  $('#j-salary').value = s.salary;
  $('#j-closes').value = s.closesAt;
  $('#j-contact-email').value = s.contactEmail;
  $('#j-contact-phone').value = s.contactPhone;
  $('#j-positions').textContent = String(s.positions);

  /* --- render de opciones visuales --- */
  $('#cat-tiles').innerHTML = meta.categories.map((c) =>
    `<button type="button" class="pick-tile${s.category === c ? ' is-active' : ''}" data-cat="${esc(c)}">
      <span class="pick-icon">${icon(catIcon(c), 19)}</span><span>${esc(c)}</span></button>`).join('');
  $('#loc-cards').innerHTML = meta.localities.map((l) =>
    `<button type="button" class="pick-card${s.locality === l ? ' is-active' : ''}" data-loc="${esc(l)}">
      ${icon('pin', 20)}<span><strong>${esc(l)}</strong><small>Valle de Uco</small></span></button>`).join('');
  $('#mod-cards').innerHTML = meta.modalities.map((m) =>
    `<button type="button" class="pick-card pick-compact${s.modality === m ? ' is-active' : ''}" data-mod="${esc(m)}">
      ${icon(m === 'Remoto' ? 'settings' : m === 'Híbrido' ? 'chart' : 'building', 18)}<span><strong>${esc(m)}</strong></span></button>`).join('');
  $('#type-chips').innerHTML = meta.types.map((t) =>
    `<button type="button" class="filter-chip${s.type === t ? ' is-active' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('');
  $('#exp-chips').innerHTML = ['No excluyente', 'Sin experiencia', '6 meses', '1 año', '2 años', '3 años o más']
    .map((x) => `<button type="button" class="filter-chip${s.experience === x ? ' is-active' : ''}" data-exp="${esc(x)}">${esc(x)}</button>`).join('');
  $('#sched-chips').innerHTML = ['Lunes a viernes 8 a 17 h', 'Lunes a sábado', 'Turnos rotativos', 'Medio tiempo', 'Fines de semana', 'Horario flexible']
    .map((x) => `<button type="button" class="filter-chip${s.schedule === x ? ' is-active' : ''}" data-sched="${esc(x)}">${esc(x)}</button>`).join('');
  $('#salary-chips').innerHTML = ['A convenir', '$ 500.000', '$ 800.000', '$ 1.000.000', 'Según experiencia']
    .map((x) => `<button type="button" class="filter-chip" data-salary="${esc(x)}">${esc(x)}</button>`).join('');
  $('#benefit-chips').innerHTML = meta.benefits.map((b) =>
    `<button type="button" class="filter-chip${s.benefits.includes(b) ? ' is-active' : ''}" data-benefit="${esc(b)}">${icon('plus', 13)} ${esc(b)}</button>`).join('');

  const rerender = () => {
    $$('[data-cat]').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === s.category));
    $$('[data-loc]').forEach((b) => b.classList.toggle('is-active', b.dataset.loc === s.locality));
    $$('[data-mod]').forEach((b) => b.classList.toggle('is-active', b.dataset.mod === s.modality));
    $$('[data-type]').forEach((b) => b.classList.toggle('is-active', b.dataset.type === s.type));
    $$('[data-exp]').forEach((b) => b.classList.toggle('is-active', b.dataset.exp === s.experience));
    $$('[data-sched]').forEach((b) => b.classList.toggle('is-active', b.dataset.sched === s.schedule));
    $$('[data-benefit]').forEach((b) => b.classList.toggle('is-active', s.benefits.includes(b.dataset.benefit)));
  };
  $('#pos-minus').addEventListener('click', () => { s.positions = Math.max(1, s.positions - 1); $('#j-positions').textContent = String(s.positions); });
  $('#pos-plus').addEventListener('click', () => { s.positions = Math.min(99, s.positions + 1); $('#j-positions').textContent = String(s.positions); });
  $$('[data-title-suggest]').forEach((b) => b.addEventListener('click', () => {
    $('#j-title').value = b.dataset.titleSuggest;
    s.title = b.dataset.titleSuggest;
  }));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat],[data-loc],[data-mod],[data-type],[data-exp],[data-sched],[data-salary],[data-benefit]');
    if (!t) return;
    if (t.dataset.cat !== undefined) s.category = t.dataset.cat;
    if (t.dataset.loc !== undefined) s.locality = t.dataset.loc;
    if (t.dataset.mod !== undefined) s.modality = t.dataset.mod;
    if (t.dataset.type !== undefined) s.type = t.dataset.type;
    if (t.dataset.exp !== undefined) s.experience = t.dataset.exp;
    if (t.dataset.sched !== undefined) { s.schedule = t.dataset.sched; $('#j-schedule').value = s.schedule; }
    if (t.dataset.salary !== undefined) { s.salary = t.dataset.salary; $('#j-salary').value = s.salary; }
    if (t.dataset.benefit !== undefined) {
      s.benefits = s.benefits.includes(t.dataset.benefit) ? s.benefits.filter((b) => b !== t.dataset.benefit) : [...s.benefits, t.dataset.benefit];
    }
    rerender();
  });

  /* --- editores de listas --- */
  function listEditor(listEl, arr, placeholder) {
    const render = () => {
      listEl.innerHTML = arr.length ? arr.map((x, i) =>
        `<li class="chip-item"><span>${esc(x)}</span><button type="button" data-remove="${i}" aria-label="Quitar">${icon('x', 13)}</button></li>`).join('')
        : `<li class="chip-empty">${esc(placeholder)}</li>`;
      $$('[data-remove]', listEl).forEach((b) => b.addEventListener('click', () => {
        arr.splice(Number(b.dataset.remove), 1); render();
      }));
    };
    render();
    return render;
  }
  const renderResp = listEditor($('#resp-list'), s.responsibilities, 'Agregá tareas concretas del puesto.');
  const renderReq = listEditor($('#req-list'), s.requirements, 'Agregá requisitos o experiencia deseada.');
  const addToList = (input, arr, render) => {
    const v = input.value.trim();
    if (!v) return;
    arr.push(v.slice(0, 120)); input.value = '';
    render();
  };
  $('#resp-add').addEventListener('click', () => addToList($('#resp-input'), s.responsibilities, renderResp));
  $('#resp-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addToList(e.target, s.responsibilities, renderResp); } });
  $('#req-add').addEventListener('click', () => addToList($('#req-input'), s.requirements, renderReq));
  $('#req-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addToList(e.target, s.requirements, renderReq); } });

  $$('[data-template]').forEach((b) => b.addEventListener('click', () => {
    const t = PUBLISH_TEMPLATES[b.dataset.template];
    if (!t) return;
    s.description = t.description;
    s.responsibilities = [...t.responsibilities];
    s.requirements = [...t.requirements];
    $('#j-description').value = s.description;
    renderResp(); renderReq();
    toast('Plantilla aplicada. Podés editarla.', 'ok');
  }));

  $('#btn-ai').addEventListener('click', async () => {
    const btn = $('#btn-ai');
    btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = `${icon('sparkles', 16)} Generando…`;
    try {
      const { draft } = await api('/api/company/ai/describe', { method: 'POST', body: {
        title: $('#j-title').value.trim() || s.title, category: s.category, locality: s.locality,
        modality: s.modality, type: s.type, benefits: s.benefits, positions: s.positions,
        notes: $('#j-description').value.trim(),
      } });
      if (draft.description) { s.description = draft.description; $('#j-description').value = draft.description; }
      if (draft.responsibilities.length) { s.responsibilities = draft.responsibilities; renderResp(); }
      if (draft.requirements.length) { s.requirements = draft.requirements; renderReq(); }
      if (draft.experience) { s.experience = draft.experience; $('#j-experience').value = s.experience; }
      if (draft.schedule) { s.schedule = draft.schedule; $('#j-schedule').value = s.schedule; }
      if (draft.salary) { s.salary = draft.salary; $('#j-salary').value = s.salary; }
      toast('Listo: revisá el texto y ajustá lo que quieras.', 'ok');
    } catch (err) {
      toast(err.message + ' — Configurala en Panel → IA.', 'err');
    } finally { btn.disabled = false; btn.innerHTML = old; }
  });

  /* --- pasos --- */
  const steps = $$('.wizard-step');
  const showStep = (n) => {
    s.step = Math.max(1, Math.min(steps.length, n));
    steps.forEach((el) => { el.hidden = Number(el.dataset.step) !== s.step; });
    $$('.wizard-dot').forEach((d, i) => {
      d.classList.toggle('is-active', i + 1 === s.step);
      d.classList.toggle('is-done', i + 1 < s.step);
    });
    $('#wizard-progress').style.width = `${((s.step - 1) / (steps.length - 1)) * 100}%`;
    $('#step-label').textContent = $('.wizard-step:not([hidden]) .wizard-step-title')?.textContent || '';
    $('#wizard-back').hidden = s.step === 1;
    $('#wizard-next').hidden = s.step === steps.length;
    window.scrollTo({ top: $('#publish-app').offsetTop - 90, behavior: 'smooth' });
    if (s.step === steps.length) renderPreview();
  };

  const validateStep = () => {
    hideAlert($('#publish-alert'));
    if (s.step === 1) {
      s.title = $('#j-title').value.trim();
      const errs = {};
      if (s.title.length < 5) errs.title = 'Escribí un nombre de puesto (mínimo 5 letras)';
      if (!s.category) errs.category = 'Elegí una categoría';
      if (!s.locality) errs.locality = 'Elegí la localidad';
      if (!s.modality) errs.modality = 'Elegí la modalidad';
      if (!s.type) errs.type = 'Elegí el tipo de empleo';
      if (Object.keys(errs).length) {
        showAlert($('#publish-alert'), Object.values(errs)[0], 'error');
        setFieldErrors($('#job-form'), errs);
        return false;
      }
    }
    if (s.step === 2) {
      s.description = $('#j-description').value.trim();
      if (s.description.length < 60) {
        showAlert($('#publish-alert'), 'Contá un poco más del puesto (mínimo 60 caracteres). Podés usar una plantilla o la IA.', 'error');
        $('#j-description').focus();
        return false;
      }
    }
    if (s.step === 4) {
      s.contactEmail = $('#j-contact-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.contactEmail)) {
        showAlert($('#publish-alert'), 'Revisá el email de contacto.', 'error');
        $('#j-contact-email').focus();
        return false;
      }
    }
    return true;
  };

  $('#wizard-next').addEventListener('click', () => { if (validateStep()) showStep(s.step + 1); });
  $('#wizard-back').addEventListener('click', () => showStep(s.step - 1));
  $$('.wizard-dot').forEach((d) => d.addEventListener('click', () => {
    const n = Number(d.dataset.step);
    if (n < s.step || validateStep()) showStep(n);
  }));

  function renderPreview() {
    s.contactEmail = $('#j-contact-email').value.trim();
    s.contactPhone = $('#j-contact-phone').value.trim();
    $('#job-preview').innerHTML = `<div class="preview-card">
      <div class="preview-cover"><span>Así se va a ver tu aviso</span></div>
      <div class="preview-body">
        ${logoHtml(user.company.name, user.company.logo, 'logo')}
        <div><div class="job-title">${esc(s.title)}</div><div class="job-company">${esc(user.company.name)} ${user.company.verified ? `<span class="verified">${checkIcon}</span>` : ''}</div></div>
        <div class="job-meta"><span class="badge">${esc(s.locality)}</span><span class="badge">${esc(s.modality)}</span><span class="badge">${esc(s.category)}</span></div>
        <p class="preview-desc">${esc(s.description).slice(0, 240)}${s.description.length > 240 ? '…' : ''}</p>
        <div class="job-foot"><span class="job-salary">${esc(s.salary || 'A convenir')}</span><span>${s.positions > 1 ? `${s.positions} puestos` : '1 puesto'}</span></div>
      </div>
    </div>`;
  }

  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    const btn = $('#job-submit');
    const body = {
      title: s.title, locality: s.locality, category: s.category, type: s.type, modality: s.modality,
      description: s.description,
      responsibilities: s.responsibilities.join('\n'), requirements: s.requirements.join('\n'),
      experience: $('#j-experience').value.trim(), schedule: $('#j-schedule').value.trim(),
      salary: $('#j-salary').value.trim(), contactEmail: s.contactEmail,
      contactPhone: s.contactPhone, closesAt: $('#j-closes').value,
      benefits: s.benefits, positions: s.positions,
    };
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (editing) await api(`/api/company/jobs/${editing.id}`, { method: 'PUT', body });
      else await api('/api/company/jobs', { method: 'POST', body });
      app.innerHTML = `<div class="card success-card">
        <div class="success-ring">${icon('check', 32)}</div>
        <h1>${editing ? 'Cambios enviados' : 'Publicación enviada'}</h1>
        <p>Quedó pendiente de aprobación. Cuando la revisemos, aparece en las búsquedas y te avisamos en el panel.</p>
        <div class="gate-actions"><a class="btn btn-primary" href="/panel">Ir a mi panel</a><a class="btn btn-outline" href="/publicar">Publicar otra</a></div>
      </div>`;
    } catch (err) {
      showAlert($('#publish-alert'), err.message, 'error');
      setFieldErrors($('#job-form'), err.fields);
      btn.disabled = false; btn.textContent = editing ? 'Guardar y reenviar' : 'Enviar para revisión';
    }
  });

  showStep(1);
}

/* ================================================================== */
/* ACCESO                                                             */
/* ================================================================== */
async function initAuth() {
  const params = new URLSearchParams(location.search);
  const role = params.get('rol') === 'empresa' ? 'company' : (params.get('rol') === 'empleado' ? 'candidate' : '');
  const next = params.get('next') || '';
  const isRegister = params.get('modo') === 'registro';
  const alertBox = $('#auth-alert');
  const loginForm = $('#login-form');
  const regForm = $('#register-form');
  const tabLogin = $('#tab-login');
  const tabReg = $('#tab-register');

  if (state.user) {
    const u = state.user;
    $('#auth-box').innerHTML = `<div class="auth-logged">
      <div class="success-ring">${icon('check', 26)}</div>
      <h1>Ya estás con tu cuenta</h1>
      <p>${u.role === 'candidate' ? esc(u.candidate.name) : u.role === 'company' ? esc(u.company.name) : 'Administración'}</p>
      <div class="gate-actions">
        <a class="btn btn-primary" href="${u.role === 'candidate' ? '/mi-perfil' : u.role === 'company' ? '/panel' : '/admin'}">Ir a mi panel</a>
        <button class="btn btn-outline" type="button" data-logout>Cerrar sesión</button>
      </div>
    </div>`;
    return;
  }

  let currentRole = role || '';
  const chooseRole = (r) => {
    currentRole = r;
    $$('[data-role]').forEach((b) => b.classList.toggle('is-active', b.dataset.role === r));
    $('#auth-forms').hidden = !r;
    $('#auth-title').textContent = r === 'candidate' ? 'Tu cuenta de trabajo' : 'Tu cuenta de empresa';
    $('#auth-sub').textContent = r === 'candidate'
      ? 'Postulate en un toque y seguí tus postulaciones.'
      : 'Publicá búsquedas y gestioná postulantes.';
    $('#r-locality-wrap').hidden = r !== 'candidate';
    $('#r-name-label').textContent = r === 'candidate' ? 'Nombre y apellido' : 'Nombre de la empresa';
    $('#l-email-label').textContent = r === 'candidate' ? 'Email personal' : 'Email de la empresa';
    setTab(isRegister ? 'register' : 'login');
  };

  const setTab = (mode) => {
    tabLogin.classList.toggle('is-active', mode === 'login');
    tabReg.classList.toggle('is-active', mode === 'register');
    tabLogin.setAttribute('aria-selected', String(mode === 'login'));
    tabReg.setAttribute('aria-selected', String(mode === 'register'));
    loginForm.hidden = mode !== 'login';
    regForm.hidden = mode !== 'register';
    hideAlert(alertBox);
  };
  tabLogin.addEventListener('click', () => setTab('login'));
  tabReg.addEventListener('click', () => setTab('register'));
  $$('[data-role]').forEach((b) => b.addEventListener('click', () => chooseRole(b.dataset.role)));

  if (!role) {
    $('#role-picker').hidden = false;
    $('#auth-forms').hidden = true;
    $('#auth-title').textContent = '¿Cómo querés entrar?';
    $('#auth-sub').textContent = 'Elegí tu tipo de cuenta para empezar.';
    return;
  }
  $('#role-picker').hidden = true;
  chooseRole(role);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = $('#login-submit');
    btn.disabled = true; btn.textContent = 'Ingresando…';
    try {
      await api('/api/auth/login', { method: 'POST', body: {
        role: currentRole, email: $('#l-email').value.trim(), password: $('#l-pass').value,
      } });
      location.href = next || (currentRole === 'candidate' ? '/mi-perfil' : '/panel');
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = $('#register-submit');
    btn.disabled = true; btn.textContent = 'Creando cuenta…';
    try {
      await api('/api/auth/register', { method: 'POST', body: {
        role: currentRole,
        name: $('#r-name').value.trim(),
        email: $('#r-email').value.trim(),
        phone: $('#r-phone').value.trim(),
        password: $('#r-pass').value,
        locality: currentRole === 'candidate' ? $('#r-locality').value : '',
      } });
      location.href = next || (currentRole === 'candidate' ? '/mi-perfil' : '/panel');
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setFieldErrors(regForm, err.fields);
      btn.disabled = false; btn.textContent = 'Crear cuenta';
    }
  });
}

/* ================================================================== */
/* EMPRESAS                                                           */
/* ================================================================== */
async function initCompanies() {
  state.user = state.user || await loadMe();
  const grid = $('#companies-grid');
  try {
    const { companies } = await api('/api/companies');
    const cta = `<a class="company-card company-cta" href="/publicar">
      <div class="company-cta-inner">
        <span class="company-cta-icon">${icon('building', 26)}</span>
        <h3>¿Tenés una empresa?</h3>
        <p>Publicá tu búsqueda gratis y sumá tu logo y fotos.</p>
        <span class="btn btn-outline btn-sm">Publicar empleo ${icon('arrow', 14)}</span>
      </div>
    </a>`;
    grid.innerHTML = (companies.length ? companies.map((c) => `<a class="company-card" href="/empresa/${c.id}">
      <div class="company-cover${c.gallery[0] ? ' has-img' : ''}"${c.gallery[0] ? ` style="background-image:url('${esc(c.gallery[0])}')"` : ''}></div>
      <div class="company-card-body">
        ${logoHtml(c.name, c.logo, 'logo-lg')}
        <div>
          <div class="company-name">${esc(c.name)} ${c.verified ? `<span class="verified">${checkIcon}</span>` : ''}</div>
          <div class="company-meta">${esc(c.locality || 'Valle de Uco')} · ${c.jobs} ${c.jobs === 1 ? 'búsqueda abierta' : 'búsquedas abiertas'}</div>
        </div>
        <p class="company-desc">${esc(c.description || '')}</p>
      </div>
    </a>`).join('') : '<div class="empty" style="grid-column:1/-1"><h3>Todavía no hay empresas publicando</h3><p>Volvé pronto.</p></div>') + cta;
  } catch (err) {
    grid.innerHTML = `<div class="empty"><h3>No pudimos cargar las empresas</h3><p>${esc(err.message)}</p></div>`;
  }
}

async function initCompanyPage() {
  state.user = state.user || await loadMe();
  const id = location.pathname.split('/').pop();
  const view = $('#company-view');
  try {
    const { company, jobs } = await api(`/api/companies/${id}`);
    document.title = `${company.name} · Workuco`;
    const gallery = company.gallery || [];
    view.innerHTML = `
      <div class="company-hero">
        <div class="carousel company-carousel" data-carousel>
          <div class="carousel-track">${gallery.length
            ? gallery.map((src) => `<div class="carousel-slide" style="background-image:url('${esc(src)}')"></div>`).join('')
            : `<div class="carousel-slide cover-fallback"><span>${esc(initials(company.name))}</span></div>`}</div>
          ${gallery.length > 1 ? `<button class="carousel-nav prev" type="button" data-dir="prev">${icon('left', 20)}</button>
            <button class="carousel-nav next" type="button" data-dir="next">${icon('right', 20)}</button>
            <div class="carousel-dots">${gallery.map((_, i) => `<button class="carousel-dot${i === 0 ? ' is-active' : ''}" type="button"></button>`).join('')}</div>` : ''}
        </div>
        <div class="company-hero-info container">
          ${logoHtml(company.name, company.logo, 'logo-xxl')}
          <div>
            <h1>${esc(company.name)} ${company.verified ? `<span class="verified">${checkIcon}</span>` : ''}</h1>
            <div class="company-meta">${icon('pin', 15)} ${esc(company.locality || 'Valle de Uco')} · ${jobs.length} ${jobs.length === 1 ? 'búsqueda abierta' : 'búsquedas abiertas'}</div>
          </div>
        </div>
      </div>
      <div class="company-content">
        <div class="company-about">
          <h2>Sobre la empresa</h2>
          <p class="soft-text">${esc(company.description || 'Todavía no completó su descripción.')}</p>
          ${company.website ? `<a class="link-arrow" href="${esc(company.website)}" target="_blank" rel="noopener">Sitio web ${icon('external', 14)}</a>` : ''}
        </div>
        <h2 class="section-title">Búsquedas abiertas</h2>
        <div class="jobs-grid">${jobs.length ? jobs.map((j) => jobCard({ ...j, companyName: company.name, companyLogo: company.logo, companyVerified: company.verified, companyGallery: gallery })).join('')
          : '<div class="empty" style="grid-column:1/-1"><h3>No hay búsquedas abiertas</h3><p>Seguí esta empresa para ver novedades.</p></div>'}</div>
      </div>`;
    setupCarousel($('[data-carousel]', view));
  } catch (err) {
    view.innerHTML = `<div class="empty"><h3>Empresa no encontrada</h3><p>${esc(err.message)}</p><a class="btn btn-outline" href="/empresas" style="margin-top:16px">Ver empresas</a></div>`;
  }
}

/* ================================================================== */
/* INFO                                                               */
/* ================================================================== */
const INFO = {
  acerca: `<h1>Acerca de Workuco</h1>
    <p class="lead">Workuco es el portal de empleo del Valle de Uco, pensado para conectar a quienes buscan trabajo con las empresas y emprendimientos de San Carlos, Tunuyán y Tupungato.</p>
    <p>La plataforma centraliza búsquedas laborales que antes se dispersaban en grupos de WhatsApp, carteles y contactos personales. Del lado de las empresas, permite publicar una búsqueda en minutos y recibir postulaciones ordenadas. Del lado de las personas, permite crear un perfil con foto y CV, y postularse en un toque.</p>
    <h2>Cómo funciona</h2>
    <ul><li>Las empresas crean una cuenta y publican su búsqueda.</li><li>El equipo de Workuco revisa cada publicación antes de que sea visible.</li><li>Las personas crean su perfil y se postulan con un toque.</li><li>La empresa recibe las postulaciones en su panel, las ordena por etapa y decide a quién contactar.</li></ul>
    <h2>Gratis para empezar</h2>
    <p>Publicar y postularse es gratuito. Más adelante vamos a sumar opciones para destacar búsquedas y planes para empresas que publican con frecuencia, sin cambiar lo que ya funciona.</p>`,
  contacto: `<h1>Contacto</h1>
    <p class="lead">¿Tenés una consulta sobre una oferta, tu cuenta o una publicación?</p>
    <div class="info-card"><h2 style="margin-top:0">Escribinos</h2>
      <p>Email: <a href="mailto:hola@workuco.com.ar" class="link-inline">hola@workuco.com.ar</a></p>
      <p>Horario de atención: lunes a viernes de 9 a 18 h.</p>
      <p>También podés escribirnos desde la cuenta de empresa que creaste; respondemos dentro de las 24 horas hábiles.</p>
    </div>
    <h2>Para empresas</h2>
    <p>Si necesitás ayuda para publicar tu primera búsqueda, escribinos con el asunto “Publicar empleo” y te acompañamos.</p>`,
  faq: `<h1>Preguntas frecuentes</h1>
    <h2>¿Publicar tiene costo?</h2><p>No. Publicar una búsqueda y postularse son gratuitos. En el futuro habrá opciones pagas para destacar ofertas, pero el uso básico va a seguir siendo gratis.</p>
    <h2>¿Cuánto tarda en aprobarse una publicación?</h2><p>Revisamos las publicaciones dentro de las 24 horas hábiles. Si falta información, la rechazamos con un motivo para que puedas corregirla y reenviarla.</p>
    <h2>¿Necesito CV para postularme?</h2><p>No es obligatorio. Podés cargar tu CV en tu perfil (PDF de hasta 4 MB) y postularte en un toque, o postularte solo con tus datos.</p>
    <h2>¿Qué es el análisis con IA?</h2><p>Es una ayuda opcional para empresas: ordena y resume los CV recibidos. La empresa conecta su propia API de IA y puede activarla o desactivarla cuando quiera. Workuco no usa tus datos para entrenar modelos.</p>
    <h2>¿Quién ve mis datos?</h2><p>Solo la empresa a la que te postulás y el equipo de administración de Workuco. No vendemos datos ni los compartimos con terceros.</p>
    <h2>¿Puedo postularme a la misma oferta dos veces?</h2><p>No. El sistema toma tu email como referencia para evitar postulaciones duplicadas a la misma búsqueda.</p>
    <h2>¿Cómo elimino mi cuenta?</h2><p>Escribinos a hola@workuco.com.ar desde el email registrado y la eliminamos junto con tus datos.</p>`,
  terminos: `<h1>Términos y condiciones</h1>
    <p class="lead">Última actualización: noviembre de 2026.</p>
    <h2>Uso de la plataforma</h2><p>Workuco es un espacio de publicación y búsqueda de empleo. No somos empleadores ni participamos en la relación laboral entre empresas y candidatos. No garantizamos la obtención de un empleo ni la cobertura de una búsqueda.</p>
    <h2>Publicaciones</h2><ul><li>Las empresas son responsables de la veracidad de los datos que publican.</li><li>No se permiten ofertas discriminatorias, engañosas ni que soliciten pagos a los postulantes.</li><li>Workuco puede rechazar o eliminar publicaciones que incumplan estas condiciones.</li></ul>
    <h2>Postulaciones</h2><p>Al postularte, autorizás que tus datos y tu CV sean compartidos con la empresa responsable de la oferta. La empresa debe usarlos únicamente para evaluar tu candidatura.</p>
    <h2>Cuentas</h2><p>Las cuentas son personales e intransferibles. Sos responsable de mantener tu contraseña segura y de la actividad realizada desde tu cuenta.</p>
    <h2>Cambios</h2><p>Podemos actualizar estos términos. Los cambios importantes se comunican en la plataforma.</p>`,
  privacidad: `<h1>Política de privacidad</h1>
    <p class="lead">Cómo tratamos tus datos en Workuco.</p>
    <h2>Qué datos recopilamos</h2><ul><li><strong>Empresas:</strong> nombre, email, teléfono, sitio web, logo, fotos y descripción.</li><li><strong>Personas:</strong> nombre, email, teléfono, localidad, foto de perfil, CV, experiencia y habilidades.</li><li><strong>Uso:</strong> datos técnicos básicos para seguridad y funcionamiento del servicio.</li></ul>
    <h2>Para qué los usamos</h2><p>Para publicar ofertas, recibir postulaciones, permitir el contacto entre empresas y candidatos, y mantener la seguridad de la plataforma.</p>
    <h2>Con quién se comparten</h2><p>Las postulaciones se comparten únicamente con la empresa que publicó la oferta. No vendemos ni cedemos datos a terceros con fines publicitarios.</p>
    <h2>Análisis con IA</h2><p>Si una empresa activa el análisis con IA, el texto de tu CV y los datos de tu perfil se envían al proveedor de IA que esa empresa configuró, sólo para generar un resumen de idoneidad. Workuco no entrena modelos con tus datos.</p>
    <h2>Conservación y seguridad</h2><p>Los CV y fotos se almacenan en un servidor privado y solo son accesibles para la empresa destinataria y el equipo de administración. Las contraseñas se guardan cifradas. Podés pedir la eliminación de tus datos escribiendo a hola@workuco.com.ar.</p>
    <h2>Tus derechos</h2><p>Podés solicitar acceso, corrección o eliminación de tus datos personales en cualquier momento.</p>`,
};

function initInfo() {
  const key = location.pathname.replace('/', '');
  const root = $('[data-info]');
  if (root && INFO[key]) root.innerHTML = INFO[key];
}

/* ================================================================== */
/* CHANGAS                                                            */
/* ================================================================== */
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
};
const daysUntil = (iso) => (iso ? Math.round((new Date(`${iso}T12:00:00`) - Date.now()) / 86400000) : null);

function gigCard(j) {
  const n = daysUntil(j.startDate);
  const when = n == null ? '' : n <= 0 ? 'Empieza ya' : n === 1 ? 'Empieza mañana' : `Empieza en ${n} días`;
  return `<a class="gig-card" href="/oferta/${j.id}">
    <div class="gig-top">
      <span class="gig-when">${esc(when)}</span>
      ${j.positions > 1 ? `<span class="gig-spots">${j.positions} cupos</span>` : ''}
    </div>
    <div class="gig-pay">${esc(j.salaryLabel || 'Pago a convenir')}</div>
    <h3 class="gig-title">${esc(j.title)}</h3>
    <div class="gig-company">${esc(j.companyName)} · ${esc(j.locality)}</div>
    <dl class="gig-facts">
      <div><dt>Inicio</dt><dd>${esc(fmtDay(j.startDate) || 'A coordinar')}</dd></div>
      <div><dt>Duración</dt><dd>${esc(j.duration || 'A coordinar')}</dd></div>
    </dl>
    <span class="gig-cta">Postularme ${icon('arrow', 16)}</span>
  </a>`;
}

async function initGigs() {
  const list = $('#gig-list');
  let loc = '';
  const load = async () => {
    try {
      const qs = new URLSearchParams({ gig: '1', limit: '30' });
      if (loc) qs.set('locality', loc);
      const { jobs, total } = await api(`/api/jobs?${qs}`);
      jobs.sort((a, b) => String(a.startDate || '9').localeCompare(String(b.startDate || '9')));
      $('[data-gig-count]').textContent = total === 1 ? '1 changa abierta' : `${total} changas abiertas`;
      list.innerHTML = jobs.length ? jobs.map(gigCard).join('')
        : `<div class="empty" style="grid-column:1/-1"><h3>No hay changas abiertas${loc ? ` en ${esc(loc)}` : ''}</h3><p>Activá una alerta y te avisamos apenas se publique una.</p></div>`;
    } catch (err) {
      list.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar las changas</h3><p>${esc(err.message)}</p></div>`;
    }
  };
  $$('[data-gig-loc]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-gig-loc]').forEach((x) => x.classList.toggle('is-on', x === b));
    loc = b.dataset.gigLoc;
    load();
  }));
  const alertBtn = $('[data-gig-alert]');
  if (alertBtn && state.user && state.user.role === 'candidate') {
    alertBtn.hidden = false;
    alertBtn.addEventListener('click', async () => {
      try {
        await api('/api/candidate/alerts', { method: 'POST', body: { gig: true, locality: loc } });
        toast('Listo: te avisamos cuando haya changas nuevas', 'ok');
        alertBtn.disabled = true;
      } catch (err) { toast(err.message, 'err'); }
    });
  }
  await load();
}

/* ================================================================== */
/* CV WORKUCO                                                         */
/* ================================================================== */
async function initCv() {
  const root = $('#cv-root');
  const id = location.pathname.split('/').pop();
  $('[data-print]').addEventListener('click', () => window.print());
  let c;
  try {
    ({ candidate: c } = await api(`/api/cv-data/${encodeURIComponent(id)}`));
  } catch (err) {
    root.innerHTML = `<div class="empty"><h3>${err.status === 401 ? 'Iniciá sesión para ver este CV' : 'No podés ver este CV'}</h3>
      <p>Solo lo ven la persona, las empresas a las que se postuló y la administración.</p>
      ${err.status === 401 ? '<a class="btn btn-primary" href="/acceder">Ingresar</a>' : ''}</div>`;
    return;
  }
  document.title = `CV de ${c.name} · Workuco`;
  const block = (title, text) => (text ? `<section><h2>${esc(title)}</h2><p>${esc(text)}</p></section>` : '');
  root.innerHTML = `<article class="cv-sheet">
    <aside class="cv-side">
      ${c.photo ? `<img class="cv-photo" src="${esc(c.photo)}" alt="">` : `<span class="cv-photo cv-photo-fallback">${esc(initials(c.name))}</span>`}
      <div><h3>Contacto</h3><ul>
        ${c.phone ? `<li>${esc(c.phone)}</li>` : ''}
        ${c.email ? `<li>${esc(c.email)}</li>` : ''}
        ${c.locality ? `<li>${esc(c.locality)}, Mendoza</li>` : ''}
        ${c.linkedin ? `<li>${esc(c.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</li>` : ''}
      </ul></div>
      ${(c.skills || []).length ? `<div><h3>Habilidades</h3>${c.skills.map((s) => `<span class="cv-skill">${esc(s)}</span>`).join('')}</div>` : ''}
      ${c.availability ? `<div><h3>Disponibilidad</h3><p>${esc(c.availability)}</p></div>` : ''}
    </aside>
    <div class="cv-main">
      <header><h1 class="cv-name">${esc(c.name)}</h1>${c.headline ? `<div class="cv-headline">${esc(c.headline)}</div>` : ''}</header>
      ${block('Sobre mí', c.about)}
      ${block('Experiencia', c.experience)}
      ${block('Formación', c.education)}
      <div class="cv-foot">CV generado con Workuco · el portal de empleo del Valle de Uco</div>
    </div>
  </article>`;
}

/* ================================================================== */
/* PERFIL PÚBLICO                                                     */
/* ================================================================== */
async function initPublicProfile() {
  const root = $('#public-root');
  const slug = location.pathname.split('/').pop();
  let p;
  try {
    ({ person: p } = await api(`/api/public/${encodeURIComponent(slug)}`));
  } catch (_) {
    root.innerHTML = `<div class="container section"><div class="empty"><h3>Este perfil no es público</h3>
      <p>La persona puede haberlo ocultado. Igual podés buscar empleo o talento en Workuco.</p>
      <a class="btn btn-primary" href="/">Ir al inicio</a></div></div>`;
    return;
  }
  document.title = `${p.name} · Workuco`;
  const block = (title, text) => (text ? `<section class="pp-block"><h2>${esc(title)}</h2><p>${esc(text)}</p></section>` : '');
  root.innerHTML = `<section class="band-night pp-hero">
    <div class="container pp-hero-inner">
      ${p.photo ? `<img class="pp-photo" src="${esc(p.photo)}" alt="">` : `<span class="pp-photo avatar-fallback">${esc(initials(p.name))}</span>`}
      <div>
        <h1 class="display-sm">${esc(p.name)}</h1>
        ${p.headline ? `<p class="pp-headline">${esc(p.headline)}</p>` : ''}
        ${p.locality ? `<p class="pp-loc">${icon('pin', 16)} ${esc(p.locality)}, Valle de Uco</p>` : ''}
        ${p.openToWork ? '<span class="status-pill">Disponible para trabajar</span>' : ''}
      </div>
    </div>
  </section>
  <section class="section"><div class="container pp-grid">
    <div class="pp-main">
      ${block('Sobre mí', p.about)}
      ${block('Experiencia', p.experience)}
      ${block('Formación', p.education)}
    </div>
    <aside class="pp-side card">
      ${(p.skills || []).length ? `<h3>Habilidades</h3><div class="chips">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
      ${p.availability ? `<h3>Disponibilidad</h3><p>${esc(p.availability)}</p>` : ''}
      <p class="muted">¿Tenés una empresa en el Valle? Invitá a ${esc(p.name.split(' ')[0])} desde la base de talento de tu panel.</p>
      <a class="btn btn-primary btn-block" href="/panel#talento">Ir a mi panel</a>
    </aside>
  </div></section>`;
}

/* ================================================================== */
/* ARRANQUE                                                           */
/* ================================================================== */
window.WK = {
  $, $$, api, esc, toast, showAlert, hideAlert, setFieldErrors, icon, logoHtml, avatarHtml,
  state, loadMe, loadMeta, fmtDate, timeAgo, initials, stageBadge, STAGE_LABEL, statusBadge,
  jobCard, jobRow, gigCard, matchPill, payHtml, responseHtml, profileCompleteness, setupCarousel, fileToBase64, ready: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  const page = document.body.dataset.page;
  let resolveReady;
  window.WK.ready = new Promise((r) => { resolveReady = r; });
  try {
    await loadMe();
  } catch (_) {}
  resolveReady();
  try {
    switch (page) {
      case 'home': await initHome(); break;
      case 'search': await initSearch(); break;
      case 'job': await initJob(); break;
      case 'publish': await initPublish(); break;
      case 'auth': await initAuth(); break;
      case 'companies': await initCompanies(); break;
      case 'company': await initCompanyPage(); break;
      case 'info': initInfo(); break;
      case 'gigs': await initGigs(); break;
      case 'cv': await initCv(); break;
      case 'public-profile': await initPublicProfile(); break;
      default: break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Ocurrió un error', 'err');
  }
});
