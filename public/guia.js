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
        ${p.cover ? W.flyerFrame(p.cover, '', 'place-photo') : placeholder(p)}
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
    const tel = (p.phone || p.whatsapp || '').replace(/[^\d+]/g, '');
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
    const unclaimed = !p.claimed ? `<div class="ficha-claim">${W.icon('sparkles', 17)}<p>Ficha armada por WorkUco con datos públicos. <strong>¿Es tuya?</strong> Reclamala o pedí que la borremos${meta.contactWaUrl ? `: <a class="link-inline" href="${esc(meta.contactWaUrl)}" target="_blank" rel="noopener">escribinos por WhatsApp</a>` : ' escribiéndonos a hola@workuco.com.ar'}.${isAdmin && p.claimUrl ? ` <br><span class="soft-text">Link de reclamo (sólo admin): ${esc(p.claimUrl)}</span>` : ''}</p></div>` : '';
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

  window.WKGuia = { initGuia, initPlace, initClaimPlace, initHomeBand, placeCard, openLabel, sIcon, placeholder, DAYS, LOCALITIES };
}());
