/* WorkUco — herramientas del admin en las páginas públicas.
   Sólo se carga cuando la sesión es de admin (ver app.js). Agrega un botón "Gestionar" a cada oferta
   (portada, Buscar, Changas, Wik Works, página del aviso) y a cada ficha de la Guía, que abre una
   hoja con la información y las acciones: destacar, ocultar, volver a publicar y eliminar con motivo. */
(function () {
  'use strict';
  const W = window.WK;
  if (!W || !W.state.user || W.state.user.role !== 'admin') return;
  const { $, api, esc, toast, icon } = W;
  const FEATURE_DAYS = [7, 15, 30];
  const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const css = document.createElement('style');
  css.textContent = `
  .adm-gear { position: absolute; z-index: 6; top: 10px; right: 10px; display: inline-flex; align-items: center; gap: 6px;
    min-height: 32px; padding: 0 12px; border-radius: 999px; border: 0; cursor: pointer;
    background: var(--malbec); color: #fff; font: 700 12.5px/1 var(--font-display); letter-spacing: .01em;
    box-shadow: 0 6px 16px -6px rgba(0,0,0,.45); }
  .adm-gear:hover, .adm-gear:focus-visible { background: var(--malbec-2); outline: 2px solid var(--lime); outline-offset: 2px; }
  .adm-host { position: relative; }
  .fslide .adm-gear { top: auto; bottom: 150px; right: 14px; }
  .adm-pagebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    margin: 0 0 16px; padding: 12px 16px; border-radius: 14px; background: var(--malbec); color: #fff; }
  .adm-pagebar strong { font-family: var(--font-display); }
  .adm-pagebar .adm-gear { position: static; background: var(--lime); color: var(--night); }
  .adm-sheet .adm-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 14px 0; }
  .adm-sheet .adm-kv div { background: var(--surface-2); border-radius: 12px; padding: 10px 12px; }
  .adm-sheet .adm-kv b { display: block; font: 800 20px/1.1 var(--font-display); color: var(--ink); }
  .adm-sheet .adm-kv span { font-size: 12.5px; color: var(--muted); }
  .adm-sheet .adm-who { font-size: 14px; line-height: 1.5; padding: 10px 12px; border: 1px solid var(--line, #e2dccb); border-radius: 12px; }
  .adm-sheet .adm-who a { color: inherit; text-decoration: underline; }
  .adm-sheet h3 { font: 800 13px/1 var(--font-display); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 18px 0 8px; }
  .adm-sheet .adm-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .adm-sheet .adm-warn { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #fff4d6; color: #6b4b00; font-size: 13.5px; }
  .adm-sheet .adm-danger { margin-top: 18px; padding: 14px; border-radius: 14px; background: var(--red-soft, #fbe6e3); }
  .adm-sheet .adm-danger textarea { width: 100%; margin: 8px 0; min-height: 64px; }
  @media (max-width: 560px) { .adm-gear span { display: none; } .adm-gear { padding: 0 9px; } }`;
  document.head.appendChild(css);

  /* ---------- botón en cada tarjeta ---------- */
  const gear = (attrs, label = 'Gestionar') => `<span role="button" tabindex="0" class="adm-gear" ${attrs} title="Gestionar (admin)">${icon('settings', 14)}<span>${label}</span></span>`;
  const jobIdOf = (el) => {
    if (el.dataset.job) return el.dataset.job;
    const a = el.matches('a') ? el : el.querySelector('a[href^="/oferta/"]');
    const m = a && a.getAttribute('href').match(/^\/oferta\/([a-z0-9]+)/);
    return m ? m[1] : '';
  };
  function decorate() {
    document.querySelectorAll('a.job-card, a.gig-card, .job-row, article.fslide[data-job]').forEach((el) => {
      if (el.dataset.admDone) return;
      const id = jobIdOf(el);
      if (!id) return;
      el.dataset.admDone = '1';
      el.classList.add('adm-host');
      el.insertAdjacentHTML('beforeend', gear(`data-adm-job="${esc(id)}"`));
    });
    document.querySelectorAll('article.place-card').forEach((el) => {
      if (el.dataset.admDone) return;
      const a = el.querySelector('a[href^="/guia/"]');
      const m = a && a.getAttribute('href').match(/^\/guia\/([a-z0-9-]+)/);
      if (!m) return;
      el.dataset.admDone = '1';
      el.classList.add('adm-host');
      el.insertAdjacentHTML('beforeend', gear(`data-adm-place="${esc(m[1])}"`));
    });
    /* página de un aviso o de una ficha: barra arriba del contenido */
    const page = document.body.dataset.page;
    const main = document.querySelector('main');
    if (main && !main.dataset.admDone && (page === 'job' || page === 'place')) {
      const m = location.pathname.match(page === 'job' ? /^\/oferta\/([a-z0-9]+)/ : /^\/guia\/([a-z0-9-]+)/);
      if (m) {
        main.dataset.admDone = '1';
        const host = main.querySelector('.container') || main;
        host.insertAdjacentHTML('afterbegin', `<div class="adm-pagebar"><strong>Estás viendo esto como admin</strong>${gear(page === 'job' ? `data-adm-job="${esc(m[1])}"` : `data-adm-place="${esc(m[1])}"`, 'Gestionar e info')}</div>`);
      }
    }
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; decorate(); }, 60);
  }).observe(document.body, { childList: true, subtree: true });
  decorate();

  /* el botón vive dentro del enlace de la tarjeta: se corta la navegación */
  const open = (e) => {
    const g = e.target.closest('[data-adm-job], [data-adm-place]');
    if (!g) return false;
    e.preventDefault();
    e.stopPropagation();
    if (g.dataset.admJob) openJob(g.dataset.admJob, g);
    else openPlace(g.dataset.admPlace, g);
    return true;
  };
  document.addEventListener('click', open, true);
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.adm-gear')) open(e); }, true);

  /* ---------- hoja (modal) ---------- */
  let back = null; let lastFocus = null;
  function sheet(html) {
    close();
    lastFocus = document.activeElement;
    back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal adm-sheet" role="dialog" aria-modal="true" aria-labelledby="adm-title">${html}</div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-adm-close]')) close(); });
    const f = back.querySelector('[data-adm-close]');
    if (f) f.focus();
    return back.querySelector('.modal');
  }
  function close() {
    if (!back) return;
    back.remove(); back = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && back) close(); });
  const head = (title, sub) => `<div class="modal-head"><div><h2 id="adm-title">${esc(title)}</h2><p class="modal-sub">${sub}</p></div>
    <button class="modal-close" type="button" data-adm-close aria-label="Cerrar">${icon('x', 18)}</button></div>`;
  const loading = () => sheet(`${head('Cargando…', '')}<div class="skeleton" style="height:160px"></div>`);
  /* saca la tarjeta de la página cuando el aviso o la ficha ya no se muestran */
  function dropCard(origin) {
    const card = origin && origin.closest('a.job-card, a.gig-card, .job-row, article.fslide, article.place-card');
    if (card) card.remove();
  }
  const dangerBox = (what) => `<div class="adm-danger">
    <strong>Eliminar ${what}</strong>
    <p class="modal-sub">No se puede deshacer. Le avisamos al dueño con el motivo.</p>
    <textarea class="input" id="adm-del-reason" maxlength="300" placeholder="Motivo (lo va a leer el dueño). Ej.: contenido no permitido"></textarea>
    <button class="btn btn-danger btn-sm" type="button" data-adm-delete>${icon('trash', 15)} Eliminar ${what}</button>
  </div>`;
  function armDelete(box, run) {
    const b = box.querySelector('[data-adm-delete]');
    b.addEventListener('click', async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Seguro? Tocá de nuevo para eliminar'; return; }
      b.disabled = true;
      try { await run(($('#adm-del-reason', box) || {}).value || ''); } catch (err) { toast(err.message, 'err'); b.disabled = false; }
    });
  }

  /* ---------- avisos ---------- */
  async function openJob(id, origin) {
    loading();
    let d;
    try { d = await api(`/api/admin/jobs/${encodeURIComponent(id)}/info`); } catch (err) { close(); toast(err.message, 'err'); return; }
    const j = d.job; const c = d.company; const s = d.stats;
    const statusTxt = { approved: 'Publicada', pending: 'Pendiente', rejected: 'Oculta / rechazada', closed: 'Cerrada' }[j.status] || j.status;
    const box = sheet(`${head(j.title, `${esc(statusTxt)} · ${esc(j.locality)} · publicada ${esc(fmt(j.publishedAt || j.createdAt))}`)}
      <div class="adm-kv">
        <div><b>${s.views}</b><span>vistas en total</span></div>
        <div><b>${s.viewsWeek}</b><span>vistas esta semana</span></div>
        <div><b>${s.applications}</b><span>postulaciones${s.newApplications ? ` (${s.newApplications} nuevas)` : ''}</span></div>
        <div><b>${j.featured ? 'Sí' : 'No'}</b><span>${j.featured ? (j.featuredUntil ? `destacada hasta ${esc(fmt(j.featuredUntil))}` : 'destacada, sin vencimiento') : j.featureRequested ? 'pidió destacar' : 'destacada'}</span></div>
      </div>
      <div class="adm-who"><strong>${esc(c.name || '')}</strong>${c.verified ? ' · verificada' : ''}${c.claimed ? '' : ' · <em>tomado de un canal, sin dueño</em>'}<br>
        ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.email && c.phone ? ' · ' : ''}${esc(c.phone || '')}
        ${j.sourceName ? `<br>Fuente: ${esc(j.sourceName)}` : ''}
        ${j.rejectReason ? `<br>Motivo guardado: ${esc(j.rejectReason)}` : ''}</div>
      ${d.warnings && d.warnings.length ? `<div class="adm-warn"><strong>Revisar:</strong> ${d.warnings.map(esc).join(' · ')}</div>` : ''}
      <h3>Publicación</h3>
      <div class="adm-row">
        ${j.status !== 'approved' ? `<button class="btn btn-primary btn-sm" type="button" data-adm-set="approved">${j.status === 'pending' ? 'Aprobar' : 'Volver a publicar'}</button>` : ''}
        ${j.status === 'approved' || j.status === 'pending' ? '<button class="btn btn-outline btn-sm" type="button" data-adm-hide>Ocultar</button>' : ''}
        <a class="btn btn-ghost btn-sm" href="/oferta/${esc(j.id)}">Ver el aviso</a>
        <a class="btn btn-ghost btn-sm" href="/admin?q=${encodeURIComponent(j.title)}">Abrir en el panel</a>
      </div>
      <div class="adm-row" data-adm-hide-box hidden style="margin-top:8px">
        <input class="input input-sm" id="adm-hide-reason" maxlength="300" placeholder="Motivo (le llega a la empresa)" style="flex:1;min-width:200px">
        <button class="btn btn-outline btn-sm" type="button" data-adm-hide-ok>Ocultar aviso</button>
      </div>
      ${j.status === 'approved' ? `<h3>Destacar</h3><div class="adm-row">
        ${FEATURE_DAYS.map((n) => `<button class="btn btn-outline btn-sm" type="button" data-adm-feat="${n}">${n} días</button>`).join('')}
        ${j.featured ? '<button class="btn btn-ghost btn-sm" type="button" data-adm-feat="off">Quitar destacado</button>' : ''}
      </div>` : ''}
      ${dangerBox('aviso')}`);
    const patch = async (body, msg) => {
      try { await api(`/api/admin/jobs/${encodeURIComponent(j.id)}`, { method: 'PATCH', body }); toast(msg, 'ok'); document.dispatchEvent(new CustomEvent('wk-admin-changed')); return true; } catch (err) { toast(err.message, 'err'); return false; }
    };
    box.addEventListener('click', async (e) => {
      const st = e.target.closest('[data-adm-set]');
      if (st && await patch({ status: 'approved' }, 'Aviso publicado')) openJob(j.id, origin);
      if (e.target.closest('[data-adm-hide]')) { box.querySelector('[data-adm-hide-box]').hidden = false; $('#adm-hide-reason', box).focus(); }
      if (e.target.closest('[data-adm-hide-ok]')) {
        const reason = $('#adm-hide-reason', box).value.trim() || 'Oculto por la administración';
        if (await patch({ status: 'rejected', rejectReason: reason }, 'Aviso oculto')) { dropCard(origin); close(); }
      }
      const ft = e.target.closest('[data-adm-feat]');
      if (ft) {
        const off = ft.dataset.admFeat === 'off';
        if (await patch({ featuredDays: off ? null : Number(ft.dataset.admFeat) }, off ? 'Sin destacar' : `Destacada por ${ft.dataset.admFeat} días`)) openJob(j.id, origin);
      }
    });
    armDelete(box, async (reason) => {
      await api(`/api/admin/jobs/${encodeURIComponent(j.id)}`, { method: 'DELETE', body: { reason } });
      toast('Aviso eliminado', 'ok'); document.dispatchEvent(new CustomEvent('wk-admin-changed'));
      close();
      if (document.body.dataset.page === 'job') location.href = '/buscar'; else dropCard(origin);
    });
  }

  /* ---------- fichas de la Guía ---------- */
  async function openPlace(slug, origin) {
    loading();
    let p;
    try { p = (await api(`/api/places/${encodeURIComponent(slug)}`)).place; } catch (err) { close(); toast(err.message, 'err'); return; }
    const statusTxt = { approved: 'Publicada', pending: 'Pendiente', rejected: 'Rechazada', hidden: 'Oculta' }[p.status] || p.status;
    const o = p.owner;
    const wk = (p.stats && p.stats.week) || { views: 0, contacts: 0 };
    const mo = (p.stats && p.stats.month) || { views: 0, contacts: 0 };
    const box = sheet(`${head(p.name, `${esc(statusTxt)} · ${esc(p.category)} · ${esc((p.localities || []).join(', '))}`)}
      <div class="adm-kv">
        <div><b>${wk.views}</b><span>vistas esta semana</span></div>
        <div><b>${wk.contacts}</b><span>contactos esta semana</span></div>
        <div><b>${mo.views}</b><span>vistas del mes</span></div>
        <div><b>${p.featured ? 'Sí' : 'No'}</b><span>destacada</span></div>
      </div>
      <div class="adm-who">${o ? `Cargada por <strong>${esc(o.name)}</strong> (${o.type === 'company' ? 'empresa' : 'persona'})<br>
        ${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}${o.email && o.phone ? ' · ' : ''}${esc(o.phone || '')}`
        : 'Cargada por la administración, todavía sin dueño'}
        ${p.whatsapp || p.phone ? `<br>Contacto de la ficha: ${esc(p.whatsapp || p.phone)}` : ''}
        ${p.updatedAt ? `<br>Última modificación: ${esc(fmt(p.updatedAt))}` : ''}</div>
      <h3>Publicación</h3>
      <div class="adm-row">
        ${p.status !== 'approved' ? `<button class="btn btn-primary btn-sm" type="button" data-adm-pset="approved">${p.status === 'pending' ? 'Aprobar' : 'Volver a publicar'}</button>` : ''}
        ${p.status !== 'hidden' ? '<button class="btn btn-outline btn-sm" type="button" data-adm-pset="hidden">Ocultar</button>' : ''}
        <a class="btn btn-ghost btn-sm" href="/guia/${esc(p.slug)}">Ver la ficha</a>
        <a class="btn btn-ghost btn-sm" href="/admin?q=${encodeURIComponent(p.name)}">Abrir en el panel</a>
      </div>
      ${p.status === 'approved' ? `<h3>Destacar</h3><div class="adm-row">
        <button class="btn btn-outline btn-sm" type="button" data-adm-pfeat="7">7 días</button>
        <button class="btn btn-outline btn-sm" type="button" data-adm-pfeat="30">30 días</button>
        <button class="btn btn-outline btn-sm" type="button" data-adm-pfeat="0">Sin vencimiento</button>
        ${p.featured ? '<button class="btn btn-ghost btn-sm" type="button" data-adm-pfeat="off">Quitar destacado</button>' : ''}
      </div>` : ''}
      ${dangerBox('ficha')}`);
    const patch = async (body, msg) => {
      try { await api(`/api/admin/places/${encodeURIComponent(p.id)}`, { method: 'PATCH', body }); toast(msg, 'ok'); document.dispatchEvent(new CustomEvent('wk-admin-changed')); return true; } catch (err) { toast(err.message, 'err'); return false; }
    };
    box.addEventListener('click', async (e) => {
      const st = e.target.closest('[data-adm-pset]');
      if (st) {
        const v = st.dataset.admPset;
        if (await patch({ status: v }, v === 'approved' ? 'Ficha publicada' : 'Ficha oculta')) {
          if (v === 'hidden') { dropCard(origin); close(); } else openPlace(p.slug, origin);
        }
      }
      const ft = e.target.closest('[data-adm-pfeat]');
      if (ft) {
        const v = ft.dataset.admPfeat;
        if (await patch({ featuredDays: v === 'off' ? null : Number(v) }, v === 'off' ? 'Sin destacar' : 'Ficha destacada')) openPlace(p.slug, origin);
      }
    });
    armDelete(box, async (reason) => {
      await api(`/api/admin/places/${encodeURIComponent(p.id)}`, { method: 'DELETE', body: { reason } });
      toast('Ficha eliminada', 'ok'); document.dispatchEvent(new CustomEvent('wk-admin-changed'));
      close();
      if (document.body.dataset.page === 'place') location.href = '/guia'; else dropCard(origin);
    });
  }
}());
