/* WorkUco — frontend público y compartido */
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
      <a class="btn btn-primary btn-sm" href="/buscar">Buscar empleo</a>
      <button class="btn btn-ghost btn-sm btn-logout" type="button" data-logout title="Cerrar sesión">${icon('logout', 16)} Salir</button>`;
    if (mobile) { mobile.textContent = 'Mi perfil'; mobile.href = '/mi-perfil'; }
  } else if (u && u.role === 'admin') {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="/admin">Admin</a>
      <button class="btn btn-outline btn-sm" type="button" data-logout>Salir</button>`;
    if (mobile) { mobile.textContent = 'Admin'; mobile.href = '/admin'; }
  }
  /* en el celular el menú (☰) también permite cerrar la sesión, para cualquier cuenta */
  const menu = $('[data-mobile-menu]');
  if (u && menu && !$('[data-logout]', menu)) {
    menu.insertAdjacentHTML('beforeend', `<button class="mobile-logout" type="button" data-logout>${icon('logout', 16)} Cerrar sesión</button>`);
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

/* Achica una imagen en el navegador y la devuelve como JPEG (data URL). */
async function shrinkImage(file, max = 1600, quality = 0.86) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (_) {
    src = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(file);
    });
  }
  const w = src.width || src.naturalWidth; const h = src.height || src.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
/* Un flyer ya publicado (URL) → data URL, para mandarlo a la IA. */
async function urlToDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
}

/* Flyer siempre completo (sin recortes) sobre una versión desenfocada de sí mismo. */
function flyerFrame(src, alt, cls = '') {
  return `<div class="flyer-frame ${cls}" style="--flyer-bg:url('${esc(src)}')"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"></div>`;
}

/* Puntos de un carrusel horizontal de flyers (scroll-snap): siguen el scroll y lo controlan. */
function setupFlyerRail(root) {
  if (!root) return;
  const rail = $('[data-flyer-rail]', root);
  const dots = $$('[data-flyer-dot]', root);
  if (!rail || !dots.length) return;
  const at = () => Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth));
  rail.addEventListener('scroll', () => { const i = at(); dots.forEach((d, k) => d.classList.toggle('is-on', k === i)); }, { passive: true });
  dots.forEach((d) => d.addEventListener('click', () => rail.scrollTo({ left: Number(d.dataset.flyerDot) * rail.clientWidth, behavior: 'smooth' })));
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
  const cover = j.flyer || (j.companyGallery || [])[0];
  const extra = (j.flyers || []).length - 1;
  return `<a class="job-card" href="/oferta/${j.id}">
    <div class="job-cover${j.flyer ? ' job-cover-flyer' : cover ? ' has-img' : ''}"${!j.flyer && cover ? ` style="background-image:url('${esc(cover)}')"` : ''}>
      ${j.flyer ? flyerFrame(j.flyer, `Flyer: ${j.title} en ${j.companyName}`) + (extra > 0 ? `<span class="flyer-more">+${extra}</span>` : '') : '<span class="job-cover-shade"></span>'}
      ${j.featured ? `<span class="badge badge-featured">${icon('star', 12)} Destacada${j.gig ? ' · Changa' : ''}</span>` : j.gig ? '<span class="badge badge-gig">Changa</span>' : ''}
    </div>
    <div class="job-card-body">
      ${logoHtml(j.companyName, j.companyLogo, 'logo')}
      <div class="job-top">
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified" title="Empresa verificada">${checkIcon}</span>` : ''}</div>
      </div>
      <div class="job-meta">
        ${j.cosecha ? '<span class="badge badge-cosecha" title="Empresa con Pack Cosecha">Cosecha</span>' : ''}
        <span class="badge">${esc(j.locality)}</span>
        <span class="badge">${esc(j.modality)}</span>
        <span class="badge">${esc(j.category)}</span>
      </div>
      ${j.sourceKind === 'importado' ? `<span class="src-tag">Tomado de ${esc(j.sourceName || 'un canal de empleo')}</span>` : ''}
      <div class="job-foot">${payHtml(j)}${matchPill(j.match) || `<span>${timeAgo(j.publishedAt)}</span>`}</div>
    </div>
  </a>`;
}

function jobRow(j, saved = false) {
  const cover = j.flyer || (j.companyGallery || [])[0];
  return `<div class="job-row">
    <a class="job-row-main" href="/oferta/${j.id}">
      ${logoHtml(j.companyName, j.companyLogo, 'logo')}
      <div class="job-row-info">
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-company">${esc(j.companyName)} ${j.companyVerified ? `<span class="verified">${checkIcon}</span>` : ''}</div>
        <div class="badges">
          ${j.featured ? `<span class="badge badge-featured">${icon('star', 12)} Destacada</span>` : ''}
          <span class="badge">${esc(j.locality)}</span>
          <span class="badge">${esc(j.type)}</span>
          <span class="badge">${esc(j.modality)}</span>
          <span class="badge">${esc(j.category)}</span>
        </div>
      </div>
      <div class="side">
        ${payHtml(j)}
        ${matchPill(j.match)}
        <span class="date">${j.sourceKind === 'importado' ? 'Tomado de un canal · ' : j.gig ? 'Changa · ' : ''}${timeAgo(j.publishedAt)}</span>
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
  if (window.WKGuia) window.WKGuia.initHomeBand();
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
  if (tl && counts.candidates) tl.textContent = `${counts.candidates} personas del Valle ya tienen su perfil en WorkUco.`;

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
  const prefLocs = isCand && state.user.candidate.prefs ? state.user.candidate.prefs.localities : [];
  const prefKey = prefLocs.join(',');
  if (prefKey && !params.has('locality')) f.locality = prefKey;
  $$('[data-candidate-only]').forEach((o) => { o.hidden = !isCand; });
  if (f.sort === 'match' && !isCand) f.sort = 'recent';
  $('#save-alert').hidden = !isCand;
  $('#alert-login').hidden = isCand || !!state.user;
  $('#f-q').value = f.q;
  $('#f-sort').value = f.sort;

  const chip = (group, value, label, active) => `<button type="button" class="filter-chip${active ? ' is-active' : ''}" data-filter="${group}" data-value="${esc(value)}">${esc(label)}</button>`;
  const renderChips = () => {
    $('#chips-locality').innerHTML = chip('locality', '', 'Toda la zona', !f.locality) +
      (prefKey && prefLocs.length > 1 ? chip('locality', prefKey, `Tus localidades (${prefLocs.join(', ')})`, f.locality === prefKey) : '') +
      /* varias localidades que no son las de tus preferencias (por ejemplo, desde una alerta) */
      (f.locality.includes(',') && f.locality !== prefKey ? chip('locality', f.locality, f.locality.split(',').join(' o '), true) : '') +
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
  if (!r.rate) return '<p class="response-line"><span class="response-badge is-slow">Todavía no respondió postulaciones</span></p>';
  const days = r.days <= 1 ? 'en 1 día' : `en ${r.days} días`;
  return `<p class="response-line"><span class="response-badge${slow ? ' is-slow' : ''}">Responde el ${r.rate}%</span> <span class="muted">Suele responder ${days}</span></p>`;
}

