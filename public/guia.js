/* =====================================================================
   WorkUco · Guía del Valle (oficios, servicios, salidas y comida)
   Usa los helpers de app.js (window.WK). Páginas: /guia, /guia/:slug,
   /reclamar-ficha/:token, la banda de la portada y los editores de fichas.
   ===================================================================== */
(function () {
  'use strict';
  const W = window.WK;
  const { $, $$, api, esc, toast } = W;

  const SECTION_ICON = {
    oficios: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5Z"/>',
    servicios: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2M4 12h16"/>',
    salidas: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    comida: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.2 0-4 2.5-4 6v4h4"/>',
    todo: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const sIcon = (k, size = 18) => `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SECTION_ICON[k] || SECTION_ICON.todo}</svg>`;
  const LOCALITIES = ['San Carlos', 'Tunuyán', 'Tupungato'];
  const SECTION_LABEL = { oficios: 'Oficios', servicios: 'Servicios', salidas: 'Salidas', comida: 'Comida' };
  const DAYS = [['lun', 'Lunes'], ['mar', 'Martes'], ['mie', 'Miércoles'], ['jue', 'Jueves'], ['vie', 'Viernes'], ['sab', 'Sábado'], ['dom', 'Domingo']];
  let SECTIONS = null;

  /* ---------- piezas comunes ---------- */
  function openLabel(o) {
    if (!o) return '';
    if (o.state === 'open') return `<span class="place-open is-open">Abierto${o.until ? ` · cierra ${esc(o.until)}` : ''}</span>`;
    if (o.state === 'always') return '<span class="place-open is-open">Abierto las 24 horas</span>';
    if (o.state === 'closed') return `<span class="place-open is-closed">Cerrado${o.opens ? ` · abre ${esc(o.opens)}` : ' ahora'}</span>`;
    if (o.state === 'appointment') return '<span class="place-open is-turno">Con turno</span>';
    return '';
  }
  function placeholder(p) {
    return `<div class="place-ph is-${esc(p.section)}" aria-hidden="true">
      <span class="place-ph-letter">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>
      <svg class="place-ph-ridge" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 70 L50 40 L90 62 L140 22 L190 58 L240 30 L290 64 L340 34 L400 56 V120 H0Z" fill="rgba(255,255,255,.08)"/><path d="M0 96 L60 76 L120 92 L180 72 L250 94 L320 74 L400 90 V120 H0Z" fill="rgba(0,0,0,.18)"/></svg>
    </div>`;
  }
  const waIcon = '<svg class="icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 9.5c.3 1.6 1.9 3.6 3.6 4.2l1-1 1.7.7-.3 1.5c-2.9.3-6.7-2.8-7-5.9l1.4-.4.8 1.6-1.2-.7Z"/></svg>';

  function placeCard(p) {
    const href = `/guia/${esc(p.slug)}`;
    return `<article class="place-card">
      <a class="place-cover" href="${href}" tabindex="-1" aria-hidden="true">
        ${p.cover ? W.flyerFrame(p.coverThumb || p.cover, '', 'place-photo') : placeholder(p)}
        ${p.featured ? '<span class="badge badge-featured place-feat">Destacado</span>' : ''}
      </a>
      <div class="place-body">
        <span class="place-cat">${sIcon(p.section, 15)} ${esc(p.category)}</span>
        <h3 class="place-name"><a href="${href}">${esc(p.name)}</a></h3>
        <p class="place-loc">${esc(p.localities.join(' · '))}${p.homeService ? ' · A domicilio' : ''}</p>
        ${openLabel(p.open)}
      </div>
      ${p.waUrl ? `<a class="btn btn-wa btn-sm place-wa" href="${esc(p.waUrl)}" target="_blank" rel="noopener" data-contact="whatsapp" data-place="${esc(p.id)}">${waIcon} WhatsApp</a>` : ''}
    </article>`;
  }

  /* cada toque en WhatsApp, llamar o cómo llegar suma un contacto (estadística para el dueño) */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-contact][data-place]');
    if (!a) return;
    try {
      fetch(`/api/places/${encodeURIComponent(a.dataset.place)}/contact`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: a.dataset.contact }),
      }).catch(() => {});
    } catch (_) { /* sin estadística, no pasa nada */ }
  });

  /* ---------- /guia ---------- */
  async function initGuia() {
    const params = new URLSearchParams(location.search);
    const st = {
      section: params.get('seccion') || '', category: params.get('rubro') || '', locality: params.get('lugar') || '',
      q: params.get('q') || '', open: params.get('abierto') === '1', page: 1,
    };
    const list = $('#guia-list');
    const count = $('#guia-count');
    const moreWrap = $('#guia-more-wrap');
    $('#guia-q').value = st.q;
    $('#guia-place').value = LOCALITIES.includes(st.locality) ? st.locality : '';
    $('#guia-open').checked = st.open;

    const syncUrl = () => {
      const u = new URLSearchParams();
      if (st.section) u.set('seccion', st.section);
      if (st.category) u.set('rubro', st.category);
      if (st.locality) u.set('lugar', st.locality);
      if (st.q) u.set('q', st.q);
      if (st.open) u.set('abierto', '1');
      history.replaceState(null, '', `/guia${u.toString() ? `?${u}` : ''}`);
    };
    const renderTabs = () => {
      const tabs = [['', 'Todo'], ...Object.entries(SECTIONS).map(([k, v]) => [k, v.label])];
      $('#guia-tabs').innerHTML = tabs.map(([k, label]) => `<button type="button" class="guia-tab${st.section === k ? ' is-active' : ''}" role="tab" aria-selected="${st.section === k}" data-section="${esc(k)}">${sIcon(k || 'todo', 18)}<span>${esc(label)}</span></button>`).join('');
      const cats = st.section ? SECTIONS[st.section].categories : [];
      $('#guia-cats').innerHTML = cats.map((c) => `<button type="button" class="filter-chip${st.category === c ? ' is-active' : ''}" data-cat="${esc(c)}" aria-pressed="${st.category === c}">${esc(c)}</button>`).join('');
      $('#guia-cats').hidden = !cats.length;
    };
    async function load(reset) {
      if (reset) { st.page = 1; list.innerHTML = '<div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:260px"></div>'; }
      const qs = new URLSearchParams({ page: String(st.page), limit: '12' });
      if (st.section) qs.set('section', st.section);
      if (st.category) qs.set('category', st.category);
      if (st.locality) qs.set('locality', st.locality);
      if (st.q) qs.set('q', st.q);
      if (st.open) qs.set('open', '1');
      try {
        const d = await api(`/api/places?${qs}`);
        if (!SECTIONS) { SECTIONS = d.sections; renderTabs(); }
        const html = d.places.map(placeCard).join('');
        if (reset) list.innerHTML = html || `<div class="empty guia-empty"><h3>Todavía no hay fichas con ese filtro</h3><p>Probá con todo el Valle o con otra sección. ¿Tenés un oficio o un comercio? <a class="link-inline" href="/mi-perfil?tab=servicios">Sumá tu ficha gratis</a>.</p></div>`;
        else list.insertAdjacentHTML('beforeend', html);
        count.textContent = d.total === 1 ? '1 ficha' : `${d.total} fichas`;
        moreWrap.hidden = st.page >= d.pages;
      } catch (err) {
        list.innerHTML = `<div class="empty"><h3>No pudimos cargar la guía</h3><p>${esc(err.message)}</p></div>`;
      }
    }
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-section]');
      if (tab && $('#guia-tabs').contains(tab)) { st.section = tab.dataset.section; st.category = ''; renderTabs(); syncUrl(); load(true); return; }
      const cat = e.target.closest('[data-cat]');
      if (cat) { st.category = st.category === cat.dataset.cat ? '' : cat.dataset.cat; renderTabs(); syncUrl(); load(true); }
    });
    $('#guia-search').addEventListener('submit', (e) => { e.preventDefault(); st.q = $('#guia-q').value.trim(); st.locality = $('#guia-place').value; syncUrl(); load(true); });
    $('#guia-place').addEventListener('change', () => { st.locality = $('#guia-place').value; syncUrl(); load(true); });
    $('#guia-open').addEventListener('change', () => { st.open = $('#guia-open').checked; syncUrl(); load(true); });
    $('#guia-more').addEventListener('click', () => { st.page += 1; load(false); });
    await load(true);
  }

  /* ---------- /guia/:slug ---------- */
  function hoursHtml(h) {
    if (!h) return '<p class="soft-text">Consultá el horario por WhatsApp.</p>';
    if (h.mode === '24h') return '<p class="hours-mode">Abierto las 24 horas, todos los días.</p>';
    if (h.mode === 'turno') return '<p class="hours-mode">Atiende con turno: escribí para coordinar.</p>';
    const today = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date(Date.now() - 3 * 3600e3).getUTCDay()];
    return `<table class="hours-table"><tbody>${DAYS.map(([k, label]) => {
      const r = (h.days && h.days[k]) || [];
      return `<tr${k === today ? ' class="is-today"' : ''}><th scope="row">${label}${k === today ? ' <small>hoy</small>' : ''}</th><td>${r.length ? r.map(([o, c]) => `${esc(o)} a ${esc(c)}`).join(' y ') : 'Cerrado'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  async function initPlace() {
    const root = $('#ficha');
    const slug = location.pathname.split('/').pop();
    let d;
    try { d = await api(`/api/places/${encodeURIComponent(slug)}`); } catch (err) {
      root.innerHTML = `<div class="empty"><h3>Esta ficha no está disponible</h3><p>${esc(err.message)}</p><a class="btn btn-primary" href="/guia">Ver la guía</a></div>`;
      return;
    }
    const p = d.place;
    const meta = await W.loadMeta().catch(() => ({}));
    const u = W.state.user;
    const isAdmin = u && u.role === 'admin';
    /* el servidor arma el número sin el 15 (tel:+54 + 10 dígitos) */
    const tel = (p.telUrl || '').replace(/^tel:/, '');
    const actions = [
      p.waUrl ? `<a class="btn btn-wa" href="${esc(p.waUrl)}" target="_blank" rel="noopener" data-contact="whatsapp" data-place="${esc(p.id)}">${waIcon} WhatsApp</a>` : '',
      tel ? `<a class="btn btn-outline" href="tel:${esc(tel)}" data-contact="calls" data-place="${esc(p.id)}">${W.icon('phone', 17)} Llamar</a>` : '',
      p.mapsUrl ? `<a class="btn btn-outline" href="${esc(p.mapsUrl)}" target="_blank" rel="noopener" data-contact="maps" data-place="${esc(p.id)}">${W.icon('pin', 17)} Cómo llegar</a>` : '',
    ].join('');
    const links = [
      p.instagram ? `<a class="link-inline" href="https://www.instagram.com/${esc(p.instagram)}" target="_blank" rel="noopener">Instagram @${esc(p.instagram)}</a>` : '',
      p.website ? `<a class="link-inline" href="${esc(p.website)}" target="_blank" rel="noopener nofollow">Sitio web</a>` : '',
    ].filter(Boolean).join(' · ');
    const ownerBox = d.canEdit ? `<div class="ficha-owner"><strong>Esta es tu ficha.</strong> ${p.status === 'approved' ? 'Está publicada.' : p.status === 'pending' ? 'Está en revisión.' : p.status === 'rejected' ? `Necesita cambios: ${esc(p.rejectReason)}` : 'Está oculta.'}
      <a class="link-inline" href="${p.ownerType === 'company' ? '/panel#guia' : '/mi-perfil?tab=servicios'}">Editarla y ver estadísticas</a></div>` : '';
    const unclaimed = !p.claimed ? `<div class="ficha-claim">${W.icon('sparkles', 17)}<p>Ficha armada por WorkUco con datos públicos. <strong>¿Es tuya?</strong> Reclamala o pedí que la borremos${meta.contactWaUrl ? `: <a class="link-inline" href="${esc(meta.contactWaUrl)}" target="_blank" rel="noopener">escribinos por WhatsApp</a>` : ` escribiéndonos a ${esc((meta.legal && meta.legal.email) || 'contacto.workuco@gmail.com')}`}.${isAdmin && p.claimUrl ? ` <br><span class="soft-text">Link de reclamo (sólo admin): ${esc(p.claimUrl)}</span>` : ''}</p></div>` : '';
    root.innerHTML = `
      <nav class="breadcrumbs" aria-label="Migas"><a href="/guia">Guía del Valle</a><span>/</span><a href="/guia?seccion=${esc(p.section)}">${esc(SECTION_LABEL[p.section] || p.section)}</a></nav>
      ${ownerBox}
      <div class="ficha-grid">
        <div class="ficha-media">
          ${p.photos.length ? `<div class="flyer-rail ficha-rail" data-flyer-rail>${p.photos.map((src, i) => `<div class="flyer-slide">${W.flyerFrame(src, `Foto ${i + 1} de ${p.name}`)}</div>`).join('')}</div>
            ${p.photos.length > 1 ? `<div class="flyer-dots">${p.photos.map((_, i) => `<button type="button" class="flyer-dot${i ? '' : ' is-on'}" data-flyer-dot="${i}" aria-label="Ver foto ${i + 1}"></button>`).join('')}</div>` : ''}`
            : `<div class="ficha-ph">${placeholder(p)}</div>`}
        </div>
        <div class="ficha-info">
          <span class="place-cat">${sIcon(p.section, 15)} ${esc(p.category)}</span>
          ${p.featured ? '<span class="badge badge-featured">Destacado</span>' : ''}
          <h1 class="ficha-name">${esc(p.name)}</h1>
          <p class="ficha-loc">${W.icon('pin', 16)} ${esc(p.localities.join(' · '))}${p.address ? ` — ${esc(p.address)}` : ''}${p.homeService ? ' · <strong>Va a domicilio</strong>' : ''}</p>
          ${openLabel(p.open)}
          <div class="ficha-actions">${actions}<button class="btn btn-ghost" type="button" data-share>${W.icon('share', 17)} Compartir</button></div>
          ${links ? `<p class="ficha-links">${links}</p>` : ''}
        </div>
      </div>
      ${unclaimed}
      <div class="ficha-cols">
        <section class="ficha-block"><h2>Sobre ${esc(p.name)}</h2><div class="prose">${esc(p.description)}</div></section>
        <section class="ficha-block"><h2>Horario</h2>${hoursHtml(p.hours)}</section>
      </div>
      ${p.waUrl || tel ? `<div class="ficha-sticky">${p.waUrl ? `<a class="btn btn-wa" href="${esc(p.waUrl)}" target="_blank" rel="noopener" data-contact="whatsapp" data-place="${esc(p.id)}">${waIcon} WhatsApp</a>` : ''}${tel ? `<a class="btn btn-outline" href="tel:${esc(tel)}" data-contact="calls" data-place="${esc(p.id)}">${W.icon('phone', 17)} Llamar</a>` : ''}</div>` : ''}`;
    W.setupFlyerRail($('.ficha-media', root));
    $('[data-share]', root).addEventListener('click', async () => {
      const url = location.href.split('?')[0];
      const text = `${p.name} · ${p.category} en ${p.localities[0]} · WorkUco`;
      try {
        if (navigator.share) await navigator.share({ title: p.name, text, url });
        else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`, '_blank', 'noopener');
      } catch (_) { /* compartir cancelado */ }
    });
  }

  /* ---------- /reclamar-ficha/:token ---------- */
  async function initClaimPlace() {
    const root = $('#claim-place');
    const token = location.pathname.split('/').pop();
    let p;
    try { p = (await api(`/api/claim-place/${token}`)).place; } catch (err) {
      root.innerHTML = `<div class="empty"><h3>Este link ya se usó o no existe</h3><p>${esc(err.message)}</p><a class="btn btn-primary" href="/guia">Ver la guía</a></div>`;
      return;
    }
    const u = W.state.user;
    const logged = u && (u.role === 'candidate' || u.role === 'company');
    root.innerHTML = `
      <div class="claim-place-head">
        <p class="eyebrow">Guía del Valle</p>
        <h1>¿Esta ficha es tuya?</h1>
        <p class="sub">La armamos con datos públicos para que más gente del Valle te encuentre. Es gratis: reclamala para editarla y ver cuánta gente te contacta, o pedí que la borremos.</p>
      </div>
      <div class="claim-place-grid">
        <div class="claim-place-card">${placeCard({ ...p, waUrl: '' })}</div>
        <div class="claim-place-actions card">
          <h2>Es mía</h2>
          <div id="cp-alert" hidden></div>
          ${logged ? `<p>Se suma a tu cuenta de ${u.role === 'company' ? 'empresa' : 'persona'} (<strong>${esc(u.role === 'company' ? u.company.name : u.candidate.name)}</strong>).</p>
            <button class="btn btn-primary btn-block" type="button" id="cp-accept">Sumarla a mi cuenta</button>`
            : `<form class="auth-form" id="cp-form" novalidate>
              <div class="seg" role="radiogroup" aria-label="Tipo de cuenta">
                <label class="seg-opt"><input type="radio" name="role" value="company" checked><span>Comercio o empresa</span></label>
                <label class="seg-opt"><input type="radio" name="role" value="candidate"><span>Persona (oficio)</span></label>
              </div>
              <div class="field"><label for="cp-name">Nombre</label><input class="input" id="cp-name" autocomplete="name" required><span class="error-text" data-error="name" hidden></span></div>
              <div class="field"><label for="cp-email">Email</label><input class="input" id="cp-email" type="email" autocomplete="email" required><span class="error-text" data-error="email" hidden></span></div>
              <div class="field"><label for="cp-phone">Teléfono</label><input class="input" id="cp-phone" type="tel" autocomplete="tel" required><span class="error-text" data-error="phone" hidden></span></div>
              <div class="field"><label for="cp-pass">Contraseña <span class="hint">(mínimo 8)</span></label><input class="input" id="cp-pass" type="password" autocomplete="new-password" minlength="8" required><span class="error-text" data-error="password" hidden></span></div>
              <div class="field"><label class="check-row" for="cp-terms"><input type="checkbox" id="cp-terms" required><span>Acepto los <a href="/terminos" target="_blank" rel="noopener">términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>, y declaro que la ficha es mía o de mi comercio.</span></label><span class="error-text" data-error="acceptTerms" hidden></span></div>
              <button class="btn btn-primary btn-block" type="submit">Crear mi cuenta y quedármela</button>
              <p class="soft-text">¿Ya tenés cuenta? <a class="link-inline" href="/acceder?next=${encodeURIComponent(location.pathname)}">Ingresá</a> y volvé a este link.</p>
            </form>`}
          <hr class="claim-sep">
          <h2>No es mía o no quiero aparecer</h2>
          <p class="soft-text">La borramos y no la volvemos a cargar.</p>
          <button class="btn btn-danger btn-block" type="button" id="cp-delete">Borrar la ficha</button>
        </div>
      </div>`;
    const done = (role) => {
      root.innerHTML = `<div class="auth-logged"><div class="success-ring">${W.icon('check', 26)}</div><h1>¡Listo, la ficha es tuya!</h1><p>Ya podés editarla, sumar fotos y ver cuánta gente te contacta.</p><div class="gate-actions"><a class="btn btn-primary" href="${role === 'company' ? '/panel#guia' : '/mi-perfil?tab=servicios'}">Ir a mi ficha</a></div></div>`;
    };
    const alertBox = $('#cp-alert');
    if (logged) {
      $('#cp-accept').addEventListener('click', async () => {
        try { done((await api(`/api/claim-place/${token}/accept`, { method: 'POST', body: {} })).role); } catch (err) { W.showAlert(alertBox, err.message, 'error'); }
      });
    } else {
      const form = $('#cp-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        W.hideAlert(alertBox); W.setFieldErrors(form, {});
        try {
          const r = await api(`/api/claim-place/${token}/accept`, { method: 'POST', body: {
            role: $('#cp-form input[name=role]:checked').value, name: $('#cp-name').value.trim(), email: $('#cp-email').value.trim(),
            phone: $('#cp-phone').value.trim(), password: $('#cp-pass').value, acceptTerms: $('#cp-terms').checked,
          } });
          done(r.role);
        } catch (err) { W.showAlert(alertBox, err.message, 'error'); W.setFieldErrors(form, err.fields); }
      });
    }
    let armed = false;
    $('#cp-delete').addEventListener('click', async (e) => {
      if (!armed) { armed = true; e.currentTarget.textContent = 'Tocá de nuevo para borrarla definitivamente'; return; }
      try {
        await api(`/api/claim-place/${token}/delete`, { method: 'POST', body: {} });
        root.innerHTML = '<div class="auth-logged"><div class="success-ring">✓</div><h1>Listo, la borramos</h1><p>No la vamos a volver a cargar. Gracias por avisarnos.</p></div>';
      } catch (err) { W.showAlert(alertBox, err.message, 'error'); }
    });
  }

  /* ---------- banda de la portada ---------- */
  async function initHomeBand() {
    const band = $('#guia-band');
    if (!band) return;
    try {
      const d = await api('/api/places?limit=4');
      $('#guia-home-tiles').innerHTML = Object.entries(d.sections).map(([k, v]) => `<a class="guia-tile is-${esc(k)}" href="/guia?seccion=${esc(k)}">${sIcon(k, 24)}<strong>${esc(v.label)}</strong><small>${esc(v.categories.slice(0, 3).join(', '))}…</small></a>`).join('');
      $('#guia-home-list').innerHTML = d.places.length ? d.places.map(placeCard).join('')
        : '<p class="guia-home-empty">Sé de los primeros en aparecer: <a class="link-inline" href="/mi-perfil?tab=servicios">sumá tu oficio o tu comercio gratis</a>.</p>';
    } catch (_) { band.hidden = true; }
  }

  /* ================================================================
     EDITORES: persona ("Mis servicios"), empresa (panel) y admin
     ================================================================ */
  async function sections() {
    if (!SECTIONS) SECTIONS = (await api('/api/places?limit=3')).sections;
    return SECTIONS;
  }
  const STATUS_TXT = { pending: 'En revisión', approved: 'Publicada', rejected: 'Necesita cambios', hidden: 'Oculta' };
  const statusBadge = (s) => `<span class="badge place-status is-${esc(s)}">${STATUS_TXT[s] || esc(s)}</span>`;

  /* Formulario de ficha. mode: 'owner' (persona o empresa) o 'admin'. place: la ficha a editar (sólo owner). */
  async function placeEditor(root, { mode = 'owner', place = null, onSaved, onCancel } = {}) {
    const S = await sections();
    const p = place || { localities: [], hours: null, photos: [] };
    const h = p.hours || { mode: '' };
    const photos = (p.photos || []).map((url) => ({ url }));
    const dayRow = ([k, label]) => {
      const r = (h.mode === 'horario' && h.days && h.days[k]) || [];
      const v = (i, j) => esc((r[i] && r[i][j]) || '');
      return `<div class="pe-day"><span class="pe-day-name">${label}</span>
        <span class="pe-range"><input class="input" type="time" id="pe-h-${k}-0-a" value="${v(0, 0)}" aria-label="${label}: abre"><span>a</span><input class="input" type="time" id="pe-h-${k}-0-b" value="${v(0, 1)}" aria-label="${label}: cierra"></span>
        <span class="pe-range pe-range-2"><input class="input" type="time" id="pe-h-${k}-1-a" value="${v(1, 0)}" aria-label="${label}: abre (2.º turno)"><span>a</span><input class="input" type="time" id="pe-h-${k}-1-b" value="${v(1, 1)}" aria-label="${label}: cierra (2.º turno)"></span>
      </div>`;
    };
    root.innerHTML = `<form class="card place-editor" id="pe-form" novalidate>
      <h2>${place ? 'Editar ficha' : mode === 'admin' ? 'Cargar una ficha' : 'Nueva ficha en la guía'}</h2>
      ${mode === 'admin' ? '<p class="sub">Usá sólo datos que el comercio publicó (Google Maps, Instagram, carteles). Después avisale con el link para reclamarla o borrarla.</p>' : '<p class="sub">La revisamos antes de publicarla. Después podés cambiar horario, fotos y contacto cuando quieras.</p>'}
      <div id="pe-alert" hidden></div>
      <div class="form-grid">
        <div class="field span-2"><label for="pe-name">Nombre</label><input class="input" id="pe-name" maxlength="80" value="${esc(p.name || '')}" placeholder="Ej.: Gas Don Tito, Pizzería del Centro"><span class="error-text" data-error="name" hidden></span></div>
        <div class="field"><label for="pe-section">Sección</label><select class="input" id="pe-section"><option value="">Elegí…</option>${Object.entries(S).map(([k, v]) => `<option value="${esc(k)}"${p.section === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select><span class="error-text" data-error="section" hidden></span></div>
        <div class="field"><label for="pe-category">Rubro</label><select class="input" id="pe-category"></select><span class="error-text" data-error="category" hidden></span></div>
        <div class="field span-2"><span class="field-label">Dónde atendés</span><div class="filter-chips" id="pe-locs">${LOCALITIES.map((l) => `<button type="button" class="filter-chip${p.localities.includes(l) ? ' is-active' : ''}" data-pe-loc="${esc(l)}" aria-pressed="${p.localities.includes(l)}">${esc(l)}</button>`).join('')}</div><span class="error-text" data-error="localities" hidden></span></div>
        <div class="field span-2"><label for="pe-address">Dirección <span class="hint">(opcional; sirve para "Cómo llegar")</span></label><input class="input" id="pe-address" maxlength="120" value="${esc(p.address || '')}" placeholder="Ej.: San Martín 1250"></div>
        <label class="check-row span-2" id="pe-home-wrap"><input type="checkbox" id="pe-home"${p.homeService ? ' checked' : ''}><span>Voy a domicilio</span></label>
        <div class="field span-2"><label for="pe-desc">Qué hacés o qué ofrecés</label><textarea class="input" id="pe-desc" rows="4" maxlength="1500" placeholder="Contá en pocas líneas qué hacés, qué te diferencia, si tenés matrícula, envíos, etc.">${esc(p.description || '')}</textarea><span class="pe-count" id="pe-desc-count"></span><span class="error-text" data-error="description" hidden></span></div>
        <div class="field"><label for="pe-wa">WhatsApp</label><input class="input" id="pe-wa" type="tel" value="${esc(p.whatsapp || '')}" placeholder="2622 555123"><span class="error-text" data-error="whatsapp" hidden></span></div>
        <div class="field"><label for="pe-phone">Teléfono <span class="hint">(opcional)</span></label><input class="input" id="pe-phone" type="tel" value="${esc(p.phone || '')}"><span class="error-text" data-error="phone" hidden></span></div>
        <div class="field"><label for="pe-ig">Instagram <span class="hint">(opcional)</span></label><input class="input" id="pe-ig" value="${esc(p.instagram ? `@${p.instagram}` : '')}" placeholder="@tucomercio"></div>
        <div class="field"><label for="pe-web">Sitio web <span class="hint">(opcional)</span></label><input class="input" id="pe-web" type="url" value="${esc(p.website || '')}" placeholder="https://"></div>
      </div>

      <fieldset class="pe-hours">
        <legend>Horario</legend>
        <div class="seg seg-3" role="radiogroup" aria-label="Tipo de horario">
          <label class="seg-opt"><input type="radio" name="pe-mode" value="horario"${h.mode === 'horario' ? ' checked' : ''}><span>Por día</span></label>
          <label class="seg-opt"><input type="radio" name="pe-mode" value="24h"${h.mode === '24h' ? ' checked' : ''}><span>24 horas</span></label>
          <label class="seg-opt"><input type="radio" name="pe-mode" value="turno"${h.mode === 'turno' ? ' checked' : ''}><span>Con turno</span></label>
        </div>
        <div id="pe-days" hidden>
          <p class="soft-text">Dejá vacío el día que no abrís. El segundo turno es opcional (ej.: 9 a 13 y 17 a 21). Si cerrás después de medianoche, poné la hora igual (ej.: 23:00 a 05:00).</p>
          ${DAYS.map(dayRow).join('')}
          <button class="btn btn-ghost btn-sm" type="button" data-pe-copy>Copiar el lunes a martes–viernes</button>
        </div>
      </fieldset>

      <div class="field pe-photos-field">
        <span class="field-label">Fotos <span class="hint">(hasta 6; la primera es la portada)</span></span>
        <div class="pe-photo-list" id="pe-photo-list"></div>
        <label class="btn btn-outline btn-sm pe-photo-add">${W.icon('image', 16)} Sumar fotos<input type="file" id="pe-photos" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
        <span class="error-text" data-error="photos" hidden></span>
      </div>

      ${mode === 'admin' ? `<label class="check-row pe-consent" id="pe-consent-wrap" hidden><input type="checkbox" id="pe-consent"><span><strong>La persona me autorizó a publicarla.</strong> Los oficios son de personas: sólo se cargan con su permiso.</span></label><span class="error-text" data-error="consent" hidden></span>` : ''}

      <div class="gate-actions">
        <button class="btn btn-primary" type="submit">${place ? 'Guardar cambios' : mode === 'admin' ? 'Cargar ficha' : 'Enviar a revisión'}</button>
        <button class="btn btn-ghost" type="button" data-pe-cancel>Cancelar</button>
      </div>
    </form>`;

    const form = $('#pe-form', root);
    const sectionSel = $('#pe-section', form);
    const catSel = $('#pe-category', form);
    const fillCats = () => {
      const cats = sectionSel.value ? S[sectionSel.value].categories : [];
      catSel.innerHTML = `<option value="">${cats.length ? 'Elegí…' : 'Primero elegí la sección'}</option>${cats.map((c) => `<option value="${esc(c)}"${p.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
      $('#pe-home-wrap', form).hidden = sectionSel.value !== 'oficios';
      const cw = $('#pe-consent-wrap', form);
      if (cw) cw.hidden = sectionSel.value !== 'oficios';
    };
    sectionSel.addEventListener('change', fillCats);
    fillCats();
    form.addEventListener('click', (e) => {
      const loc = e.target.closest('[data-pe-loc]');
      if (loc) { const on = !loc.classList.contains('is-active'); loc.classList.toggle('is-active', on); loc.setAttribute('aria-pressed', String(on)); }
    });
    const desc = $('#pe-desc', form);
    const countDesc = () => { $('#pe-desc-count', form).textContent = `${desc.value.trim().length} / 1500`; };
    desc.addEventListener('input', countDesc); countDesc();
    const showDays = () => { $('#pe-days', form).hidden = ($('[name="pe-mode"]:checked', form) || {}).value !== 'horario'; };
    $$('[name="pe-mode"]', form).forEach((r) => r.addEventListener('change', showDays)); showDays();
    $('[data-pe-copy]', form).addEventListener('click', () => {
      ['mar', 'mie', 'jue', 'vie'].forEach((d) => ['0-a', '0-b', '1-a', '1-b'].forEach((x) => { $(`#pe-h-${d}-${x}`, form).value = $(`#pe-h-lun-${x}`, form).value; }));
      toast('Copiado a martes–viernes', 'ok');
    });

    const renderPhotos = () => {
      $('#pe-photo-list', form).innerHTML = photos.map((ph, i) => `<div class="pe-photo">
        <img src="${esc(ph.data || ph.url)}" alt="Foto ${i + 1}">
        ${i === 0 ? '<span class="pe-cover">Portada</span>' : `<button type="button" class="pe-ph-btn" data-ph-first="${i}" aria-label="Usar como portada">★</button>`}
        <button type="button" class="pe-ph-btn pe-ph-del" data-ph-del="${i}" aria-label="Quitar foto ${i + 1}">✕</button>
      </div>`).join('');
      $('.pe-photo-add', form).hidden = photos.length >= 6;
    };
    renderPhotos();
    $('#pe-photo-list', form).addEventListener('click', (e) => {
      const del = e.target.closest('[data-ph-del]');
      if (del) { photos.splice(Number(del.dataset.phDel), 1); renderPhotos(); return; }
      const first = e.target.closest('[data-ph-first]');
      if (first) { photos.unshift(photos.splice(Number(first.dataset.phFirst), 1)[0]); renderPhotos(); }
    });
    $('#pe-photos', form).addEventListener('change', async (e) => {
      const list = [...e.target.files].slice(0, Math.max(0, 6 - photos.length));
      for (const file of list) {
        try { photos.push({ data: await W.shrinkImage(file, 1400) }); } catch (_) { toast('No pudimos leer una de las fotos', 'err'); }
      }
      e.target.value = '';
      renderPhotos();
    });
    $('[data-pe-cancel]', form).addEventListener('click', () => onCancel && onCancel());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      W.hideAlert($('#pe-alert', form)); W.setFieldErrors(form, {});
      const m = ($('[name="pe-mode"]:checked', form) || {}).value || '';
      const days = {};
      for (const [k] of DAYS) {
        days[k] = [0, 1].map((i) => [$(`#pe-h-${k}-${i}-a`, form).value, $(`#pe-h-${k}-${i}-b`, form).value]).filter(([a, b]) => a && b);
      }
      const body = {
        name: $('#pe-name', form).value.trim(), section: sectionSel.value, category: catSel.value,
        localities: $$('[data-pe-loc].is-active', form).map((b) => b.dataset.peLoc),
        address: $('#pe-address', form).value.trim(), homeService: $('#pe-home', form).checked,
        description: desc.value.trim(), whatsapp: $('#pe-wa', form).value.trim(), phone: $('#pe-phone', form).value.trim(),
        instagram: $('#pe-ig', form).value.trim(), website: $('#pe-web', form).value.trim(),
        hours: m === 'horario' ? { mode: 'horario', days } : m ? { mode: m } : null,
        photos: photos.filter((x) => x.data).map((x) => x.data),
        keepPhotos: photos.filter((x) => x.url).map((x) => x.url),
      };
      if (mode === 'admin') body.consent = $('#pe-consent', form).checked;
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        const url = mode === 'admin' ? '/api/admin/places' : place ? `/api/my/places/${encodeURIComponent(place.id)}` : '/api/my/places';
        const r = await api(url, { method: place ? 'PUT' : 'POST', body });
        toast(r.message || 'Ficha guardada', 'ok');
        if (onSaved) onSaved(r);
      } catch (err) {
        W.showAlert($('#pe-alert', form), err.message, 'error');
        W.setFieldErrors(form, err.fields);
        const firstErr = $('.error-text:not([hidden])', form);
        if (firstErr) firstErr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        btn.disabled = false;
      }
    });
    $('#pe-name', form).focus({ preventScroll: true });
  }

  /* "Mis servicios" (persona) y "Guía" (panel de empresa) */
  async function initMyPlaces(root) {
    if (!root) return;
    let armed = '';
    async function list() {
      root.innerHTML = '<div class="skeleton" style="height:140px"></div>';
      let d;
      try { d = await api('/api/my/places'); } catch (err) { root.innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`; return; }
      const can = d.places.length < d.max;
      root.innerHTML = `<div class="my-places">
        <div class="my-places-head">
          <div><h2>Tus fichas en la Guía del Valle</h2><p class="sub">Oficio, servicio, salida o comida: que te encuentren y te escriban por WhatsApp. Gratis.</p></div>
          ${can ? '<button class="btn btn-primary" type="button" data-place-new>Sumar ficha</button>' : `<span class="soft-text">Tenés el máximo de ${d.max} fichas.</span>`}
        </div>
        ${d.places.length ? d.places.map((p) => `<article class="my-place card">
          <div class="my-place-media">${p.cover ? W.flyerFrame(p.coverThumb || p.cover, '', 'place-photo') : placeholder(p)}</div>
          <div class="my-place-body">
            <div class="my-place-top">${statusBadge(p.status)}${p.featured ? '<span class="badge badge-featured">Destacada</span>' : ''}</div>
            <h3>${esc(p.name)}</h3>
            <p class="soft-text">${esc(p.category)} · ${esc(p.localities.join(', '))}</p>
            ${p.status === 'rejected' && p.rejectReason ? `<p class="reject-note">${esc(p.rejectReason)}</p>` : ''}
            <p class="my-place-stats"><strong>Esta semana:</strong> ${p.stats.week.views} vistas · ${p.stats.week.contacts} contactos <span>·</span> <strong>Este mes:</strong> ${p.stats.month.views} vistas · ${p.stats.month.contacts} contactos</p>
            <div class="my-place-actions">
              <button class="btn btn-outline btn-sm" type="button" data-place-edit="${esc(p.id)}">${W.icon('edit', 15)} Editar</button>
              <a class="btn btn-ghost btn-sm" href="/guia/${esc(p.slug)}">${W.icon('eye', 15)} Ver</a>
              <button class="btn btn-ghost btn-sm btn-danger-text" type="button" data-place-del="${esc(p.id)}">${armed === p.id ? 'Tocá de nuevo para borrarla' : 'Borrar'}</button>
            </div>
          </div>
        </article>`).join('') : `<div class="empty my-places-empty">${sIcon('todo', 28)}<h3>Todavía no tenés fichas</h3><p>Si tenés un oficio (gasista, electricista, albañil…) o un comercio, sumalo: aparecés en la guía con tu WhatsApp, tu horario y tus fotos.</p></div>`}
      </div>`;
      root._places = d.places;
    }
    root.addEventListener('click', async (e) => {
      if (e.target.closest('[data-place-new]')) {
        placeEditor(root, { mode: 'owner', onSaved: () => list(), onCancel: () => list() });
        return;
      }
      const ed = e.target.closest('[data-place-edit]');
      if (ed) {
        const place = (root._places || []).find((x) => x.id === ed.dataset.placeEdit);
        placeEditor(root, { mode: 'owner', place, onSaved: () => list(), onCancel: () => list() });
        return;
      }
      const del = e.target.closest('[data-place-del]');
      if (del) {
        if (armed !== del.dataset.placeDel) { armed = del.dataset.placeDel; del.textContent = 'Tocá de nuevo para borrarla'; return; }
        try { await api(`/api/my/places/${encodeURIComponent(armed)}`, { method: 'DELETE' }); toast('Ficha borrada', 'ok'); } catch (err) { toast(err.message, 'err'); }
        armed = ''; list();
      }
    });
    await list();
  }

  /* Pestaña "Guía" del admin */
  async function initAdminPlaces(root) {
    if (!root) return;
    const FILTERS = [['', 'Todas'], ['pending', 'Pendientes'], ['recent', 'Cambios recientes'], ['approved', 'Publicadas'], ['unclaimed', 'Sin reclamar'], ['hidden', 'Ocultas'], ['rejected', 'Rechazadas']];
    let filter = '';
    let rejecting = '';
    let lastCreated = null;
    async function list() {
      root.innerHTML = `<div class="admin-places">
        <div class="admin-places-head">
          <div class="filter-chips">${FILTERS.map(([k, l]) => `<button type="button" class="filter-chip${filter === k ? ' is-active' : ''}" data-adm-filter="${k}">${l}</button>`).join('')}</div>
          <button class="btn btn-primary btn-sm" type="button" data-adm-new>${W.icon('plus', 15)} Cargar ficha</button>
        </div>
        ${lastCreated ? `<div class="alert alert-success adm-created"><strong>Ficha cargada:</strong> ${esc(lastCreated.place.name)}. Link para reclamarla o borrarla: <code>${esc(lastCreated.claimUrl || '')}</code> ${lastCreated.waUrl ? `<a class="btn btn-wa btn-sm" href="${esc(lastCreated.waUrl)}" target="_blank" rel="noopener">Avisarle por WhatsApp</a>` : ''}</div>` : ''}
        <div id="adm-list"><div class="skeleton" style="height:120px"></div></div>
      </div>`;
      let d;
      try { d = await api(`/api/admin/places?status=${filter}`); } catch (err) { $('#adm-list', root).innerHTML = `<p>${esc(err.message)}</p>`; return; }
      $('#adm-list', root).innerHTML = d.places.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ficha</th><th>Estado</th><th>Contactos (semana)</th><th></th></tr></thead><tbody>${d.places.map((p) => `<tr>
        <td><div class="cell-title"><a href="/guia/${esc(p.slug)}">${esc(p.name)}</a></div><div class="cell-sub">${esc(p.category)} · ${esc(p.localities.join(', '))} · ${p.owner ? `cargada por ${esc(p.owner.name)}${p.owner.email ? ` (${esc(p.owner.email)})` : ''}` : p.claimed ? 'con dueño' : 'sin reclamar'}${p.consentBy ? ` · autorizó: ${esc(p.consentBy)}` : ''}</div>${!p.claimed && p.claimUrl ? `<div class="cell-sub adm-claim"><code>${esc(p.claimUrl)}</code></div>` : ''}</td>
        <td>${statusBadge(p.status)}${p.featured ? ' <span class="badge badge-featured">Destacada</span>' : ''}</td>
        <td>${p.stats.week.views} vistas · ${p.stats.week.contacts} contactos</td>
        <td><div class="row-actions">
          ${p.status !== 'approved' ? `<button class="btn btn-primary btn-sm" data-adm-status="approved" data-id="${esc(p.id)}">Aprobar</button>` : ''}
          ${p.status !== 'rejected' ? (rejecting === p.id ? `<input class="input input-sm" id="adm-reason" placeholder="Motivo" maxlength="300"><button class="btn btn-outline btn-sm" data-adm-reject-ok="${esc(p.id)}">Enviar</button>` : `<button class="btn btn-outline btn-sm" data-adm-reject="${esc(p.id)}">Rechazar</button>`) : ''}
          ${p.status !== 'hidden' ? `<button class="btn btn-outline btn-sm" data-adm-status="hidden" data-id="${esc(p.id)}">Ocultar</button>` : ''}
          <select class="input input-sm" data-adm-feature="${esc(p.id)}" aria-label="Destacar"><option value="">${p.featured ? 'Destacada' : 'Destacar…'}</option><option value="7">7 días</option><option value="30">30 días</option><option value="0">Sin vencimiento</option>${p.featured ? '<option value="off">Quitar destacado</option>' : ''}</select>
          ${!p.claimed && p.waUrl ? `<a class="btn btn-wa btn-sm" href="${esc(p.waUrl)}" target="_blank" rel="noopener">Avisar</a>` : ''}
          ${!p.claimed && p.claimUrl ? `<button class="btn btn-ghost btn-sm" data-adm-copy="${esc(p.claimUrl)}">Copiar link</button>` : ''}
          <button class="btn btn-outline btn-sm" type="button" data-adm-place="${esc(p.slug)}">Gestionar</button>
          <button class="btn btn-danger btn-sm" data-adm-del="${esc(p.id)}">Borrar</button>
        </div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No hay fichas en esta lista.</p></div>';
    }
    const patch = async (id, body, msg) => {
      try { await api(`/api/admin/places/${encodeURIComponent(id)}`, { method: 'PATCH', body }); toast(msg, 'ok'); } catch (err) { toast(err.message, 'err'); }
      list();
    };
    root.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-adm-filter]');
      if (f) { filter = f.dataset.admFilter; lastCreated = null; list(); return; }
      if (e.target.closest('[data-adm-new]')) {
        placeEditor(root, { mode: 'admin', onCancel: () => list(), onSaved: (r) => { lastCreated = r; filter = 'unclaimed'; list(); } });
        return;
      }
      const st = e.target.closest('[data-adm-status]');
      if (st) { patch(st.dataset.id, { status: st.dataset.admStatus }, st.dataset.admStatus === 'approved' ? 'Ficha publicada' : 'Ficha oculta'); return; }
      const rj = e.target.closest('[data-adm-reject]');
      if (rj) { rejecting = rj.dataset.admReject; await list(); const i = $('#adm-reason', root); if (i) i.focus(); return; }
      const ro = e.target.closest('[data-adm-reject-ok]');
      if (ro) { const reason = ($('#adm-reason', root) || {}).value || ''; rejecting = ''; patch(ro.dataset.admRejectOk, { status: 'rejected', reason }, 'Ficha rechazada'); return; }
      const cp = e.target.closest('[data-adm-copy]');
      if (cp) { try { await navigator.clipboard.writeText(cp.dataset.admCopy); toast('Link copiado', 'ok'); } catch (_) { toast('No se pudo copiar', 'err'); } return; }
      const dl = e.target.closest('[data-adm-del]');
      if (dl) {
        if (dl.dataset.armed !== '1') { dl.dataset.armed = '1'; dl.textContent = '¿Seguro? Tocá de nuevo'; return; }
        try { await api(`/api/admin/places/${encodeURIComponent(dl.dataset.admDel)}`, { method: 'DELETE' }); toast('Ficha borrada', 'ok'); } catch (err) { toast(err.message, 'err'); }
        list();
      }
    });
    root.addEventListener('change', (e) => {
      const fs = e.target.closest('[data-adm-feature]');
      if (!fs || !fs.value) return;
      const v = fs.value;
      patch(fs.dataset.admFeature, { featuredDays: v === 'off' ? null : Number(v) }, v === 'off' ? 'Sin destacar' : 'Ficha destacada');
    });
    /* cambios hechos desde la hoja "Gestionar" */
    document.addEventListener('wk-admin-changed', () => { if (root.isConnected) list(); });
    await list();
  }

  window.WKGuia = { initGuia, initPlace, initClaimPlace, initHomeBand, placeCard, openLabel, sIcon, placeholder, statusBadge, placeEditor, initMyPlaces, initAdminPlaces, DAYS, LOCALITIES };
}());