async function initJob() {
  const id = location.pathname.split('/').pop();
  const view = $('#job-view');
  try {
    const { job, canApply, applied, saved } = await api(`/api/jobs/${id}`);
    const contactWaUrl = job.sourceKind === 'importado' ? ((await loadMeta().catch(() => ({}))).contactWaUrl || '') : '';
    document.title = `${job.title} · WorkUco`;
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

        ${(job.flyers || []).length ? `<section class="detail-flyers" aria-label="Flyers del aviso">
          <div class="flyer-rail" data-flyer-rail>${job.flyers.map((src, i) => `<a class="flyer-slide" href="${esc(src)}" target="_blank" rel="noopener" title="Ver el flyer en grande">${flyerFrame(src, `Flyer${job.flyers.length > 1 ? ` ${i + 1}` : ''}: ${job.title} en ${job.companyName}`)}</a>`).join('')}</div>
          ${job.flyers.length > 1 ? `<div class="flyer-dots">${job.flyers.map((_, i) => `<button type="button" class="flyer-dot${i === 0 ? ' is-on' : ''}" data-flyer-dot="${i}" aria-label="Ver flyer ${i + 1}"></button>`).join('')}</div>` : ''}
          <p class="flyer-hint">Tocá el flyer para verlo en grande${job.flyers.length > 1 ? ' · deslizá para ver los demás' : ''}</p>
        </section>` : ''}
        <div class="detail-block">
          <h2>De qué se trata</h2>
          <div class="prose">${esc(job.description)}</div>
        </div>
        ${resps.length ? `<div class="detail-block"><h2>Tu día a día</h2><ul class="check-list">${resps.map((r) => `<li>${icon('check', 15)}<span>${esc(r)}</span></li>`).join('')}</ul></div>` : ''}
        ${reqs.length ? `<div class="detail-block"><h2>Lo que pedimos</h2><ul class="check-list">${reqs.map((r) => `<li>${icon('check', 15)}<span>${esc(r)}</span></li>`).join('')}</ul></div>` : ''}
        ${(job.benefits || []).length ? `<div class="detail-block"><h2>Lo que ofrecemos</h2><div class="chips">${job.benefits.map((b) => `<span class="badge badge-benefit">${icon('check', 13)} ${esc(b)}</span>`).join('')}</div></div>` : ''}

        <div class="detail-block">
          <h2>Contacto</h2>
          <p>${job.contactEmail ? `<a href="mailto:${esc(job.contactEmail)}" class="link-inline">${esc(job.contactEmail)}</a>` : job.companyClaimed === false ? 'Postulate desde esta página: WorkUco le hace llegar tu postulación a la empresa.' : 'Postulate desde esta página y la empresa recibe tus datos.'}</p>
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
        ${job.sourceKind === 'importado' ? `<div class="aside-card claim-hint"><h3>Aviso tomado de ${esc(job.sourceName || 'un canal de empleo')}</h3>
          <p class="soft-text">Lo publicamos para que llegue a más gente del Valle. Para postularte usá el botón o el contacto del aviso.</p>
          <p class="soft-text"><strong>¿Es tu empresa?</strong> ${contactWaUrl ? `<a class="link-inline" href="${esc(contactWaUrl)}?text=${encodeURIComponent(`Hola, soy de la empresa del aviso "${job.title}" en WorkUco`)}" target="_blank" rel="noopener">Escribinos</a>` : '<a class="link-inline" href="/contacto">Escribinos</a>'} y lo administrás vos o lo borramos.</p></div>` : ''}
        ${job.companyDescription ? `<div class="aside-card"><h3>Sobre la empresa</h3><p class="soft-text">${esc(job.companyDescription)}</p><a class="link-arrow" href="/empresa/${job.companyId}">Ver perfil de la empresa ${icon('arrow', 15)}</a></div>` : ''}
      </aside>
    </div>`;

    setupCarousel($('[data-carousel]', view));
    setupFlyerRail($('.detail-flyers', view));
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

  if (user && user.role !== 'company') {
    gate.hidden = false;
    gate.innerHTML = `<div class="card gate-card">
      <h1>Estás con tu cuenta de persona</h1><p>Para publicar una búsqueda necesitás una cuenta de empresa. Podés crear otra cuenta o volver a tu perfil.</p>
      <div class="gate-actions"><a class="btn btn-primary" href="/acceder?rol=empresa&modo=registro&next=/publicar">Crear cuenta de empresa</a><a class="btn btn-outline" href="/mi-perfil">Ir a mi perfil</a></div>
    </div>`;
    return;
  }
  /* Sin sesión se arma el aviso igual: al enviarlo se guarda como borrador en este navegador
     y se pide la cuenta; al volver con la cuenta lista, el borrador se recupera solo. */
  const guest = !user;
  const me = guest ? { company: { name: 'Tu empresa', email: '', phone: '', locality: '', logo: '', verified: false, ai: null } } : user;
  gate.hidden = true;
  app.hidden = false;
  if (guest) {
    $('.publish-head .btn').outerHTML = '<a class="btn btn-outline btn-sm" href="/acceder?rol=empresa&next=%2Fpublicar%3Fborrador%3D1">Ya tengo cuenta</a>';
    $('#publish-alert').insertAdjacentHTML('beforebegin', `<div class="guest-note">${icon('sparkles', 16)}<span><strong>Armá tu aviso sin cuenta.</strong> Al final te pedimos crearla (gratis, un minuto) y el aviso queda guardado.</span></div>`);
    $('.ai-strip').hidden = true;
    $('.wizard-foot-right a[href="/panel"]').setAttribute('href', '/');
  }

  const editId = new URLSearchParams(location.search).get('edit');
  let editing = null;
  if (editId) {
    try {
      const { jobs } = await api('/api/company/jobs');
      editing = jobs.find((j) => j.id === editId);
    } catch (_) {}
    if (editing) {
      document.title = 'Editar empleo · WorkUco';
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
    salaryMin: editing ? (editing.salaryMin || 0) : 0,
    salaryMax: editing ? (editing.salaryMax || 0) : 0,
    salaryPeriod: editing ? (editing.salaryPeriod || 'mes') : 'mes',
    skills: editing ? [...(editing.skills || [])] : [],
    gig: editing ? !!editing.gig : false,
    startDate: editing ? (editing.startDate || '') : '',
    duration: editing ? (editing.duration || '') : '',
    contactEmail: editing ? (editing.contactEmail || me.company.email) : me.company.email,
    contactPhone: editing ? (editing.contactPhone || '') : (me.company.phone || ''),
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

  /* --- flyers del aviso (hasta 5): { url } ya publicados, { data } nuevos --- */
  const MAX_FLYERS = 5;
  s.flyers = editing ? (editing.flyers || []).map((url) => ({ url })) : [];
  const hasFlyer = () => s.flyers.length > 0;
  const flyerSrc = (f) => f.data || f.url;
  const canAi = !!(me.company.ai && me.company.ai.hasKey);
  const renderFlyer = () => {
    const n = s.flyers.length;
    $('#flyer-box').classList.toggle('has-flyer', n > 0);
    $('#flyer-box').classList.toggle('is-full', n >= MAX_FLYERS);
    $('#flyer-count').textContent = n ? `${n} de ${MAX_FLYERS}` : '';
    $('#flyer-preview').innerHTML = n
      ? `<div class="flyer-thumbs">${s.flyers.map((f, i) => `<figure class="flyer-thumb">
          <img src="${esc(flyerSrc(f))}" alt="Flyer ${i + 1} del aviso">
          ${i === 0 ? '<span class="flyer-main">Principal</span>' : ''}
          <button type="button" data-rm-flyer="${i}" aria-label="Quitar el flyer ${i + 1}">${icon('x', 13)}</button>
        </figure>`).join('')}</div>
        <div class="flyer-actions">
          ${canAi ? `<button class="btn btn-lime btn-sm" type="button" id="flyer-ai">${icon('sparkles', 15)} Completar el aviso con el flyer principal</button>` : '<span class="muted">Con la IA de tu panel, el flyer completa el aviso solo.</span>'}
        </div>`
      : '';
    $$('[data-rm-flyer]').forEach((b) => b.addEventListener('click', () => { s.flyers.splice(Number(b.dataset.rmFlyer), 1); renderFlyer(); }));
    $('#flyer-ai')?.addEventListener('click', fillFromFlyer);
    $('#desc-hint').textContent = hasFlyer()
      ? 'Con flyer alcanza con 20 caracteres: sumá lo esencial para que te encuentren en las búsquedas.'
      : 'Mínimo 60 caracteres. Podés editarlo todo lo que quieras.';
  };
  $('#flyer-input').addEventListener('change', async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    let added = 0;
    for (const file of list) {
      if (s.flyers.length >= MAX_FLYERS) { toast(`Hasta ${MAX_FLYERS} flyers por aviso`, 'err'); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast(`${file.name}: tiene que ser JPG, PNG o WebP`, 'err'); continue; }
      try { s.flyers.push({ data: await shrinkImage(file, 1600, 0.86) }); added++; }
      catch (_) { toast(`No pudimos leer ${file.name}`, 'err'); }
    }
    renderFlyer();
    if (added) toast(added === 1 ? 'Flyer cargado' : `${added} flyers cargados`, 'ok');
  });

  async function fillFromFlyer(e) {
    const btn = e.currentTarget;
    if ($('#j-description').value.trim() && !confirm('El flyer va a reemplazar la descripción y los datos del aviso. ¿Seguimos?')) return;
    btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = `${icon('sparkles', 15)} Leyendo el flyer…`;
    try {
      const first = s.flyers[0];
      const image = first.data || await urlToDataUrl(first.url);
      const { draft } = await api('/api/company/ai/flyer', { method: 'POST', body: { image } });
      if (!draft) { toast('No encontramos un aviso en el flyer', 'err'); return; }
      if (draft.title) { s.title = draft.title; $('#j-title').value = draft.title; }
      for (const k of ['category', 'type', 'modality']) if (draft[k]) s[k] = draft[k];
      if (draft.locality) s.locality = draft.locality;
      if (draft.description) { s.description = draft.description; $('#j-description').value = draft.description; }
      if (draft.requirements) { s.requirements.splice(0, s.requirements.length, ...draft.requirements.split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)); renderReq(); }
      if (draft.skills && draft.skills.length) { s.skills = draft.skills.slice(0, 8); renderJobSkills(); }
      if (draft.salaryMin) { $('#j-salary-min').value = draft.salaryMin; $('#j-salary-max').value = draft.salaryMax || ''; $('#j-salary-period').value = draft.salaryPeriod || 'mes'; nudge(); }
      if (draft.gig) { $('#j-gig').checked = true; $('#gig-fields').hidden = false; }
      if (draft.startDate) $('#j-start').value = draft.startDate;
      if (draft.duration) $('#j-duration').value = draft.duration;
      if (draft.contactEmail) $('#j-contact-email').value = draft.contactEmail;
      if (draft.contactPhone) $('#j-contact-phone').value = draft.contactPhone;
      rerender();
      toast('Listo: revisá los datos que leímos del flyer', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  }

  /* --- v3: changa, sueldo estructurado, habilidades y plantillas del Valle --- */
  const readMoney = (sel) => Math.max(0, Number(String($(sel).value).replace(/\D/g, '')) || 0);
  const wizardPay = () => {
    const min = readMoney('#j-salary-min'); const max = readMoney('#j-salary-max'); const period = $('#j-salary-period').value;
    const money = (n) => `$ ${n.toLocaleString('es-AR')}`;
    const lo = min || max;
    return {
      salaryMin: lo, salaryMax: max, salaryPeriod: period,
      salaryLabel: lo ? `${max > lo ? `${money(lo)} a ${money(max)}` : money(lo)} por ${period}` : ($('#j-salary').value.trim() || 'Sueldo a convenir'),
    };
  };
  $('#j-gig').checked = s.gig;
  $('#j-start').value = s.startDate;
  $('#j-duration').value = s.duration;
  $('#gig-fields').hidden = !s.gig;
  $('#j-gig').addEventListener('change', () => { $('#gig-fields').hidden = !$('#j-gig').checked; });
  $('#j-salary-min').value = s.salaryMin || '';
  $('#j-salary-max').value = s.salaryMax || '';
  $('#j-salary-period').value = s.salaryPeriod;
  const nudge = () => { $('#salary-nudge').hidden = readMoney('#j-salary-min') > 0 || readMoney('#j-salary-max') > 0; };
  ['#j-salary-min', '#j-salary-max'].forEach((sel) => $(sel).addEventListener('input', nudge));
  nudge();

  const renderJobSkills = () => {
    $('#jskills-list').innerHTML = s.skills.length
      ? s.skills.map((k, i) => `<span class="tag">${esc(k)}<button type="button" data-rm-jskill="${i}" aria-label="Quitar ${esc(k)}">${icon('x', 11)}</button></span>`).join('')
      : '<span class="muted">Sumá las habilidades clave del puesto.</span>';
    $$('[data-rm-jskill]').forEach((b) => b.addEventListener('click', () => { s.skills.splice(Number(b.dataset.rmJskill), 1); renderJobSkills(); }));
  };
  const addJobSkill = () => {
    const v = $('#jskill-input').value.trim().slice(0, 30);
    if (!v) return;
    if (s.skills.length >= 8) { toast('Hasta 8 habilidades por aviso', 'err'); return; }
    if (!s.skills.some((x) => x.toLowerCase() === v.toLowerCase())) s.skills.push(v);
    $('#jskill-input').value = '';
    renderJobSkills();
  };
  $('#jskill-add').addEventListener('click', addJobSkill);
  $('#jskill-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addJobSkill(); } });
  renderJobSkills();

  const splitLines = (t) => String(t || '').split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
  $('#tpl-strip').innerHTML = (meta.templates || []).map((t) =>
    `<button type="button" class="tpl-card${t.gig ? ' is-gig' : ''}" data-tpl="${esc(t.id)}"><strong>${esc(t.label)}</strong><small>${esc(t.category)} · ${esc(t.type)}</small></button>`).join('');
  $$('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
    const t = (meta.templates || []).find((x) => x.id === b.dataset.tpl);
    if (!t) return;
    const hasText = $('#j-description').value.trim().length > 0;
    if (hasText && !confirm('La plantilla reemplaza la descripción, tareas y requisitos que escribiste. ¿Seguimos?')) return;
    s.title = t.title; $('#j-title').value = t.title;
    s.category = t.category; s.type = t.type;
    /* lo que la plantilla no sabe se completa con lo más probable, sin pisar lo que ya eligió */
    if (!s.modality) s.modality = t.modality || 'Presencial';
    if (!s.locality && meta.localities.includes(me.company.locality)) s.locality = me.company.locality;
    s.description = t.description; $('#j-description').value = t.description;
    s.responsibilities.splice(0, s.responsibilities.length, ...splitLines(t.responsibilities));
    s.requirements.splice(0, s.requirements.length, ...splitLines(t.requirements));
    s.skills = [...t.skills].slice(0, 8);
    s.benefits = [...t.benefits];
    $('#j-gig').checked = !!t.gig; $('#gig-fields').hidden = !t.gig;
    if (t.gig) $('#j-salary-period').value = 'día';
    $$('[data-tpl]').forEach((x) => x.classList.toggle('is-active', x === b));
    renderJobSkills();
    renderResp(); renderReq();
    rerender();
    toast(`Plantilla "${t.label}" aplicada: ajustala a tu gusto.`, 'ok');
  }));

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
    /* splice y no "=": los editores de listas guardan la referencia al arreglo */
    s.responsibilities.splice(0, s.responsibilities.length, ...t.responsibilities);
    s.requirements.splice(0, s.requirements.length, ...t.requirements);
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
      if (draft.responsibilities.length) { s.responsibilities.splice(0, s.responsibilities.length, ...draft.responsibilities); renderResp(); }
      if (draft.requirements.length) { s.requirements.splice(0, s.requirements.length, ...draft.requirements); renderReq(); }
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
  const showStep = (n, { scroll = true } = {}) => {
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
    $('#job-submit').hidden = s.step !== steps.length; // el botón de enviar sólo en el último paso
    if (guest) $('#job-submit').textContent = 'Crear cuenta y enviar';
    if (scroll) window.scrollTo({ top: $('#publish-app').offsetTop - 90, behavior: 'smooth' });
    if (s.step === 3) loadSalaryHint();
    if (s.step === steps.length) { renderPreview(); renderLegalHints(); }
  };

  /* Errores: se marcan al lado de cada campo y la pantalla baja hasta el primero (antes el aviso quedaba
     arriba de todo y el campo con problema, mucho más abajo). */
  const STEP_OF = { title: 1, category: 1, locality: 1, modality: 1, type: 1, startDate: 1, positions: 1,
    description: 2, skills: 2, flyers: 2, salaryMin: 3, salaryMax: 3, salaryPeriod: 3, salary: 3, experience: 3, schedule: 3, closesAt: 3,
    contactEmail: 4, contactPhone: 4 };
  const showErrors = (errs) => {
    const keys = Object.keys(errs);
    showAlert($('#publish-alert'), keys.length > 1 ? `Revisá ${keys.length} datos marcados en rojo.` : Object.values(errs)[0], 'error');
    setFieldErrors($('#job-form'), errs);
    const first = $$('.wizard-step:not([hidden]) .error-text').find((el) => !el.hidden);
    const target = first ? (first.closest('.field') || first) : $('#publish-alert');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const hasSalary = () => readMoney('#j-salary-min') > 0 || readMoney('#j-salary-max') > 0;

  const validateStep = () => {
    hideAlert($('#publish-alert'));
    setFieldErrors($('#job-form'), null);
    const errs = {};
    if (s.step === 1) {
      s.title = $('#j-title').value.trim();
      if (s.title.length < 5) errs.title = 'Escribí un nombre de puesto (mínimo 5 letras)';
      if (!s.category) errs.category = 'Elegí una categoría';
      if (!s.locality) errs.locality = 'Elegí la localidad';
      if (!s.modality) errs.modality = 'Elegí la modalidad';
      if (!s.type) errs.type = 'Elegí el tipo de empleo';
      if ($('#j-gig').checked && !$('#j-start').value) errs.startDate = 'Contá cuándo empieza la changa: es lo primero que mira quien busca.';
    }
    if (s.step === 2) {
      s.description = $('#j-description').value.trim();
      const minDesc = hasFlyer() ? 20 : 60;
      if (s.description.length < minDesc) {
        errs.description = hasFlyer()
          ? `Sumá una descripción corta (mínimo 20 caracteres; vas ${s.description.length}) para que te encuentren en las búsquedas.`
          : `Contá un poco más del puesto (mínimo 60 caracteres; vas ${s.description.length}), subí un flyer o usá una plantilla.`;
      }
    }
    if (s.step === 3) {
      const min = readMoney('#j-salary-min'); const max = readMoney('#j-salary-max');
      if (max && min && max < min) errs.salaryMax = 'El sueldo "hasta" no puede ser menor que el "desde".';
    }
    if (s.step === 4) {
      s.contactEmail = $('#j-contact-email').value.trim();
      /* sin cuenta puede quedar vacío: se usa el mail con el que la cree */
      if ((s.contactEmail || !guest) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.contactEmail)) errs.contactEmail = 'Revisá el email de contacto.';
    }
    if (Object.keys(errs).length) { showErrors(errs); return false; }
    /* sueldo: no es obligatorio, pero se avisa una vez antes de seguir sin él */
    if (s.step === 3 && !hasSalary() && !s.salaryWarned) {
      s.salaryWarned = true;
      $('#salary-nudge').hidden = false;
      $('#salary-nudge').classList.add('is-warn');
      $('#salary-nudge').textContent = 'Los avisos sin sueldo reciben menos postulantes y no aparecen cuando la gente filtra por sueldo. Si igual preferís no ponerlo, tocá Continuar de nuevo.';
      $('.salary-field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  };

  /* sueldo de referencia del rubro, sacado de avisos reales de WorkUco (sólo si hay suficientes) */
  let hintKey = '';
  async function loadSalaryHint() {
    const box = $('#salary-hint');
    const period = $('#j-salary-period').value;
    const key = `${s.category}|${period}`;
    if (guest || !s.category || key === hintKey) return;
    hintKey = key;
    box.hidden = true;
    let hint = null;
    try { ({ hint } = await api(`/api/company/salary-hint?category=${encodeURIComponent(s.category)}&period=${encodeURIComponent(period)}`)); } catch (_) { return; }
    if (!hint || hintKey !== key) return;
    const money = (n) => `$ ${Number(n).toLocaleString('es-AR')}`;
    box.innerHTML = `${icon('chart', 15)}<span>En WorkUco, los avisos de <strong>${esc(s.category)}</strong> pagan en general <strong>${hint.max > hint.min ? `${money(hint.min)} a ${money(hint.max)}` : money(hint.min)}</strong> por ${esc(period)} <small>(${hint.count} avisos del último año)</small>.</span>${hasSalary() ? '' : `<button type="button" class="btn btn-outline btn-sm" id="salary-hint-use">${hint.max > hint.min ? 'Usar este rango' : 'Usar este sueldo'}</button>`}`;
    box.hidden = false;
    $('#salary-hint-use')?.addEventListener('click', () => {
      $('#j-salary-min').value = hint.min; $('#j-salary-max').value = hint.max > hint.min ? hint.max : '';
      nudge(); $('#salary-hint-use').remove();
      toast('Listo: ajustalo si pagás distinto.', 'ok');
    });
  }
  $('#j-salary-period').addEventListener('change', () => { if (s.step === 3) loadSalaryHint(); });

  $('#wizard-next').addEventListener('click', () => { if (validateStep()) showStep(s.step + 1); });
  $('#wizard-back').addEventListener('click', () => { hideAlert($('#publish-alert')); showStep(s.step - 1); });
  $$('.wizard-dot').forEach((d) => d.addEventListener('click', () => {
    const n = Number(d.dataset.step);
    if (n < s.step || validateStep()) showStep(n);
  }));

  /* Aviso (no bloquea) si el texto pide edad, sexo, "buena presencia", etc. Mismas reglas que el servidor. */
  async function renderLegalHints() {
    const box = $('#legal-hints');
    if (!box) return;
    let rules = [];
    try { rules = (await loadMeta()).discriminationRules || []; } catch (_) { return; }
    const text = [$('#j-title').value, $('#j-description').value, ...(s.responsibilities || []), ...(s.requirements || [])].join('\n');
    const hits = [];
    for (const [src, msg] of rules) { const m = text.match(new RegExp(src, 'iu')); if (m && !hits.some((h) => h.msg === msg)) hits.push({ word: m[0], msg }); }
    box.hidden = !hits.length;
    box.innerHTML = hits.length ? `<strong>Revisá esto antes de enviar</strong><ul>${hits.map((h) => `<li><b>"${esc(h.word)}"</b>: ${esc(h.msg)}</li>`).join('')}</ul><small>La ley prohíbe pedir requisitos discriminatorios (Ley 23.592 y Ley de Contrato de Trabajo). Si lo dejás, el equipo puede rechazar el aviso.</small>` : '';
  }

  function renderPreview() {
    s.contactEmail = $('#j-contact-email').value.trim();
    s.contactPhone = $('#j-contact-phone').value.trim();
    const cover = s.flyers[0] ? flyerSrc(s.flyers[0]) : '';
    $('#job-preview').innerHTML = `<div class="preview-card">
      ${cover ? flyerFrame(cover, 'Flyer principal del aviso', 'preview-flyer') : '<div class="preview-cover"><span>Así se va a ver tu aviso</span></div>'}
      <div class="preview-body">
        ${logoHtml(me.company.name, me.company.logo, 'logo')}
        <div><div class="job-title">${esc(s.title)}</div><div class="job-company">${esc(me.company.name)} ${me.company.verified ? `<span class="verified">${checkIcon}</span>` : ''}</div></div>
        <div class="job-meta"><span class="badge">${esc(s.locality)}</span><span class="badge">${esc(s.modality)}</span><span class="badge">${esc(s.category)}</span></div>
        <p class="preview-desc">${esc(s.description).slice(0, 240)}${s.description.length > 240 ? '…' : ''}</p>
        <div class="job-foot">${payHtml(wizardPay())}<span>${$('#j-gig').checked ? 'Changa · ' : ''}${s.positions > 1 ? `${s.positions} puestos` : '1 puesto'}</span></div>
        ${s.skills.length ? `<div class="chips">${s.skills.map((k) => `<span class="badge">${esc(k)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;
  }

  /* --- borrador: lo que se armó sin cuenta queda en este navegador hasta que se envía --- */
  const DRAFT_KEY = 'wk-publish-draft';
  const DRAFT_DAYS = 7;
  const buildBody = () => ({
    title: s.title, locality: s.locality, category: s.category, type: s.type, modality: s.modality,
    description: s.description,
    responsibilities: s.responsibilities.join('\n'), requirements: s.requirements.join('\n'),
    experience: $('#j-experience').value.trim(), schedule: $('#j-schedule').value.trim(),
    salary: $('#j-salary').value.trim(), contactEmail: s.contactEmail,
    contactPhone: s.contactPhone, closesAt: $('#j-closes').value,
    benefits: s.benefits, positions: s.positions,
    salaryMin: readMoney('#j-salary-min'), salaryMax: readMoney('#j-salary-max'), salaryPeriod: $('#j-salary-period').value,
    skills: s.skills, gig: $('#j-gig').checked,
    startDate: $('#j-gig').checked ? $('#j-start').value : '', duration: $('#j-gig').checked ? $('#j-duration').value.trim() : '',
    flyers: s.flyers.filter((f) => f.data).map((f) => f.data),
  });
  const saveDraft = () => {
    const body = buildBody();
    const put = (b) => localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), body: b }));
    try { put(body); return 'ok'; } catch (_) {}
    try { put({ ...body, flyers: [] }); return 'sin-flyers'; } catch (_) { return 'no'; } // los flyers pueden no entrar en el navegador
  };
  const readDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || d.v !== 1 || !d.body || Date.now() - d.savedAt > DRAFT_DAYS * 86400000) return null;
      return d.body;
    } catch (_) { return null; }
  };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} };
  const applyDraft = (b) => {
    for (const k of ['title', 'category', 'locality', 'modality', 'type', 'description']) if (typeof b[k] === 'string') s[k] = b[k];
    if (Number(b.positions) > 0) { s.positions = Math.min(99, Number(b.positions)); $('#j-positions').textContent = String(s.positions); }
    s.responsibilities.splice(0, s.responsibilities.length, ...splitLines(b.responsibilities));
    s.requirements.splice(0, s.requirements.length, ...splitLines(b.requirements));
    s.skills = Array.isArray(b.skills) ? b.skills.slice(0, 8).map(String) : [];
    s.benefits = Array.isArray(b.benefits) ? b.benefits.filter((x) => meta.benefits.includes(x)) : [];
    s.flyers = Array.isArray(b.flyers) ? b.flyers.filter((x) => /^data:image\//.test(x)).slice(0, MAX_FLYERS).map((data) => ({ data })) : [];
    $('#j-title').value = s.title; $('#j-description').value = s.description;
    $('#j-experience').value = b.experience || ''; $('#j-schedule').value = b.schedule || '';
    $('#j-salary').value = b.salary || ''; $('#j-closes').value = b.closesAt || '';
    $('#j-salary-min').value = b.salaryMin || ''; $('#j-salary-max').value = b.salaryMax || '';
    if (meta.salaryPeriods.includes(b.salaryPeriod)) $('#j-salary-period').value = b.salaryPeriod;
    $('#j-gig').checked = !!b.gig; $('#gig-fields').hidden = !b.gig;
    $('#j-start').value = b.startDate || ''; $('#j-duration').value = b.duration || '';
    if (b.contactEmail) $('#j-contact-email').value = b.contactEmail;
    if (b.contactPhone) $('#j-contact-phone').value = b.contactPhone;
    renderResp(); renderReq(); renderJobSkills(); renderFlyer(); nudge(); rerender();
  };

  /* después de enviar: qué conviene hacer mientras se revisa (y dónde están las opciones pagas) */
  const nextStepsHtml = () => {
    const money = (n) => `$ ${Number(n).toLocaleString('es-AR')}`;
    const opts = (meta.payments && meta.payments.enabled && meta.payments.options) || [];
    const cheapest = opts.length ? opts.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    const items = [];
    items.push({ ic: 'star', t: 'Destacalo cuando se apruebe', d: `Sale primero en Buscar y en Wik Works, con más vistas por día.${cheapest ? ` Desde ${money(cheapest.price)} por ${cheapest.days} días.` : ' Lo pedís con un toque desde tu panel.'}`, href: '/panel#ofertas', cta: 'Ver en mi panel' });
    if (s.category === 'Agricultura' || $('#j-gig').checked) items.push({ ic: 'users', t: '¿Necesitás mucha gente para la temporada?', d: 'El Pack Cosecha destaca hasta 5 avisos y te deja invitar a más gente por día.', href: '/cosecha', cta: 'Ver Pack Cosecha' });
    if (!me.company.logo) items.push({ ic: 'image', t: 'Sumá el logo y fotos de tu empresa', d: 'Los avisos con logo dan más confianza y reciben más clics.', href: '/panel#empresa', cta: 'Completar mi empresa' });
    items.push({ ic: 'search', t: 'Mirá quién está disponible', d: 'Apenas se apruebe, podés invitar a gente del Valle que busca trabajo de lo tuyo.', href: '/panel#talento', cta: 'Ver talento' });
    return `<div class="next-steps"><h2>Mientras lo revisamos</h2><div class="next-steps-grid">${items.map((x) =>
      `<a class="next-step" href="${x.href}"><span class="next-step-ic">${icon(x.ic, 18)}</span><span><strong>${esc(x.t)}</strong><small>${esc(x.d)}</small><em>${esc(x.cta)} →</em></span></a>`).join('')}</div></div>`;
  };

  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    const btn = $('#job-submit');
    s.contactPhone = $('#j-contact-phone').value.trim();
    if (guest) {
      const r = saveDraft();
      if (r === 'no') { showAlert($('#publish-alert'), 'No pudimos guardar el borrador en este navegador. Creá la cuenta primero y volvé a publicar.', 'error'); return; }
      if (r === 'sin-flyers') toast('Guardamos el aviso sin los flyers (no entraban en el navegador): subilos de nuevo después.', 'err');
      location.href = `/acceder?rol=empresa&modo=registro&next=${encodeURIComponent('/publicar?borrador=1')}`;
      return;
    }
    const body = { ...buildBody(), ...(editing ? { keepFlyers: s.flyers.filter((f) => f.url).map((f) => f.url) } : {}) };
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (editing) await api(`/api/company/jobs/${editing.id}`, { method: 'PUT', body });
      else await api('/api/company/jobs', { method: 'POST', body });
      if (!editing) clearDraft();
      app.innerHTML = `<div class="card success-card">
        <div class="success-ring">${icon('check', 32)}</div>
        <h1>${editing ? 'Cambios enviados' : 'Publicación enviada'}</h1>
        <p>Quedó pendiente de aprobación (menos de 24 h). Cuando la revisemos, aparece en las búsquedas y te avisamos en el panel.</p>
        ${editing ? '' : nextStepsHtml()}
        <div class="gate-actions"><a class="btn btn-primary" href="/panel">Ir a mi panel</a><a class="btn btn-outline" href="/publicar">Publicar otra</a></div>
      </div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false; btn.textContent = editing ? 'Guardar y reenviar' : 'Enviar para revisión';
      /* el servidor puede marcar un dato de otro paso: se vuelve a ese paso y se muestra ahí */
      const fields = err.fields || {};
      const errSteps = Object.keys(fields).map((k) => STEP_OF[k]).filter(Boolean);
      if (errSteps.length) { showStep(Math.min(...errSteps), { scroll: false }); showErrors(fields); }
      else showAlert($('#publish-alert'), err.message, 'error');
    }
  });

  renderFlyer();
  /* borrador guardado (sin cuenta, o de una vez que no se terminó): se recupera al volver */
  const draft = !editing && readDraft();
  if (draft) {
    applyDraft(draft);
    if (!guest && !$('#j-contact-email').value) $('#j-contact-email').value = me.company.email;
    const back = new URLSearchParams(location.search).get('borrador') === '1';
    showStep(back && !guest ? 4 : 1);
    $('#publish-alert').insertAdjacentHTML('beforebegin', `<div class="draft-note" id="draft-note">${icon('file', 16)}<span>${back && !guest ? '<strong>Recuperamos tu aviso.</strong> Revisalo y envialo.' : '<strong>Recuperamos el aviso que estabas armando.</strong>'}</span><button type="button" class="btn btn-ghost btn-sm" id="draft-discard">Empezar de cero</button></div>`);
    $('#draft-discard').addEventListener('click', () => { clearDraft(); location.href = '/publicar'; });
  } else showStep(1);
}

/* ================================================================== */
/* ACCESO                                                             */
/* ================================================================== */
async function initAuth() {
  const params = new URLSearchParams(location.search);
  const role = params.get('rol') === 'empresa' ? 'company' : (params.get('rol') === 'empleado' ? 'candidate' : '');
  /* sólo rutas de este sitio: "//otro.com" o "/\otro.com" sacarían a la persona a otra página después de entrar */
  const next = /^\/(?![/\\])/.test(params.get('next') || '') ? params.get('next') : '';
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
    $('#forgot-link').href = `/restablecer?rol=${r === 'company' ? 'empresa' : 'empleado'}`;
    $('#r-terms-text').innerHTML = r === 'candidate'
      ? 'Tengo 16 años o más y acepto los <a href="/terminos" target="_blank" rel="noopener">términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>.'
      : 'Acepto los <a href="/terminos" target="_blank" rel="noopener">términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>, y declaro que represento a esta empresa.';
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

  /* Los formularios se conectan SIEMPRE, antes de mostrar "¿Cómo querés entrar?": si no, al elegir el
     tipo de cuenta el formulario quedaba sin conectar y el navegador lo mandaba solo (y con la clave en la dirección). */
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
        acceptTerms: $('#r-terms').checked,
      } });
      location.href = next || (currentRole === 'candidate' ? '/mi-perfil' : '/panel');
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setFieldErrors(regForm, err.fields);
      btn.disabled = false; btn.textContent = 'Crear cuenta';
    }
  });

  /* sin tipo de cuenta en la dirección (?rol=): primero se elige */
  if (!role) {
    $('#role-picker').hidden = false;
    $('#auth-forms').hidden = true;
    $('#auth-title').textContent = '¿Cómo querés entrar?';
    $('#auth-sub').textContent = 'Elegí tu tipo de cuenta para empezar.';
    return;
  }
  $('#role-picker').hidden = true;
  chooseRole(role);
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
    document.title = `${company.name} · WorkUco`;
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
            ${company.claimed === false ? '<p class="unclaimed-note">Ficha armada por WorkUco con búsquedas públicas. ¿Es tu empresa? Reclamala gratis desde el link que te enviamos o escribinos.</p>' : ''}
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
  acerca: `<h1>Acerca de WorkUco</h1>
    <p class="lead">WorkUco es el portal de empleo del Valle de Uco, pensado para conectar a quienes buscan trabajo con las empresas y emprendimientos de San Carlos, Tunuyán y Tupungato.</p>
    <p>La plataforma centraliza búsquedas laborales que antes se dispersaban en grupos de WhatsApp, carteles y contactos personales. Del lado de las empresas, permite publicar una búsqueda en minutos y recibir postulaciones ordenadas. Del lado de las personas, permite crear un perfil con foto y CV, y postularse en un toque.</p>
    <h2>Cómo funciona</h2>
    <ul><li>Las empresas crean una cuenta y publican su búsqueda.</li><li>El equipo de WorkUco revisa cada publicación antes de que sea visible.</li><li>Las personas crean su perfil y se postulan con un toque.</li><li>La empresa recibe las postulaciones en su panel, las ordena por etapa y decide a quién contactar.</li></ul>
    <h2>Gratis para empezar</h2>
    <p>Publicar y postularse es gratuito. Más adelante vamos a sumar opciones para destacar búsquedas y planes para empresas que publican con frecuencia, sin cambiar lo que ya funciona.</p>`,
  contacto: `<h1>Contacto</h1>
    <p class="lead">¿Tenés una consulta sobre una oferta, tu cuenta o una publicación?</p>
    <div class="info-card"><h2 style="margin-top:0">Escribinos</h2>
      <p>Email: {{EMAIL}}</p>
      <p>Horario de atención: lunes a viernes de 9 a 18 h.</p>
      <p>También podés escribirnos desde la cuenta de empresa que creaste; respondemos dentro de las 24 horas hábiles.</p>
    </div>
    <h2>Para empresas</h2>
    <p>Si necesitás ayuda para publicar tu primera búsqueda, escribinos con el asunto “Publicar empleo” y te acompañamos.</p>`,
  faq: `<h1>Preguntas frecuentes</h1>
    <h2>¿Publicar tiene costo?</h2><p>No. Publicar una búsqueda y postularse son gratuitos. Si en el futuro hay opciones pagas, se van a informar con su precio antes de contratarlas y el uso básico va a seguir siendo gratis.</p>
    <h2>¿Cuánto tarda en aprobarse una publicación?</h2><p>Revisamos las publicaciones dentro de las 24 horas hábiles. Si falta información o el aviso incumple los términos (por ejemplo, pide "buena presencia" o una edad determinada), lo rechazamos con un motivo para que puedas corregirlo.</p>
    <h2>¿Necesito CV para postularme?</h2><p>No es obligatorio. Podés cargar tu CV en tu perfil (PDF de hasta 4 MB) y postularte en un toque, o postularte solo con tus datos.</p>
    <h2>¿Desde qué edad puedo usar WorkUco?</h2><p>Desde los 16 años, que es la edad mínima para trabajar en Argentina. Entre los 16 y los 18 años rigen reglas especiales de jornada y tareas que la empresa tiene que respetar.</p>
    <h2>¿Quién ve mis datos?</h2><p>Tu teléfono, tu mail y tu CV los ve sólo la empresa a la que te postulás (y el equipo de WorkUco). Si activás <strong>"Estoy disponible para trabajar"</strong>, las empresas registradas ven tu nombre, foto, titular, localidad, rubros y habilidades en la base de talento, pero no tu teléfono ni tu mail. Si activás el <strong>perfil público</strong>, cualquiera con el link ve esa misma información. Las dos opciones están apagadas hasta que las prendas, y las podés apagar cuando quieras. No vendemos datos.</p>
    <h2>¿Qué es el análisis con IA?</h2><p>Es una ayuda opcional para empresas: resume los CV recibidos. La empresa conecta su propia IA y puede activarla o desactivarla. Para hacerlo, el texto de tu CV se envía a ese proveedor, que puede estar fuera del país. WorkUco no usa tus datos para entrenar modelos.</p>
    <h2>Vi un aviso "tomado de un canal". ¿Qué es?</h2><p>Para que las búsquedas del Valle no se pierdan en grupos de WhatsApp, a veces publicamos avisos que circulan en canales públicos de empleo, citando de dónde salieron. La empresa puede reclamar el aviso o pedir que lo borremos. Mientras no lo reclame, no mostramos su teléfono ni su mail: te postulás por WorkUco y te avisamos.</p>
    <h2>¿Qué es la Guía del Valle?</h2><p>Un lugar para encontrar oficios (gasistas, electricistas, albañiles…), servicios, salidas y comida de San Carlos, Tunuyán y Tupungato, con su horario, si están abiertos ahora y su WhatsApp. Si tenés un oficio o un comercio, sumá tu ficha gratis desde "Mis servicios" en tu perfil o desde el panel de tu empresa.</p>
    <h2>¿Por qué está mi comercio en la guía si no lo cargué?</h2><p>Armamos algunas fichas con los datos que el comercio ya publicó (Google Maps, Instagram, carteles) para que más gente lo encuentre. Si es tuya, podés reclamarla gratis para editarla y ver cuánta gente te contacta, o pedir que la borremos. Escribinos y te mandamos el link.</p>
    <h2>¿Puedo postularme a la misma oferta dos veces?</h2><p>No. El sistema toma tu email como referencia para evitar postulaciones duplicadas a la misma búsqueda.</p>
    <h2>¿Cómo elimino mi cuenta?</h2><p>Desde <a class="link-inline" href="/baja">Botón de baja</a> o desde tu perfil, en "Tus datos": borra tu cuenta, tu CV, tus fotos y tus postulaciones en el momento. También podés descargar una copia de tus datos antes.</p>`,
  terminos: `<h1>Términos y condiciones</h1>
    <p class="lead">Versión {{TERMS_VERSION}} · Última actualización: noviembre de 2026.</p>
    <div class="info-card"><p style="margin:0">{{RESPONSABLE}}</p></div>
    <h2>1. Qué es WorkUco</h2><p>WorkUco es un portal gratuito de publicación y búsqueda de empleo para el Valle de Uco (San Carlos, Tunuyán y Tupungato, Mendoza). No somos empleadores ni una agencia de colocación, nunca cobramos por buscar trabajo ni por postularse, y no participamos en la relación laboral entre empresas y personas. El único servicio pago para personas es el CV Pro (punto 7), que es opcional. No garantizamos conseguir empleo ni cubrir una búsqueda.</p>
    <h2>2. Cuentas</h2><ul><li>Para crear una cuenta de persona hay que tener <strong>16 años o más</strong>. Entre los 16 y los 18 años, la contratación tiene que respetar el régimen de trabajo adolescente (jornada reducida, sin tareas nocturnas, penosas, peligrosas ni insalubres).</li><li>Quien crea una cuenta de empresa declara que la representa.</li><li>Las cuentas son personales. Cuidá tu contraseña: sos responsable de lo que se haga desde tu cuenta.</li><li>Podés darte de baja cuando quieras desde el <a class="link-inline" href="/baja">Botón de baja</a>, sin trámites y sin costo.</li></ul>
    <h2>3. Publicaciones de empresas</h2><ul><li>La empresa es responsable de que el aviso sea verdadero, de cumplir la legislación laboral y de usar los datos de los postulantes sólo para esa búsqueda.</li><li><strong>No se permiten avisos discriminatorios</strong> (Ley 23.592 y arts. 17 y 81 de la Ley de Contrato de Trabajo): no se puede pedir una edad, un sexo o género, estado civil, no tener hijos, "buena presencia", aspecto físico, religión, nacionalidad u opinión política o gremial, salvo que una ley lo exija para la tarea (por ejemplo, ser mayor de 18).</li><li>No se permiten avisos engañosos, de esquemas piramidales, ni que pidan pagos, cursos pagos o inversiones a los postulantes.</li><li>Al subir textos, fotos o flyers, la empresa declara que tiene derecho a usarlos y autoriza a WorkUco a mostrarlos en el sitio y compartirlos para difundir la búsqueda.</li><li>WorkUco revisa los avisos y puede rechazar, editar el formato o dar de baja los que incumplan estas reglas.</li></ul>
    <h2>4. Guía del Valle</h2><p>Personas y comercios pueden publicar fichas gratis en la guía, que revisamos antes de publicarlas. Cada uno es responsable de que lo que publica sea verdadero y de tener derecho a usar las fotos. Las fichas <strong>"Destacado"</strong> son publicidad y siempre se muestran con esa etiqueta. WorkUco puede armar fichas de comercios con datos que el comercio publicó para que lo contacten; el dueño puede reclamarlas o pedir que las borremos con el link que le mandamos o escribiendo a {{EMAIL}}, y no las volvemos a cargar. Las fichas de oficios de personas sólo se cargan con su autorización.</p>
    <h2>5. Avisos tomados de canales públicos</h2><p>Para reunir las búsquedas del Valle, el equipo puede publicar avisos difundidos en canales públicos de empleo, indicando la fuente. Sólo se toma lo necesario para que la búsqueda llegue a más gente; mientras la empresa no reclame el aviso, no se muestran su teléfono ni su mail. La empresa recibe un link para <strong>reclamar</strong> el aviso (y manejar sus postulantes) o <strong>borrarlo</strong> con un toque, y no volvemos a publicarla. También puede pedirlo escribiendo a {{EMAIL}}: lo borramos dentro de los 5 días hábiles.</p>
    <h2>6. Postulaciones</h2><p>Al postularte, autorizás que tus datos, tu mensaje y tu CV se compartan con la empresa del aviso, que debe usarlos sólo para evaluar tu candidatura. WorkUco nunca te va a pedir dinero para postularte: si una empresa lo hace, avisanos.</p>
    <h2>7. CV Pro (servicio pago y opcional)</h2><ul><li>El CV Pro analiza tu CV o tu perfil con inteligencia artificial y arma un CV nuevo, redactado y diseñado para vos. <strong>El análisis y la vista previa son gratis</strong>; el CV completo cuesta el precio que se muestra antes de pagar (hoy, {{CV_PRICE}} final), y se paga con Mercado Pago.</li><li>La IA <strong>no inventa datos</strong>: redacta mejor y ordena lo que vos das. Antes de usar el CV, revisá que todo sea correcto; sos responsable de lo que figura en tu CV.</li><li>Incluye descargarlo las veces que quieras, cambiar el diseño y el color, y 3 reescrituras con IA.</li><li><strong>Botón de arrepentimiento:</strong> tenés 10 días corridos desde el pago para arrepentirte (Ley 24.240, art. 34), escribiendo a {{EMAIL}}. Te devolvemos el pago completo por el mismo medio.</li><li>Los avisos destacados para empresas también son servicios pagos, con el precio a la vista antes de pagar.</li></ul>
    <h2>8. Uso aceptable</h2><p>No está permitido usar el sitio para juntar datos de otras personas, mandar publicidad no pedida, suplantar identidades ni afectar el funcionamiento del servicio.</p>
    <h2>9. Responsabilidad</h2><p>WorkUco pone los medios razonables para que el servicio funcione y los avisos sean reales, pero no responde por el contenido que publican terceros ni por las decisiones de contratación. Nada de esto limita los derechos que te da la Ley 24.240 de Defensa del Consumidor.</p>
    <h2>10. Cambios</h2><p>Si cambiamos estos términos, lo avisamos en el sitio antes de que rijan. Si no estás de acuerdo, podés darte de baja.</p>
    <h2>11. Ley aplicable</h2><p>Se aplican las leyes de la República Argentina. Si sos consumidor, podés reclamar ante los tribunales y las oficinas de Defensa del Consumidor de tu domicilio.</p>`,
  privacidad: `<h1>Política de privacidad</h1>
    <p class="lead">Cómo tratamos tus datos en WorkUco, según la Ley 25.326 de Protección de Datos Personales.</p>
    <div class="info-card"><p style="margin:0">{{RESPONSABLE}}</p>{{REGISTRO}}</div>
    <h2>Qué datos recopilamos y para qué</h2>
    <ul>
      <li><strong>Personas:</strong> nombre, email, teléfono y contraseña (obligatorios para crear la cuenta). Localidad, foto, titular, experiencia, estudios, habilidades, rubros, sueldo pretendido y CV son opcionales: sin ellos podés usar el sitio, pero las empresas tienen menos información para elegirte y el cálculo de compatibilidad es menos preciso.</li>
      <li><strong>Empresas:</strong> nombre, email, teléfono, sitio web, logo, fotos, descripción, cantidad de empleados (opcional) y los avisos que publican.</li>
      <li><strong>Propuestas de servicios para empresas:</strong> si una empresa marca en su panel que le interesa un servicio (automatización con IA, página web, programas a medida) <em>y</em> acepta que la contactemos, usamos su nombre, email, teléfono y lo que nos cuente para escribirle con propuestas sobre ese servicio. Es opcional, no hace falta para usar WorkUco y se puede retirar en cualquier momento desde el panel (Soluciones).</li>
      <li><strong>Postulaciones:</strong> los datos que mandás, tu mensaje y tu CV, para que la empresa evalúe tu candidatura.</li>
      <li><strong>CV Pro (opcional):</strong> si lo usás, con tu consentimiento mandamos el texto de tu CV (o las fotos que subas) y los datos de tu perfil al proveedor de inteligencia artificial de WorkUco para analizarlo y redactar el CV nuevo. El archivo que subís no se guarda; guardamos el texto leído, el análisis y el CV generado mientras tengas la cuenta, y los borramos con ella. El pago lo procesa Mercado Pago: WorkUco no ve los datos de tu tarjeta.</li>
      <li><strong>Avisos tomados de canales públicos:</strong> el texto o flyer del aviso y el nombre y contacto del anunciante, para difundir la búsqueda y avisarle que puede reclamarla o borrarla.</li>
      <li><strong>Guía del Valle:</strong> las fichas de oficios, servicios, salidas y comida muestran lo que su dueño eligió publicar (nombre, rubro, localidades, dirección, horario, fotos, WhatsApp, teléfono, Instagram y sitio). Contamos las visitas y los toques en WhatsApp, llamar y cómo llegar, sin guardar quién los hizo, para mostrarle al dueño sus estadísticas. WorkUco también puede armar fichas de comercios con datos públicos que el propio comercio publicó (por ejemplo en Google Maps o Instagram) para que lo contacten; esas fichas no se indexan en buscadores hasta que el dueño las reclama, y el dueño puede reclamarlas o pedir que las borremos. Las fichas de oficios de personas sólo se cargan si la persona nos autorizó.</li>
      <li><strong>Uso técnico:</strong> una cookie de sesión (<code>wk_sess</code>) para mantenerte conectado, y preferencias guardadas en tu navegador. No usamos cookies de publicidad ni de seguimiento.</li>
    </ul>
    <p>No pedimos ni queremos datos sensibles (salud, religión, origen étnico, opiniones políticas, afiliación sindical, vida sexual). No los pongas en tu CV ni en tu perfil.</p>
    <h2>Quién ve tus datos</h2>
    <ul>
      <li>La empresa a la que te postulás: los datos de tu postulación y tu CV.</li>
      <li>Si activás "Estoy disponible para trabajar": las empresas registradas ven tu nombre, foto, titular, localidad, rubros y habilidades (nunca tu teléfono ni tu mail hasta que te postulás).</li>
      <li>Si activás el perfil público: cualquiera con el link ve esa misma información.</li>
      <li>El equipo de WorkUco, para operar y moderar el sitio.</li>
    </ul>
    <p>No vendemos ni cedemos datos con fines publicitarios.</p>
    <h2>Proveedores y transferencia internacional</h2>
    <p>Para funcionar usamos proveedores que tratan datos por cuenta nuestra: el servicio de alojamiento del sitio; Resend (Estados Unidos), que envía los mails de la cuenta y los avisos, y recibe tu dirección de mail y el texto de cada aviso; el proveedor de inteligencia artificial de WorkUco, sólo si usás el CV Pro o si el equipo carga avisos de canales públicos; Mercado Pago, que procesa los pagos; y, sólo si una empresa lo activa, el proveedor de inteligencia artificial que esa empresa elige para resumir los CV que recibe. Algunos de ellos pueden estar fuera de Argentina, en países que la AAIP no considera con nivel adecuado de protección. Al aceptar esta política consentís esa transferencia, que se limita a lo necesario para prestar el servicio. El sitio también carga tipografías de Google Fonts, que recibe la dirección IP de tu navegador.</p>
    <h2>Cuánto tiempo los guardamos</h2>
    <p>Mientras tengas la cuenta; las sesiones vencen solas.</p>
    <ul><li><strong>Si una persona se da de baja</strong>, borramos en el momento su cuenta, su foto de perfil, su CV, sus postulaciones (también las que hizo sin cuenta con el mismo mail), alertas, guardados, invitaciones y los avisos de "nueva postulación" con su nombre que recibieron las empresas.</li><li><strong>Si una empresa se da de baja</strong>, borramos en el momento su cuenta, su logo, sus fotos, sus avisos y las postulaciones que recibió.</li><li>Mientras la empresa tenga la cuenta, sus avisos y las postulaciones que recibió se conservan hasta que los borre.</li></ul>
    <h2>Seguridad</h2>
    <p>Las contraseñas se guardan cifradas, el sitio funciona con conexión segura (HTTPS) y los CV sólo se descargan con una sesión autorizada.</p>
    <h2>Tus derechos</h2>
    <p>Podés acceder a tus datos, corregirlos, actualizarlos y pedir que se borren:</p>
    <ul>
      <li><strong>Descargar tus datos</strong> y <strong>borrar tu cuenta</strong> en el momento, desde tu perfil ("Tus datos") o desde el <a class="link-inline" href="/baja">Botón de baja</a>.</li>
      <li><strong>Corregir</strong> tus datos desde tu perfil o tu panel.</li>
      <li>O escribiendo a {{EMAIL}}: respondemos los pedidos de acceso dentro de los 10 días corridos y los de corrección o supresión dentro de los 5 días hábiles.</li>
    </ul>
    <p class="legal-note">El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>`,
  baja: `<h1>Botón de baja</h1>
    <p class="lead">Darte de baja de WorkUco es gratis, inmediato y no tiene trámites.</p>
    <div data-baja></div>
    <h2>¿Qué se borra?</h2>
    <ul><li><strong>Personas:</strong> tu cuenta, tu perfil, tu foto, tu CV, tus postulaciones (también las que hiciste sin cuenta con el mismo mail), alertas, guardados, invitaciones y tus fichas de la Guía del Valle con sus fotos.</li><li><strong>Empresas:</strong> tu cuenta, tus avisos con sus postulaciones, tu logo, tus fotos y tus fichas de la Guía del Valle.</li></ul>
    <h2>¿Sin acceso a tu cuenta?</h2><p>Escribinos a {{EMAIL}} desde el mail con el que te registraste: verificamos que el pedido venga de esa dirección, borramos la cuenta dentro de los 5 días hábiles y te respondemos confirmándolo. Si sos una empresa con un aviso "tomado de un canal", usá el link que te mandamos o escribinos y lo borramos.</p>`,
};

/* Tipos de aviso por mail que cada cuenta puede prender o apagar */
const MAIL_LABELS = {
  candidate: [['postulaciones', 'Novedades de mis postulaciones'], ['invitaciones', 'Invitaciones de empresas'], ['alertas', 'Alertas de búsquedas que guardé'], ['guia', 'Novedades de mis fichas en la guía']],
  company: [['postulantes', 'Postulantes nuevos'], ['avisos', 'Novedades de mis avisos (publicado, con cambios)'], ['guia', 'Novedades de mis fichas en la guía']],
};

/* Pestaña "Preferencias" de la persona: dónde, jornada, modalidad y changas. Se guarda sola al tocar. */
async function initPrefs(root) {
  if (!root) return;
  const meta = await loadMeta();
  const pr = (state.user && state.user.candidate && state.user.candidate.prefs) || { localities: [], types: [], modalities: [], gigs: true };
  const chips = (group, list, sel) => list.map((v) => `<button type="button" class="filter-chip${sel.includes(v) ? ' is-active' : ''}" data-pref="${group}" data-value="${esc(v)}" aria-pressed="${sel.includes(v)}">${esc(v)}</button>`).join('');
  root.innerHTML = `<div class="card prefs-card">
    <h2>Tus preferencias</h2>
    <p class="sub">Con esto armamos "Para vos", calculamos la compatibilidad y filtramos la búsqueda al entrar. Siempre podés sacar el filtro.</p>
    <div class="prefs-group"><h3>Dónde querés trabajar</h3><p class="soft-text">Además de donde vivís.</p><div class="filter-chips">${chips('localities', meta.localities, pr.localities)}</div></div>
    <div class="prefs-group"><h3>Jornada</h3><p class="soft-text">Si no elegís ninguna, te mostramos todas.</p><div class="filter-chips">${chips('types', meta.types, pr.types)}</div></div>
    <div class="prefs-group"><h3>Modalidad</h3><div class="filter-chips">${chips('modalities', meta.modalities, pr.modalities)}</div></div>
    <label class="switch-row prefs-group"><input type="checkbox" id="pref-gigs" ${pr.gigs === false ? '' : 'checked'}><span class="switch" aria-hidden="true"></span><span><strong>Me interesan las changas</strong><small>Trabajos por día o por temporada (cosecha, eventos, obra).</small></span></label>
    <p class="soft-text prefs-note">Los avisos por mail se eligen más abajo, en "Tus datos".</p>
  </div>`;
  const save = async (body) => {
    try {
      const r = await api('/api/account/prefs', { method: 'PATCH', body });
      if (state.user && state.user.candidate) state.user.candidate.prefs = r.prefs;
      toast('Preferencias guardadas', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    const on = !b.classList.contains('is-active');
    b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on));
    const group = b.dataset.pref;
    save({ [group]: $$(`[data-pref="${group}"].is-active`, root).map((x) => x.dataset.value) });
  });
  $('#pref-gigs', root).addEventListener('change', (e) => save({ gigs: e.target.checked }));
}

/* "Tus datos": descargar una copia (derecho de acceso) y darse de baja (supresión). Va en el
   perfil, en el panel de empresa y en /baja. La baja pide la contraseña y borra todo en el momento. */
function accountDataHtml(role) {
  const who = role === 'company' ? 'la cuenta de la empresa, sus avisos con sus postulaciones, el logo y las fotos' : 'tu cuenta, tu perfil, tu foto, tu CV, tus postulaciones, alertas y guardados';
  const acc = (state.user && (state.user.candidate || state.user.company)) || {};
  return `<div class="card account-data" data-account-data>
    <h2>Tus datos</h2>
    <p class="sub">Tu contraseña, los avisos por mail y todo lo que WorkUco guarda sobre ${role === 'company' ? 'tu empresa' : 'vos'}.</p>
    <fieldset class="account-mail">
      <legend>Qué avisos te llegan por mail <small>(la campanita de la página recibe todo)</small></legend>
      ${MAIL_LABELS[role].map(([k, label]) => `<label class="check-row"><input type="checkbox" data-mail-type="${k}" ${((acc.prefs || {}).mail || {})[k] === false ? '' : 'checked'}><span>${label}</span></label>`).join('')}
    </fieldset>
    <div class="account-data-actions">
      <button class="btn btn-outline btn-sm" type="button" data-pass-open aria-expanded="false" aria-controls="pass-form">${icon('lock', 16)} Cambiar contraseña</button>
      <a class="btn btn-outline btn-sm" href="/api/account/export" download>${icon('file', 16)} Descargar mis datos</a>
      <button class="btn btn-ghost btn-sm btn-danger-text" type="button" data-baja-open aria-expanded="false" aria-controls="baja-form">${icon('trash', 16)} Darme de baja</button>
    </div>
    <form class="pass-form" id="pass-form" hidden novalidate>
      <div class="field"><label for="pass-current">Contraseña actual</label><input class="input" id="pass-current" type="password" autocomplete="current-password" required><span class="error-text" data-error="current" hidden></span></div>
      <div class="field"><label for="pass-next">Contraseña nueva <span class="hint">(mínimo 8)</span></label><input class="input" id="pass-next" type="password" autocomplete="new-password" minlength="8" required><span class="error-text" data-error="next" hidden></span></div>
      <div id="pass-alert" hidden></div>
      <div class="gate-actions"><button class="btn btn-primary" type="submit">Guardar contraseña</button><button class="btn btn-ghost" type="button" data-pass-cancel>Cancelar</button></div>
    </form>
    <form class="baja-form" id="baja-form" hidden novalidate>
      <p><strong>Se borra ${who}.</strong> No se puede deshacer.</p>
      <div class="field"><label for="baja-pass">Escribí tu contraseña para confirmar</label><input class="input" id="baja-pass" type="password" autocomplete="current-password" required><span class="error-text" data-error="password" hidden></span></div>
      <div id="baja-alert" hidden></div>
      <div class="gate-actions"><button class="btn btn-danger" type="submit">Borrar mi cuenta definitivamente</button><button class="btn btn-ghost" type="button" data-baja-cancel>Cancelar</button></div>
    </form>
  </div>`;
}
function setupAccountData(root) {
  const box = $('[data-account-data]', root);
  if (!box) return;
  /* avisos por mail */
  $$('[data-mail-type]', box).forEach((cb) => cb.addEventListener('change', async () => {
    try {
      await api('/api/account/prefs', { method: 'PATCH', body: { mail: { [cb.dataset.mailType]: cb.checked } } });
      toast(cb.checked ? 'Ese aviso te va a llegar por mail' : 'Listo: ese aviso ya no te llega por mail', 'ok');
    } catch (err) { cb.checked = !cb.checked; toast(err.message, 'err'); }
  }));
  /* cambiar contraseña */
  const pform = $('#pass-form', box);
  const popen = $('[data-pass-open]', box);
  const ptoggle = (on) => { pform.hidden = !on; popen.setAttribute('aria-expanded', String(on)); if (on) $('#pass-current', pform).focus(); };
  popen.addEventListener('click', () => ptoggle(pform.hidden));
  $('[data-pass-cancel]', pform).addEventListener('click', () => ptoggle(false));
  pform.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert($('#pass-alert', pform));
    setFieldErrors(pform, {});
    const btn = $('[type=submit]', pform);
    btn.disabled = true;
    try {
      await api('/api/account/password', { method: 'POST', body: { current: $('#pass-current', pform).value, next: $('#pass-next', pform).value } });
      pform.reset(); ptoggle(false);
      toast('Contraseña cambiada. Cerramos las sesiones de otros equipos.', 'ok');
    } catch (err) {
      showAlert($('#pass-alert', pform), err.message, 'error');
      setFieldErrors(pform, err.fields);
    } finally { btn.disabled = false; }
  });
  /* baja */
  const form = $('#baja-form', box);
  const open = $('[data-baja-open]', box);
  const toggle = (on) => { form.hidden = !on; open.setAttribute('aria-expanded', String(on)); if (on) $('#baja-pass', form).focus(); };
  open.addEventListener('click', () => toggle(form.hidden));
  $('[data-baja-cancel]', form).addEventListener('click', () => toggle(false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert($('#baja-alert', form));
    setFieldErrors(form, {});
    const btn = $('[type=submit]', form);
    btn.disabled = true;
    try {
      await api('/api/account/delete', { method: 'POST', body: { password: $('#baja-pass', form).value } });
      state.user = null;
      location.href = '/?baja=1';
    } catch (err) {
      showAlert($('#baja-alert', form), err.message, 'error');
      setFieldErrors(form, err.fields);
      btn.disabled = false;
    }
  });
}

/* Recuperar contraseña: sin código pide el link; con código (?t=) crea la contraseña nueva. */
function initReset() {
  const params = new URLSearchParams(location.search);
  /* el código llega después del # (no viaja al servidor) y se borra de la barra y del historial */
  const token = (/[#&]t=([a-f0-9]{64})/.exec(location.hash) || [])[1] || params.get('t') || '';
  if (token) history.replaceState(null, '', '/restablecer');
  if (!token) {
    $('#reset-ask').hidden = false;
    if (params.get('rol') === 'empresa') $('#ask-form input[value=company]').checked = true;
    const form = $('#ask-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert($('#ask-alert'));
      setFieldErrors(form, {});
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        const d = await api('/api/auth/forgot', { method: 'POST', body: { email: $('#ask-email').value.trim(), role: $('#ask-form input[name=role]:checked').value } });
        showAlert($('#ask-alert'), d.message, 'success');
        form.hidden = true;
      } catch (err) {
        showAlert($('#ask-alert'), err.message, 'error');
        setFieldErrors(form, err.fields);
        btn.disabled = false;
      }
    });
    return;
  }
  $('#reset-set').hidden = false;
  const form = $('#set-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert($('#set-alert'));
    setFieldErrors(form, {});
    const pass = $('#set-pass').value;
    if (pass !== $('#set-pass2').value) { setFieldErrors(form, { password2: 'Las dos contraseñas no coinciden' }); return; }
    const btn = $('[type=submit]', form);
    btn.disabled = true;
    try {
      const d = await api('/api/auth/reset', { method: 'POST', body: { token, password: pass } });
      $('#reset-set').innerHTML = `<div class="auth-logged"><div class="success-ring">${icon('check', 26)}</div><h1>Listo, ya tenés contraseña nueva</h1><p>Ingresá con tu email y la contraseña que acabás de crear.</p><div class="gate-actions"><a class="btn btn-primary" href="/acceder?rol=${d.role === 'company' ? 'empresa' : 'empleado'}">Ingresar</a></div></div>`;
    } catch (err) {
      showAlert($('#set-alert'), `${err.message} `, 'error');
      $('#set-alert').insertAdjacentHTML('beforeend', '<a class="link-inline" href="/restablecer">Pedir otro link</a>');
      setFieldErrors(form, err.fields);
      btn.disabled = false;
    }
  });
}

async function initInfo() {
  const key = location.pathname.replace('/', '');
  const root = $('[data-info]');
  if (!root || !INFO[key]) return;
  let meta = {};
  try { meta = await loadMeta(); } catch (_) { /* sin meta, quedan los datos por defecto */ }
  const l = meta.legal || {};
  const mail = esc(l.email || 'contacto.workuco@gmail.com');
  const resp = [l.name ? `<strong>Responsable:</strong> ${esc(l.name)}` : '<strong>Responsable:</strong> WorkUco',
    l.cuit ? `CUIT ${esc(l.cuit)}` : '', l.address ? `Domicilio legal: ${esc(l.address)}` : '',
    `Contacto: <a class="link-inline" href="mailto:${mail}">${mail}</a>`].filter(Boolean).join(' · ');
  root.innerHTML = INFO[key]
    .replace(/\{\{RESPONSABLE\}\}/g, resp)
    .replace(/\{\{EMAIL\}\}/g, `<a class="link-inline" href="mailto:${mail}">${mail}</a>`)
    .replace(/\{\{TERMS_VERSION\}\}/g, esc(l.termsVersion || ''))
    .replace(/\{\{CV_PRICE\}\}/g, `$ ${Number((meta.cvPro && meta.cvPro.price) || 5000).toLocaleString('es-AR')}`)
    .replace(/\{\{REGISTRO\}\}/g, l.dbRegistry ? `<p style="margin:6px 0 0">Base de datos inscripta en el Registro Nacional de Bases de Datos Personales: ${esc(l.dbRegistry)}.</p>` : '');
  const baja = $('[data-baja]', root);
  if (baja) {
    const u = state.user;
    if (u && (u.role === 'candidate' || u.role === 'company')) { baja.innerHTML = accountDataHtml(u.role); setupAccountData(baja); }
    else baja.innerHTML = `<div class="card"><p style="margin-top:0">Ingresá a tu cuenta y tocá <strong>Darme de baja</strong>. Se borra todo en el momento.</p><a class="btn btn-primary" href="/acceder?next=/baja">Ingresar para darme de baja</a></div>`;
  }
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

/* Página /cosecha: avisos de Agricultura y changas del Valle; los del Pack Cosecha salen arriba */
async function initCosecha() {
  const list = $('#cosecha-list');
  let loc = '';
  const load = async () => {
    try {
      const qs = new URLSearchParams({ cosecha: '1', limit: '30' });
      if (loc) qs.set('locality', loc);
      const { jobs, total } = await api(`/api/jobs?${qs}`);
      $('[data-cosecha-count]').textContent = total === 1 ? '1 aviso de cosecha' : `${total} avisos de cosecha`;
      list.innerHTML = jobs.length ? jobs.map(jobCard).join('')
        : `<div class="empty" style="grid-column:1/-1"><h3>Todavía no hay avisos de cosecha${loc ? ` en ${esc(loc)}` : ''}</h3><p>Volvé pronto: en temporada se publican todas las semanas.</p></div>`;
    } catch (err) {
      list.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar los avisos</h3><p>${esc(err.message)}</p></div>`;
    }
  };
  $$('[data-cosecha-loc]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-cosecha-loc]').forEach((x) => x.classList.toggle('is-on', x === b));
    loc = b.dataset.cosechaLoc;
    load();
  }));
  await load();
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
  document.title = `CV de ${c.name} · WorkUco`;
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
      <div class="cv-foot">CV generado con WorkUco · el portal de empleo del Valle de Uco</div>
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
      <p>La persona puede haberlo ocultado. Igual podés buscar empleo o talento en WorkUco.</p>
      <a class="btn btn-primary" href="/">Ir al inicio</a></div></div>`;
    return;
  }
  document.title = `${p.name} · WorkUco`;
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
/* RECLAMAR UNA FICHA IMPORTADA                                       */
/* ================================================================== */
async function initClaim() {
  const root = $('#claim-root');
  const token = location.pathname.split('/').pop();
  let data;
  try {
    data = await api(`/api/claim/${encodeURIComponent(token)}`);
  } catch (err) {
    root.innerHTML = `<section class="section"><div class="container"><div class="empty">
      <h3>${err.status === 429 ? 'Demasiados intentos' : 'Este link ya se usó o no existe'}</h3>
      <p>${err.status === 429 ? esc(err.message) : 'Si tu empresa ya reclamó su ficha, ingresá con tu cuenta. Si necesitás ayuda, escribinos.'}</p>
      <a class="btn btn-primary" href="/acceder?rol=empresa&next=/panel">Ingresar</a></div></div></section>`;
    return;
  }
  const { company, jobs, applicationsCount, reasons = [] } = data;
  document.title = `${company.name} en WorkUco`;
  const n = applicationsCount;
  root.innerHTML = `<section class="band-night claim-hero">
    <div class="container">
      <h1 class="display-sm">${esc(company.name)} ya está en WorkUco.</h1>
      <p class="hero-sub">Publicamos ${jobs.length === 1 ? 'su búsqueda' : `sus ${jobs.length} búsquedas`} de canales de empleo de la zona para que llegue${jobs.length === 1 ? '' : 'n'} a más gente del Valle.
        ${n ? `<strong>${n} ${n === 1 ? 'persona ya se postuló' : 'personas ya se postularon'}.</strong>` : ''} Ustedes deciden qué hacemos con esto.</p>
      <div class="claim-choices">
        <button class="claim-choice is-main" type="button" data-claim-open="mine"><strong>Es nuestra: la quiero administrar</strong><span>Gratis. Ves postulantes, editás avisos y publicás nuevos.</span></button>
        <button class="claim-choice" type="button" data-claim-open="fix"><strong>Corregir datos</strong><span>Reclamala y editá el aviso desde tu panel.</span></button>
        <button class="claim-choice is-danger" type="button" data-claim-open="delete"><strong>Borrarla de WorkUco</strong><span>Se elimina ya y no la volvemos a publicar.</span></button>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="container claim-grid">
      <div>
        <h2>Así se ve hoy</h2>
        <div class="jobs-grid jobs-grid-2">${jobs.map(jobCard).join('')}</div>
      </div>
      <aside class="card claim-panel" id="claim-panel" hidden></aside>
    </div>
  </section>`;

  const panel = $('#claim-panel');
  const openForm = (mode) => {
    panel.hidden = false;
    if (mode === 'delete') {
      panel.innerHTML = `<h3>¿Borramos la ficha de ${esc(company.name)}?</h3>
        <p class="soft-text">Se eliminan la ficha, ${jobs.length === 1 ? 'el aviso' : 'los avisos'} y ${n === 1 ? 'la postulación recibida' : 'las postulaciones recibidas'}. A quienes se postularon les avisamos que la búsqueda se retiró. No la volvemos a importar.</p>
        <fieldset class="reason-pick">
          <legend>¿Por qué lo borramos?</legend>
          <div class="reason-chips" role="radiogroup" aria-label="Motivo">${reasons.map((r) => `<button type="button" role="radio" aria-checked="false" class="reason-chip" data-reason="${esc(r.id)}">${esc(r.label)}</button>`).join('')}</div>
          <span class="error-text" id="reason-error" hidden>Elegí un motivo</span>
          <label class="sr-only" for="claim-comment">Comentario (opcional)</label>
          <textarea class="input" id="claim-comment" rows="2" maxlength="300" placeholder="Si querés, contanos algo más (opcional)"></textarea>
        </fieldset>
        <div class="gate-actions"><button class="btn btn-danger" type="button" id="claim-delete">Sí, borrar</button><button class="btn btn-ghost" type="button" data-claim-cancel>Cancelar</button></div>`;
      let reason = '';
      $$('[data-reason]', panel).forEach((b) => b.addEventListener('click', () => {
        reason = b.dataset.reason;
        $$('[data-reason]', panel).forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
        $('#reason-error').hidden = true;
        if (reason === 'otro') $('#claim-comment').focus();
      }));
      $('#claim-delete').addEventListener('click', async (e) => {
        if (!reason) { $('#reason-error').hidden = false; $('.reason-chip', panel)?.focus(); return; }
        e.currentTarget.disabled = true;
        try {
          await api(`/api/claim/${encodeURIComponent(token)}/delete`, { method: 'POST', body: { reason, comment: $('#claim-comment').value.trim() } });
          root.innerHTML = '<section class="section"><div class="container"><div class="empty"><h3>Listo, la borramos</h3><p>Su empresa ya no aparece en WorkUco y no la vamos a volver a publicar. Gracias por avisarnos.</p><a class="btn btn-outline" href="/">Ir al inicio</a></div></div></section>';
        } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
      });
    } else {
      panel.innerHTML = `<h3>${mode === 'fix' ? 'Reclamá la ficha para corregirla' : 'Creá tu acceso'}</h3>
        <p class="soft-text">Con este email y contraseña vas a entrar a tu panel de empresa.</p>
        <div id="claim-alert" hidden></div>
        <form id="claim-form" novalidate>
          <div class="field"><label for="cl-email">Email</label><input class="input" id="cl-email" name="email" type="email" autocomplete="email" required><span class="error-text" data-error="email" hidden></span></div>
          <div class="field"><label for="cl-pass">Contraseña <span class="hint">(mínimo 8)</span></label><input class="input" id="cl-pass" name="password" type="password" autocomplete="new-password" minlength="8" required><span class="error-text" data-error="password" hidden></span></div>
          <div class="field"><label class="check-row" for="cl-terms"><input type="checkbox" id="cl-terms" required><span>Acepto los <a href="/terminos" target="_blank" rel="noopener">términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>, y declaro que represento a esta empresa.</span></label><span class="error-text" data-error="acceptTerms" hidden></span></div>
          <div class="gate-actions"><button class="btn btn-primary" type="submit">Es nuestra, entrar al panel</button><button class="btn btn-ghost" type="button" data-claim-cancel>Cancelar</button></div>
        </form>`;
      $('#claim-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert($('#claim-alert'));
        const btn = $('#claim-form [type=submit]');
        btn.disabled = true;
        try {
          await api(`/api/claim/${encodeURIComponent(token)}/accept`, { method: 'POST', body: { email: $('#cl-email').value.trim(), password: $('#cl-pass').value, acceptTerms: $('#cl-terms').checked } });
          location.href = mode === 'fix' ? '/panel#ofertas' : '/panel';
        } catch (err) {
          btn.disabled = false;
          showAlert($('#claim-alert'), err.message, 'error');
          setFieldErrors($('#claim-form'), err.fields);
        }
      });
      $('#cl-email').focus();
    }
    $$('[data-claim-cancel]', panel).forEach((b) => b.addEventListener('click', () => { panel.hidden = true; }));
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $$('[data-claim-open]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.claimOpen)));
}

/* ================================================================== */
/* WIK WORKS (antes "modo flyers"): feed vertical tipo TikTok                            */
/* ================================================================== */
function genFlyer(j) {
  return `<div class="fgen" role="img" aria-label="${esc(`${j.title} en ${j.companyName}`)}">
    <span class="fgen-tag">${j.gig ? 'Changa' : 'Se busca'}</span>
    <h3 class="fgen-title">${esc(j.title)}</h3>
    <p class="fgen-co">${esc(j.companyName)}</p>
    ${j.salaryLabel ? `<p class="fgen-pay">${esc(nbMoney(j.salaryLabel))}</p>` : ''}
    <p class="fgen-meta">${esc(j.locality)} · ${esc(j.type)}${j.gig && j.startDate ? ` · empieza ${esc(fmtDay(j.startDate))}` : ''}</p>
    <svg class="fgen-ridge" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70 L50 40 L90 62 L140 22 L190 58 L240 30 L290 64 L340 34 L400 56 V120 H0Z" fill="#17302a"/><path d="M0 96 L60 76 L120 92 L180 72 L250 94 L320 74 L400 90 V120 H0Z" fill="#12241d"/></svg>
  </div>`;
}

function feedSlide(j, saved) {
  const flyers = j.flyers || [];
  const alt = (i) => `Flyer${flyers.length > 1 ? ` ${i + 1}` : ''}: ${j.title} en ${j.companyName}`;
  return `<article class="fslide" data-job="${esc(j.id)}" data-bg="${esc(flyers[0] || '')}" data-locality="${esc(j.locality)}" aria-label="${esc(`${j.title} en ${j.companyName}`)}">
    <div class="fslide-media">
      ${flyers.length ? `<div class="fslide-flyers flyer-rail" data-flyer-rail>${flyers.map((src, i) => `<div class="flyer-slide">${flyerFrame(src, alt(i))}</div>`).join('')}</div>
        ${flyers.length > 1 ? `<div class="flyer-dots fslide-dots">${flyers.map((_, i) => `<button type="button" class="flyer-dot${i === 0 ? ' is-on' : ''}" data-flyer-dot="${i}" aria-label="Ver flyer ${i + 1}"></button>`).join('')}</div>` : ''}`
        : genFlyer(j)}
    </div>
    ${feedMatch(j.match)}
    <div class="fslide-bottom">
      <div class="fslide-row">
        <button class="fround" type="button" data-feed-share="${esc(j.id)}" data-title="${esc(j.title)}" data-company="${esc(j.companyName)}" aria-label="Compartir aviso">${icon('share', 20)}</button>
        <div class="fslide-info">
          <h2>${esc(j.title)}</h2>
          <p>${esc(j.companyName)} · ${esc(j.locality)}${j.gig ? ' · <strong>Changa</strong>' : ''}${j.featured ? ' · <strong class="fslide-feat">Destacada</strong>' : ''}</p>
        </div>
        <button class="fround${saved ? ' is-on' : ''}" type="button" data-feed-save="${esc(j.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Quitar de guardados' : 'Guardar aviso'}">${icon('heart', 20)}</button>
      </div>
      <div class="fswipe" data-swipe>
        <span class="fswipe-label">Deslizá para postularte y ver todo</span>
        <a class="fswipe-knob" href="/oferta/${esc(j.id)}" data-swipe-knob draggable="false" aria-label="Postularme y ver todo el aviso: ${esc(j.title)}">${icon('arrow', 20)}</a>
      </div>
    </div>
  </article>`;
}

/* Compatibilidad con el perfil: arriba a la derecha; se explica la primera vez y después queda en "85%". */
function feedMatch(m) {
  if (!m || m.score == null) return '';
  const cls = m.score >= 70 ? '' : m.score >= 45 ? ' is-mid' : ' is-low';
  const why = (m.reasons || []).slice(0, 2).join(' · ');
  return `<button class="fmatch${cls}" type="button" data-feed-match aria-expanded="false"${why ? ` title="${esc(why)}"` : ""} style="--pct:${Number(m.score)}">
    <span class="fmatch-ring" aria-hidden="true"></span><b>${Number(m.score)}%</b>
    <span class="fmatch-text"><span>compatible con tu perfil</span></span>
  </button>`;
}

/* La barra de abajo: se arrastra la perilla hasta el final para ir al aviso completo.
   Se puede agarrar desde cualquier parte de la barra (en la compu se suele agarrar el texto).
   La perilla es un link: en la compu el navegador arrancaría su propio "arrastrar link" y cancelaría
   el gesto (pointercancel), por eso no es arrastrable y el pointerdown del mouse no hace nada por defecto. */
function setupSwipe(track) {
  const knob = $('[data-swipe-knob]', track);
  let start = null; let max = 0; let x = 0; let moved = false;
  const set = (v) => { x = v; knob.style.transform = `translateX(${v}px)`; track.style.setProperty('--swipe', String(max ? v / max : 0)); };
  track.addEventListener('dragstart', (e) => e.preventDefault());
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // sin selección de texto ni arrastre del link
    start = e.clientX; moved = false; max = track.clientWidth - knob.offsetWidth - 8;
    track.classList.remove('is-hint');
    track.setPointerCapture(e.pointerId); track.classList.add('is-drag');
  });
  knob.addEventListener('animationend', () => track.classList.remove('is-hint'));
  track.addEventListener('pointermove', (e) => {
    if (start == null) return;
    const v = Math.min(max, Math.max(0, e.clientX - start));
    if (v > 4) moved = true;
    set(v);
  });
  const end = () => {
    if (start == null) return;
    start = null; track.classList.remove('is-drag');
    if (x >= max * 0.82) { set(max); track.classList.add('is-done'); location.href = knob.href; return; }
    set(0);
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  /* un toque sin deslizar no navega: muestra el gesto. El teclado (Enter) sí entra directo. */
  track.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    e.preventDefault();
    if (!moved) { track.classList.remove('is-hint'); void track.offsetWidth; track.classList.add('is-hint'); }
  });
}

async function initFlyers() {
  const feed = $('#feed');
  const bg = $('#feed-bg');
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const filter = { locality: '', gig: '' };
  const fPrefs = state.user && state.user.role === 'candidate' && state.user.candidate.prefs ? state.user.candidate.prefs.localities : [];
  if (fPrefs.length) {
    filter.locality = fPrefs.join(',');
    const pb = $('#feed-place span');
    if (pb) pb.textContent = fPrefs.length > 1 ? 'Tus localidades' : fPrefs[0];
  }
  let page = 1; let pages = 1; let loading = false; let loadedOnce = false;
  const saved = new Set();

  /* el feed ocupa justo lo que queda de pantalla debajo del encabezado */
  const fit = () => { feed.style.height = `${Math.max(200, window.innerHeight - feed.getBoundingClientRect().top - window.scrollY)}px`; };
  fit();
  window.addEventListener('resize', fit);

  /* la compatibilidad se explica abierta la primera vez y después se pliega; tocándola se vuelve a abrir */
  let explained = false;
  const openMatch = (b, ms) => {
    b.setAttribute('aria-expanded', 'true');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.setAttribute('aria-expanded', 'false'), ms);
  };
  const visible = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const src = e.target.dataset.bg;
      bg.style.backgroundImage = src ? `url('${src.replace(/'/g, '%27')}')` : '';
      $$('.fslide[aria-current]', feed).forEach((s) => s.removeAttribute('aria-current'));
      e.target.setAttribute('aria-current', 'true');
      const m = $('[data-feed-match]', e.target);
      if (m && !explained) { explained = true; openMatch(m, 4000); }
    }
  }, { root: feed, threshold: 0.6 });

  /* mantener apretado el flyer: se esconde todo y queda sólo la imagen */
  let hold = null; let holdAt = null;
  const peek = (on) => { feed.classList.toggle('is-peek', on); feed.parentElement.classList.toggle('is-peek', on); };
  const peekOff = () => { clearTimeout(hold); hold = null; holdAt = null; peek(false); };
  feed.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.fslide-media') || e.target.closest('button, a')) return;
    holdAt = [e.clientX, e.clientY];
    hold = setTimeout(() => peek(true), 350);
  });
  feed.addEventListener('pointermove', (e) => {
    if (holdAt && !feed.classList.contains('is-peek') && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 10) peekOff();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => feed.addEventListener(t, peekOff));
  feed.addEventListener('scroll', () => { if (hold && !feed.classList.contains('is-peek')) peekOff(); }, { passive: true });
  feed.addEventListener('contextmenu', (e) => { if (e.target.closest('.fslide-media')) e.preventDefault(); });

  /* lugar: un solo botón que abre la lista */
  const placeBtn = $('#feed-place');
  const placeMenu = $('#feed-menu');
  const closeMenu = () => { placeMenu.hidden = true; placeBtn.setAttribute('aria-expanded', 'false'); };
  const more = new IntersectionObserver((entries) => {
    /* sólo se pide la página siguiente si no hay otra cargando: al terminar se vuelve a observar */
    if (!loading && entries.some((e) => e.isIntersecting) && page < pages) { page += 1; load(false); }
  }, { root: feed, rootMargin: '0px 0px 100% 0px' });

  const message = (title, body, link) => `<div class="fslide fslide-msg"><div><h2>${title}</h2><p>${body}</p>${link}</div></div>`;

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) { page = 1; feed.innerHTML = '<div class="fslide fslide-loading"><div class="skeleton"></div></div>'; feed.scrollTop = 0; }
    const qs = new URLSearchParams({ sort: 'flyer', limit: '10', page: String(page) });
    if (filter.locality) qs.set('locality', filter.locality);
    if (filter.gig) qs.set('gig', '1');
    try {
      const d = await api(`/api/jobs?${qs}`);
      pages = d.pages;
      (d.saved || []).forEach((id) => saved.add(id));
      if (reset) feed.innerHTML = '';
      if (!d.jobs.length && page === 1) {
        feed.innerHTML = message('No hay avisos con ese filtro', 'Probá con todo el Valle o mirá las búsquedas en la lista.', '<button class="btn btn-lime" type="button" data-feed-filter="">Ver todo el Valle</button>');
      } else {
        feed.insertAdjacentHTML('beforeend', d.jobs.map((j) => feedSlide(j, saved.has(j.id))).join(''));
        if (page >= pages) feed.insertAdjacentHTML('beforeend', message('Viste todas las búsquedas', 'Volvé más tarde: cada día se suman avisos nuevos del Valle.', '<a class="btn btn-lime" href="/buscar">Ver la lista completa</a>'));
      }
      const slides = $$('.fslide[data-job]', feed);
      slides.forEach((s) => { if (!s.dataset.ready) { s.dataset.ready = '1'; visible.observe(s); setupFlyerRail($('.fslide-media', s)); setupSwipe($('[data-swipe]', s)); } });
      more.disconnect();
      /* se vigila el último: si alguien baja de golpe hasta el final, igual se pide la página siguiente */
      if (slides.length && page < pages) more.observe(slides[slides.length - 1]);
      loadedOnce = true;
    } catch (err) {
      if (!loadedOnce || reset) feed.innerHTML = message('No pudimos cargar los avisos', esc(err.message), '<button class="btn btn-lime" type="button" data-feed-retry>Reintentar</button>');
    } finally { loading = false; }
  }

  const go = (dir) => feed.scrollBy({ top: dir * feed.clientHeight, behavior: calm ? 'auto' : 'smooth' });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, #feed-menu')) { if (e.key === 'Escape' && !placeMenu.hidden) { closeMenu(); placeBtn.focus(); } return; }
    if (e.key === 'Escape' && !placeMenu.hidden) { closeMenu(); placeBtn.focus(); return; }
    if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) { e.preventDefault(); go(1); }
    if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); go(-1); }
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('#feed-place')) {
      const open = placeMenu.hidden;
      placeMenu.hidden = !open;
      placeBtn.setAttribute('aria-expanded', String(open));
      return;
    }
    const chip = e.target.closest('[data-feed-filter]');
    if (chip) {
      const v = chip.dataset.feedFilter;
      filter.gig = v === 'gig' ? '1' : '';
      filter.locality = v === 'gig' ? '' : v;
      $$('#feed-menu [data-feed-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.feedFilter === v)));
      $('span', placeBtn).textContent = v === 'gig' ? 'Changas' : (v || 'Todo el Valle');
      closeMenu();
      load(true);
      return;
    }
    if (!placeMenu.hidden && !e.target.closest('#feed-menu')) closeMenu();
    const mt = e.target.closest('[data-feed-match]');
    if (mt) {
      if (mt.getAttribute('aria-expanded') === 'true') { clearTimeout(mt._t); mt.setAttribute('aria-expanded', 'false'); } else openMatch(mt, 5000);
      return;
    }
    if (e.target.closest('[data-feed-retry]')) { load(true); return; }
    const sv = e.target.closest('[data-feed-save]');
    if (sv) {
      const u = state.user;
      if (!u) { location.href = '/acceder?rol=empleado&next=/flyers'; return; }
      if (u.role !== 'candidate') { toast('Guardar avisos es para cuentas de persona', 'err'); return; }
      try {
        const { saved: on } = await api(`/api/candidate/saved/${sv.dataset.feedSave}`, { method: 'POST' });
        sv.classList.toggle('is-on', on);
        sv.setAttribute('aria-pressed', String(on));
        sv.setAttribute('aria-label', on ? 'Quitar de guardados' : 'Guardar aviso');
        toast(on ? 'Guardado en Mi perfil' : 'Quitado de guardados', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      return;
    }
    const sh = e.target.closest('[data-feed-share]');
    if (sh) {
      const url = `${location.origin}/oferta/${sh.dataset.feedShare}`;
      const text = `${sh.dataset.title} en ${sh.dataset.company} · WorkUco`;
      try {
        if (navigator.share) await navigator.share({ title: sh.dataset.title, text, url });
        else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`, '_blank', 'noopener');
      } catch (_) { /* compartir cancelado */ }
    }
  });

  await load(true);
  feed.focus({ preventScroll: true });
}

/* ================================================================== */
/* ARRANQUE                                                           */
/* ================================================================== */
window.WK = {
  $, $$, api, esc, toast, showAlert, hideAlert, setFieldErrors, icon, logoHtml, avatarHtml,
  state, loadMe, loadMeta, fmtDate, timeAgo, initials, stageBadge, STAGE_LABEL, statusBadge,
  initPrefs, jobCard, jobRow, gigCard, shrinkImage, flyerFrame, setupFlyerRail, matchPill, payHtml, responseHtml, profileCompleteness, setupCarousel, fileToBase64, ready: null,
};

/* Deslizamiento suave al aparecer (sólo en la portada, que es la página de presentación):
   cada sección sube 14px y aparece una sola vez; las tarjetas de una grilla, escalonadas. */
function setupReveal() {
  if (!('IntersectionObserver' in window)) return;
  const items = [];
  $$('main > .section').forEach((sec) => {
    const head = $('.section-head', sec);
    if (head) items.push([head, 0]);
    $$('.container > :not(.section-head)', sec).forEach((el) => {
      const kids = el.children.length >= 3 && el.children.length <= 12 ? [...el.children] : [el];
      kids.forEach((k, i) => items.push([k, Math.min(i, 5)]));
    });
  });
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(([el, i]) => { el.classList.add('reveal'); el.style.setProperty('--i', i); io.observe(el); });
  document.documentElement.classList.add('reveal-ready');
}

/* ---------- botón flotante de Wik Works (sólo celular; se apaga con la ✕ o desde el menú) ---------- */
const WIK_KEY = 'wk_wik_btn';
const WIK_SEEN = 'wk_wik_seen';
/* páginas donde estorbaría: el propio Wik Works, herramientas, formularios y fichas con barra abajo */
const WIK_SKIP = new Set(['flyers', 'panel', 'admin', 'publish', 'auth', 'claim', 'claim-place', 'reset', 'place', 'cv', 'cvpro']);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* modo privado: no se recuerda */ } };
function setupWikFab(page) {
  const toggle = $('[data-wik-toggle]');
  const paintToggle = () => {
    if (!toggle) return;
    const on = lsGet(WIK_KEY) !== 'off';
    toggle.setAttribute('aria-pressed', String(on));
    const st = $('[data-wik-state]', toggle); if (st) st.textContent = on ? 'Activado' : 'Desactivado';
  };
  let fab = null;
  let onScroll = null;
  const remove = () => { if (fab) { fab.remove(); fab = null; } if (onScroll) { window.removeEventListener('scroll', onScroll); onScroll = null; } };
  const mount = () => {
    if (fab || WIK_SKIP.has(page) || lsGet(WIK_KEY) === 'off') return;
    fab = document.createElement('div');
    fab.className = 'wik-fab';
    fab.setAttribute('data-wik-fab', '');
    const first = !lsGet(WIK_SEEN);
    if (first) { fab.classList.add('is-labeled'); lsSet(WIK_SEEN, '1'); setTimeout(() => fab && fab.classList.remove('is-labeled'), 4500); }
    fab.innerHTML = `<a class="wik-fab-go" href="/flyers" aria-label="Abrir Wik Works: avisos en formato flyer">
        <svg viewBox="4.7 9.5 30.6 21" width="26" height="18" fill="none" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 15.6 12.4 28.4 18 18" stroke="#f5f1e6"/><path d="M18 18 22.8 26.8 33.2 11.6" stroke="#c8f560"/></svg>
        <span class="wik-fab-label">Wik Works</span></a>
      <button class="wik-fab-x" type="button" data-wik-hide aria-label="Ocultar el botón de Wik Works">${icon('x', 12)}</button>`;
    document.body.appendChild(fab);
    $('[data-wik-hide]', fab).addEventListener('click', () => {
      lsSet(WIK_KEY, 'off'); remove(); paintToggle();
      toast('Listo, lo ocultamos. Lo podés volver a activar desde el menú.', 'ok');
    });
    /* se esconde al bajar y vuelve al subir; también mientras está el cartel de instalar la app */
    let lastY = window.scrollY;
    onScroll = () => {
      if (!fab) return;
      const y = window.scrollY;
      if (y > lastY + 8 && y > 160) fab.classList.add('is-away');
      else if (y < lastY - 8 || y < 160) fab.classList.remove('is-away');
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    if (!setupWikFab.watching) setupWikFab.watching = new MutationObserver(() => {
      const el = document.querySelector('[data-wik-fab]'); if (el) el.classList.toggle('is-covered', !!document.querySelector('.install-banner.is-in'));
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  };
  if (toggle) {
    toggle.addEventListener('click', () => {
      const on = lsGet(WIK_KEY) === 'off';
      lsSet(WIK_KEY, on ? 'on' : 'off');
      if (on) mount(); else remove();
      paintToggle();
      toast(on ? 'Botón de Wik Works activado' : 'Botón de Wik Works desactivado', 'ok');
    });
  }
  paintToggle();
  mount();
}

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  const page = document.body.dataset.page;
  setupWikFab(page);
  if (page === 'home') setupReveal();
  let resolveReady;
  window.WK.ready = new Promise((r) => { resolveReady = r; });
  try {
    await loadMe();
  } catch (_) {}
  resolveReady();
  if (new URLSearchParams(location.search).get('baja') === '1') toast('Tu cuenta y tus datos se borraron', 'ok');
  /* admin: botón "Gestionar" en cada oferta y ficha de las páginas públicas */
  if (state.user && state.user.role === 'admin') {
    const s = document.createElement('script');
    s.src = '/admin-tools.js';
    document.body.appendChild(s);
  }
  /* entradas al CV Pro: sólo si el servicio está activo (y no para empresas) */
  if ($$('[data-cvpro]').length) {
    loadMeta().then((m) => {
      const on = !!(m.cvPro && m.cvPro.enabled) && !(state.user && state.user.role === 'company');
      $$('[data-cvpro]').forEach((el) => { el.hidden = !on; });
    }).catch(() => {});
  }
  /* "Tus datos" en el perfil y en el panel de empresa */
  $$('[data-account-slot]').forEach((slot) => {
    const u = state.user;
    if (u && u.role === slot.dataset.accountSlot) { slot.innerHTML = accountDataHtml(u.role); setupAccountData(slot); }
  });
  try {
    switch (page) {
      case 'home': await initHome(); break;
      case 'search': await initSearch(); break;
      case 'job': await initJob(); break;
      case 'publish': await initPublish(); break;
      case 'auth': await initAuth(); break;
      case 'companies': await initCompanies(); break;
      case 'company': await initCompanyPage(); break;
      case 'info': await initInfo(); break;
      case 'gigs': await initGigs(); break;
      case 'cosecha': await initCosecha(); break;
      case 'cv': await initCv(); break;
      case 'public-profile': await initPublicProfile(); break;
      case 'claim': await initClaim(); break;
      case 'flyers': await initFlyers(); break;
      case 'guide': await window.WKGuia.initGuia(); break;
      case 'place': await window.WKGuia.initPlace(); break;
      case 'claim-place': await window.WKGuia.initClaimPlace(); break;
      case 'reset': initReset(); break;
      default: break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Ocurrió un error', 'err');
  }
});
