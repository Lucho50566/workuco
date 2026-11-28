/* WorkUco — paneles de empresa, persona y administración */
'use strict';

(function () {
  const W = window.WK;
  const { $, $$, api, esc, toast, showAlert, hideAlert, setFieldErrors, icon, logoHtml, avatarHtml, fmtDate, timeAgo, STAGE_LABEL } = W;

  const STAGE_ORDER = ['nuevo', 'revisado', 'entrevista', 'ofrecido', 'contratado', 'descartado'];
  const STAGE_COLOR = {
    nuevo: 'blue', revisado: 'violet', entrevista: 'amber', ofrecido: 'teal', contratado: 'green', descartado: 'gray',
  };

  const stagePill = (s) => `<span class="stage-pill stage-${esc(s)}"><i></i>${esc(STAGE_LABEL[s] || s)}</span>`;

  async function shrinkImage(file, max = 1400, quality = 0.82) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      src = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        /* foto que el navegador no sabe leer (típico: HEIC del iPhone abierta en una compu): mensaje claro */
        img.onerror = () => reject(new Error('No pudimos leer esa foto. Si es del iPhone (HEIC), subila desde el celular o sacale una captura y subí la captura. Sirven JPG, PNG o WebP.'));
        img.src = URL.createObjectURL(file);
      });
    }
    const w = src.width || src.naturalWidth;
    const h = src.height || src.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    /* WebP (~30 % más liviano, misma calidad); si el navegador no sabe generarlo, JPG */
    const webp = canvas.toDataURL('image/webp', quality);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
  }

  const starRow = (n, interactive = false) => [1, 2, 3, 4, 5].map((i) =>
    `<button class="star${i <= n ? ' is-on' : ''}" type="button" ${interactive ? `data-rate="${i}"` : 'disabled'} aria-label="${i} estrellas">${icon('star', 16)}</button>`).join('');

  const scoreRing = (score) => {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const color = s >= 75 ? '#0a8263' : s >= 50 ? '#c98a12' : '#b3261e';
    return `<div class="score-ring" style="background:conic-gradient(${color} ${s * 3.6}deg, #edf1ee 0)"><span>${s}</span><small>IA</small></div>`;
  };

  const waLink = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  /* ================================================================== */
  /* PANEL DE EMPRESA                                                   */
  /* ================================================================== */
  async function initPanel() {
    const user = W.state.user;
    $('#panel-loading').hidden = true;
    if (!user || user.role !== 'company') {
      $('#panel-gate').hidden = false;
      $('#panel-gate').innerHTML = `<div class="card gate-card">
        <h1>${user && user.role === 'candidate' ? 'Estás con tu cuenta de persona' : 'Panel de empresa'}</h1>
        <p>${user && user.role === 'candidate'
          ? 'Para gestionar búsquedas necesitás una cuenta de empresa. Podés volver a tu perfil o crear otra cuenta.'
          : 'Ingresá con tu cuenta para administrar tus ofertas, ver postulantes y usar la IA.'}</p>
        <div class="gate-actions">${user && user.role === 'candidate'
          ? `<a class="btn btn-primary" href="/mi-perfil">Ir a mi perfil</a><a class="btn btn-outline" href="/acceder?rol=empresa">Crear cuenta de empresa</a>`
          : `<a class="btn btn-primary" href="/acceder?rol=empresa&next=/panel">Ingresar</a><a class="btn btn-outline" href="/acceder?rol=empresa&modo=registro&next=/panel">Crear cuenta</a>`}</div>
      </div>`;
      return;
    }
    $('#panel-app').hidden = false;

    const meta = await W.loadMeta();
    let data = null;
    let jobFilter = '';
    let appSearch = '';
    let currentApp = null;
    let autoTimer = null;

    async function load() {
      try {
        data = await api('/api/company/dashboard');
        renderAll();
        if (hashTab() && !load.done) { load.done = true; showTab(hashTab()); }
      } catch (err) {
        toast(err.message, 'err');
        if (err.status === 401) location.href = '/acceder?rol=empresa&next=/panel';
      }
    }

    function renderAll() {
      paintSidebar();
      renderOverview();
      renderJobs();
      renderKanban();
      renderCompanyTab();
      renderAiTab();
      if (window.WKCert) window.WKCert.companyList($('#cert-issued'));
    }

    function paintSidebar() {
      $('#panel-company').textContent = data.company.name;
      $('#panel-logo').innerHTML = logoHtml(data.company.name, data.company.logo, 'logo-md');
      $('#panel-public-link').href = `/empresa/${data.company.id}`;
      const pub2 = $('#panel-public-link-2');
      if (pub2) pub2.href = `/empresa/${data.company.id}`;
    }

    /* ---------- tabs ---------- */
    const showTab = (name) => {
      $$('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (name === 'ai') renderAiTab();
      if (name === 'talent') loadTalent();
      if (name === 'guide' && !showTab.places && window.WKGuia) { showTab.places = true; window.WKGuia.initMyPlaces($('#company-places')); }
      if (name === 'solutions') renderSolutions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    /* links directos: /panel#talento, #postulantes, #ofertas */
    const HASH_TAB = { talento: 'talent', postulantes: 'applicants', ofertas: 'jobs', empresa: 'company', ia: 'ai', guia: 'guide', soluciones: 'solutions' };
    const hashTab = () => HASH_TAB[location.hash.replace('#', '')];
    window.addEventListener('hashchange', () => { if (hashTab()) showTab(hashTab()); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b && b.closest('#panel-app')) showTab(b.dataset.goto);
    });

    /* ---------- Pack Cosecha (tarjeta del resumen) ---------- */
    async function renderCosecha() {
      const box = $('#pack-cosecha');
      if (!box) return;
      let s;
      try { s = await api('/api/company/cosecha'); } catch (_) { box.hidden = true; return; }
      const money = (n) => `$ ${Number(n).toLocaleString('es-AR')}`;
      const action = s.active
        ? `<p class="pack-state is-on">${icon('check', 16)} Activo hasta el <strong>${fmtDate(s.until)}</strong> · ${s.featured} de ${s.maxJobs} avisos de cosecha destacados</p>${s.payEnabled ? `<button class="btn btn-outline" type="button" data-cosecha-pay>Sumar ${s.days} días · ${money(s.price)}</button>` : ''}`
        : s.payEnabled ? `<button class="btn btn-primary" type="button" data-cosecha-pay>Activar con Mercado Pago · ${money(s.price)}</button>`
          : s.requested ? `<p class="pack-state">${icon('clock', 16)} Lo pediste: te avisamos cuando esté activo.</p><button class="link-btn" type="button" data-cosecha-cancel>Cancelar pedido</button>`
            : `<button class="btn btn-primary" type="button" data-cosecha-req>Pedir Pack Cosecha</button>${s.launchFree ? ' <span class="pack-free">Gratis durante el lanzamiento</span>' : ''}`;
      box.innerHTML = `<div class="pack-head"><span class="pack-tag">Temporada</span><h2 id="pack-cosecha-title">Pack Cosecha</h2>
          <p class="sub">Para bodegas y fincas que necesitan mucha gente rápido.</p></div>
        <ul class="pack-list">
          <li>${icon('star', 16)} <span>Hasta ${s.maxJobs} avisos de Agricultura o changas <strong>destacados ${s.days} días</strong>${s.eligible ? '' : ' (publicá uno para empezar)'}</span></li>
          <li>${icon('users', 16)} <span>Hasta <strong>100 invitaciones por día</strong> a gente disponible (sin pack: 20)</span></li>
          <li>${icon('check', 16)} <span>Sello <strong>"Cosecha"</strong> en tus avisos</span></li>
          <li>${icon('external', 16)} <span>Arriba en <a href="/cosecha" target="_blank" rel="noopener">workuco.com.ar/cosecha</a></span></li>
        </ul>
        <div class="pack-action">${action}</div>`;
      box.hidden = false;
      const on = (sel, fn) => { const b = $(sel, box); if (b) b.addEventListener('click', fn); };
      on('[data-cosecha-req]', async () => { try { await api('/api/company/cosecha/request', { method: 'POST' }); toast('Listo: te avisamos cuando el pack esté activo', 'ok'); renderCosecha(); } catch (err) { toast(err.message, 'err'); } });
      on('[data-cosecha-cancel]', async () => { try { await api('/api/company/cosecha/request', { method: 'DELETE' }); renderCosecha(); } catch (err) { toast(err.message, 'err'); } });
      on('[data-cosecha-pay]', async (e) => {
        const btn = e.currentTarget; /* después del await, e.currentTarget ya es null */
        btn.disabled = true;
        try { const r = await api('/api/company/cosecha/checkout', { method: 'POST' }); location.href = r.url; }
        catch (err) { toast(err.message, 'err'); btn.disabled = false; }
      });
    }

    /* ---------- resumen ---------- */
    function renderOverview() {
      renderCosecha();
      const k = data.kpis;
      $('#kpi-published').textContent = k.published;
      $('#kpi-pending').textContent = k.pending;
      $('#kpi-apps').textContent = k.applications;
      $('#kpi-new').textContent = k.newApplications;
      $('#kpi-views').textContent = k.views;
      $('#kpi-hired').textContent = k.hired;

      const counts = data.stageCounts || {};
      const max = Math.max(1, ...STAGE_ORDER.map((s) => counts[s] || 0));
      $('#funnel').innerHTML = STAGE_ORDER.map((s) => `<div class="funnel-row">
        <span class="funnel-label">${esc(STAGE_LABEL[s])}</span>
        <div class="funnel-bar"><span class="funnel-fill stage-${s}" style="width:${((counts[s] || 0) / max) * 100}%"></span></div>
        <span class="funnel-n">${counts[s] || 0}</span>
      </div>`).join('');

      const tasks = [];
      if (k.newApplications) tasks.push({ icon: 'users', text: `Tenés ${k.newApplications} postulante${k.newApplications === 1 ? '' : 's'} nuevo${k.newApplications === 1 ? '' : 's'} sin revisar`, action: 'applicants', cta: 'Revisar' });
      const r = data.response;
      if (r && (r.rate < 80 || r.days > 3)) tasks.push({ icon: 'clock', text: r.rate ? `Respondés el ${r.rate}% de las postulaciones, en ${r.days} día${r.days === 1 ? '' : 's'}. Esa insignia la ve quien se postula: moverlas de etapa la mejora.` : 'Todavía no respondiste postulaciones y quien se postula lo ve en tu insignia. Mové a tus postulantes de etapa.', action: 'applicants', cta: 'Responder' });
      if (k.published) tasks.push({ icon: 'users', text: 'Mirá quién está disponible en el Valle e invitalo a tu búsqueda', action: 'talent', cta: 'Ver talento' });
      if (k.pending) tasks.push({ icon: 'clock', text: `${k.pending} publicación${k.pending === 1 ? '' : 'es'} esperando aprobación`, action: 'jobs', cta: 'Ver estado' });
      if (!(data.company.gallery || []).length) tasks.push({ icon: 'image', text: 'Sumá fotos de tu empresa: los avisos con imágenes reciben más postulaciones', action: 'company', cta: 'Subir fotos' });
      if (!data.company.logo) tasks.push({ icon: 'building', text: 'Cargá el logo de tu empresa para que te reconozcan', action: 'company', cta: 'Cargar logo' });
      if (!data.company.description) tasks.push({ icon: 'edit', text: 'Completá la descripción de tu empresa', action: 'company', cta: 'Completar' });
      if (!data.company.ai || !data.company.ai.hasKey) tasks.push({ icon: 'sparkles', text: 'Conectá una IA para resumir y ordenar los CV automáticamente', action: 'ai', cta: 'Configurar' });
      $('#todo-list').innerHTML = tasks.length ? tasks.map((t, i) => `<button type="button" class="todo-row" data-goto="${t.action}">
        <span class="todo-icon">${icon(t.icon, 18)}</span><span>${esc(t.text)}</span><strong>${esc(t.cta)} →</strong>
      </button>`).join('') : `<div class="todo-done">${icon('check', 18)} Todo al día. Buen trabajo.</div>`;

      const recent = data.applications.slice(0, 5);
      $('#recent-apps').innerHTML = recent.length ? recent.map((a) => `<button type="button" class="recent-row" data-open-app="${a.id}">
        ${avatarHtml(a.name, a.candidate && a.candidate.photo, 'avatar-sm')}
        <span class="recent-main"><strong>${esc(a.name)}</strong><small>${esc(a.jobTitle)} · ${timeAgo(a.createdAt)}</small></span>
        ${a.aiScore != null ? `<span class="score-mini" title="Puntaje que le puso la IA (0 a 100)">IA ${a.aiScore}</span>` : ''}
        ${stagePill(a.stage)}
      </button>`).join('') : '<p class="muted">Todavía no recibiste postulaciones.</p>';
      $$('[data-open-app]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.openApp)));
    }

    /* ---------- rendimiento de un aviso ---------- */
    const fmtN = (n) => Number(n).toLocaleString('es-AR');
    const fmtD = (n) => String(n).replace('.', ',');
    const dayLabel = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}/${Number(m)}`; };
    function perfHtml(p, job) {
      const max = Math.max(1, ...p.series.map((s) => s.views));
      const anyFeat = p.series.some((s) => s.featuredViews > 0);
      const bars = p.series.map((s) => {
        const h = s.views ? Math.max(4, Math.round((s.views / max) * 100)) : 0;
        const fPct = s.views ? Math.round((s.featuredViews / s.views) * 100) : 0;
        const tip = `${dayLabel(s.day)}: ${fmtN(s.views)} vista${s.views === 1 ? '' : 's'}${s.featuredViews ? ' (destacado)' : ''} · ${s.applications} postulante${s.applications === 1 ? '' : 's'}`;
        return `<div class="perf-col" title="${esc(tip)}"><div class="perf-bar" style="height:${Math.round(h * 0.86)}px">${fPct ? `<span class="perf-feat" style="height:${fPct}%"></span>` : ''}</div><span class="perf-app">${s.applications || ''}</span></div>`;
      }).join('');
      let insight = '';
      if (p.compare && p.compare.ratio && p.compare.ratio > 1) {
        insight = `${icon('star', 15)} <span>Destacado tuvo <strong>${fmtD(p.compare.featuredPerDay)} vistas por día</strong> contra ${fmtD(p.compare.normalPerDay)} sin destacar: <strong>${fmtD(p.compare.ratio)} veces más</strong>.</span>`;
      } else if (p.compare) {
        insight = `${icon('star', 15)} <span>Destacado: ${fmtD(p.compare.featuredPerDay)} vistas por día · sin destacar: ${fmtD(p.compare.normalPerDay)}.</span>`;
      } else if (!(job && job.featured) && p.siteRatio) {
        insight = `${icon('star', 15)} <span>En WorkUco, los avisos destacados reciben en promedio <strong>${fmtD(p.siteRatio)} veces más vistas por día</strong>.</span>`;
      }
      const conv = p.conversion == null ? '—' : `${fmtD(p.conversion)}%`;
      const summary = `Últimos ${p.days} días: ${p.views} vistas y ${p.applications} postulantes`;
      return `<div class="perf-kpis">
          <div><strong>${fmtN(p.views)}</strong><span>vistas en ${p.days} días</span></div>
          <div><strong>${fmtN(p.applications)}</strong><span>postulantes en ${p.days} días</span></div>
          <div><strong>${conv}</strong><span>${p.conversion == null ? 'se postula (se calcula desde 20 vistas)' : 'de los que lo ven se postula'}</span></div>
        </div>
        ${p.views ? `<div class="perf-chart" role="img" aria-label="${esc(summary)}">${bars}</div>
        <div class="perf-axis"><span>${dayLabel(p.series[0].day)}</span><span>Hoy</span></div>
        <div class="perf-legend"><span><i class="lg-views"></i>Vistas</span>${anyFeat ? '<span><i class="lg-feat"></i>Vistas destacado</span>' : ''}<span><b>Nº</b> postulantes del día</span></div>`
          : '<p class="muted">Todavía no tuvo vistas en estos días. Compartí el link del aviso en tus grupos y redes para que llegue a más gente.</p>'}
        ${insight ? `<p class="perf-insight">${insight}</p>` : ''}`;
    }

    /* ---------- ofertas ---------- */
    let jobStatus = '';
    function renderJobs() {
      /* pago en línea de destacados (si el admin lo activó): un botón por opción, con su precio */
      const payOn = !!(meta.payments && meta.payments.enabled && meta.payments.options.length);
      const buyHtml = (j, label) => `<div class="feat-buy"><span>${icon('star', 14)} ${label}</span>
        <div class="feat-opts">${meta.payments.options.map((o) => `<button class="btn btn-outline btn-sm" type="button" data-feat-buy="${j.id}" data-days="${o.days}">${o.days} días · $ ${Number(o.price).toLocaleString('es-AR')}</button>`).join('')}</div>
        <small>Pagás con Mercado Pago y se activa solo.</small></div>`;
      const list = data.jobs.filter((j) => !jobStatus || j.status === jobStatus);
      $('#jobs-count').textContent = `${data.jobs.length} publicaci${data.jobs.length === 1 ? 'ón' : 'ones'}`;
      $('#jobs-cards').innerHTML = list.length ? list.map((j) => {
        const cover = (j.companyGallery || [])[0];
        return `<article class="offer-card">
          <div class="offer-cover${cover ? ' has-img' : ''}"${cover ? ` style="background-image:url('${esc(cover)}')"` : ''}>
            ${W.statusBadge(j.status)}
          </div>
          <div class="offer-body">
            <h3>${esc(j.title)}</h3>
            <div class="offer-meta">${esc(j.locality)} · ${esc(j.modality)} · ${esc(j.category)}</div>
            <div class="offer-stats">
              <span>${icon('users', 15)} <strong>${j.applications}</strong> postulantes</span>
              <span>${icon('eye', 15)} <strong>${j.views || 0}</strong> vistas</span>
              <span title="Vistas de los últimos 7 días"><strong>${j.viewsWeek || 0}</strong> esta semana</span>
              ${j.newApplications ? `<span class="new-dot">${j.newApplications} nuevo${j.newApplications === 1 ? '' : 's'}</span>` : ''}
            </div>
            ${j.featured ? `<p class="feat-note is-on">${icon('star', 14)} Destacado${j.featuredUntil ? ` hasta el ${fmtDate(j.featuredUntil)}` : ''}: sale primero en Buscar y en Wik Works.</p>${j.featuredUntil && payOn ? buyHtml(j, 'Sumar días') : ''}`
              : j.status === 'approved' && payOn ? buyHtml(j, 'Destacalo: sale primero en Buscar y en Wik Works')
              : j.status === 'approved' ? (j.featureRequested
                ? `<p class="feat-note">${icon('clock', 14)} Pediste destacarlo: te avisamos cuando esté. <button class="link-btn" type="button" data-feat-cancel="${j.id}">Cancelar pedido</button></p>`
                : `<p class="feat-note"><button class="btn btn-outline btn-sm" type="button" data-feat-req="${j.id}">${icon('star', 14)} Pedir destacado</button> <span>Sale primero en Buscar y en Wik Works${meta.launchFree ? '. <strong>Gratis durante el lanzamiento.</strong>' : '.'}</span></p>`) : ''}
            ${j.status === 'rejected' && j.rejectReason ? `<p class="reject-note">${esc(j.rejectReason)}</p>` : ''}
            ${j.status === 'approved' || j.pushSentAt ? `<div class="push-offer" data-push-offer="${j.id}"></div>` : ''}
            <div class="perf" data-perf-box="${j.id}" hidden></div>
            <div class="offer-actions">
              ${j.status === 'approved' || j.status === 'closed' ? `<button class="btn btn-outline btn-sm" type="button" data-perf="${j.id}" aria-expanded="false">${icon('chart', 14)} Rendimiento</button>` : ''}
              <a class="btn btn-outline btn-sm" href="/publicar?edit=${j.id}">${icon('edit', 14)} Editar</a>
              <button class="btn btn-ghost btn-sm" type="button" data-dup="${j.id}">${icon('copy', 14)} Duplicar</button>
              <button class="btn btn-ghost btn-sm" type="button" data-close="${j.id}">${icon('x', 14)} Cerrar</button>
              ${j.status === 'approved' ? `<a class="btn btn-ghost btn-sm" href="/oferta/${j.id}" target="_blank" rel="noopener">${icon('external', 14)} Ver</a>` : ''}
              <button class="btn btn-danger btn-sm" type="button" data-del="${j.id}">${icon('trash', 14)}</button>
            </div>
          </div>
        </article>`;
      }).join('') : `<div class="empty"><h3>No hay publicaciones acá</h3><p>Probá con otro filtro o creá una búsqueda nueva.</p><a class="btn btn-primary" href="/publicar" style="margin-top:14px">Publicar empleo</a></div>`;

      /* extra "Avisar al celular": le llega el aviso al celular a la gente de la zona que lo pidió */
      $$('[data-push-offer]').forEach(async (box) => {
        const id = box.dataset.pushOffer;
        const job = data.jobs.find((x) => x.id === id) || {};
        let st;
        try { st = await api(`/api/company/jobs/${id}/push`); } catch (_) { box.remove(); return; }
        if (st.sentAt) { box.innerHTML = `<p class="feat-note is-on">${icon('bell', 14)} Le llegó al celular a <strong>${st.sentCount}</strong> persona${st.sentCount === 1 ? '' : 's'} el ${fmtDate(st.sentAt)}.</p>`; return; }
        if (!st.offered) { box.remove(); return; }
        if (!st.reach) { box.innerHTML = `<p class="feat-note muted">${icon('bell', 14)} Avisar al celular: todavía no hay personas de ${esc(job.locality || 'esta zona')} con los avisos de empleo activados. Apenas haya, vas a poder mandarlo.</p>`; return; }
        box.innerHTML = `<div class="feat-buy"><span>${icon('bell', 14)} <strong>Avisar al celular:</strong> le llega a <strong>${st.reach}</strong> persona${st.reach === 1 ? '' : 's'} de ${esc(job.locality || 'tu zona')} que busca${st.reach === 1 ? '' : 'n'} trabajo y activ${st.reach === 1 ? 'ó' : 'aron'} los avisos.</span>
          <div class="feat-opts"><button class="btn btn-primary btn-sm" type="button" data-push-send>${st.free ? 'Mandar · gratis' : `Mandar · $ ${Number(st.price).toLocaleString('es-AR')}`}</button></div>
          <small>${st.free ? 'Gratis durante el lanzamiento.' : 'Pagás con Mercado Pago y sale solo.'} Se manda una vez por aviso.</small></div>`;
        const btn = $('[data-push-send]', box);
        btn.addEventListener('click', async () => {
          if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Tocá de nuevo para confirmar'; setTimeout(() => { if (btn.isConnected && !btn.disabled) { delete btn.dataset.armed; btn.textContent = st.free ? 'Mandar · gratis' : `Mandar · $ ${Number(st.price).toLocaleString('es-AR')}`; } }, 4000); return; }
          btn.disabled = true; btn.textContent = st.free ? 'Mandando…' : 'Abriendo Mercado Pago…';
          try {
            const r = await api(`/api/company/jobs/${id}/push`, { method: 'POST' });
            if (r.url) { location.href = r.url; return; }
            toast(`Listo: el aviso le llegó al celular a ${r.sent} persona${r.sent === 1 ? '' : 's'}`, 'ok'); load();
          } catch (err) { toast(err.message, 'err'); btn.disabled = false; delete btn.dataset.armed; btn.textContent = 'Mandar'; }
        });
      });

      /* rendimiento de cada aviso: se carga al abrirlo */
      $$('[data-perf]').forEach((b) => b.addEventListener('click', async () => {
        const box = $(`[data-perf-box="${b.dataset.perf}"]`);
        const open = box.hidden;
        box.hidden = !open; b.setAttribute('aria-expanded', String(open));
        if (!open || box.dataset.loaded) return;
        box.innerHTML = '<p class="muted">Cargando…</p>';
        try {
          const job = data.jobs.find((x) => x.id === b.dataset.perf);
          box.innerHTML = perfHtml(await api(`/api/company/jobs/${b.dataset.perf}/stats`), job);
          box.dataset.loaded = '1';
        } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
      }));

      $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta publicación? También se borran sus postulaciones.')) return;
        try { await api(`/api/company/jobs/${b.dataset.del}`, { method: 'DELETE' }); toast('Publicación eliminada', 'ok'); load(); }
        catch (err) { toast(err.message, 'err'); }
      }));
      $$('[data-feat-buy]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        const label = b.textContent;
        b.textContent = 'Abriendo Mercado Pago…';
        try { const r = await api(`/api/company/jobs/${b.dataset.featBuy}/checkout`, { method: 'POST', body: { days: Number(b.dataset.days) } }); location.href = r.url; }
        catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = label; }
      }));
      $$('[data-feat-req]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/company/jobs/${b.dataset.featReq}/feature-request`, { method: 'POST' }); toast('Listo: pediste destacar el aviso', 'ok'); load(); }
        catch (err) { toast(err.message, 'err'); }
      }));
      $$('[data-feat-cancel]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/company/jobs/${b.dataset.featCancel}/feature-request`, { method: 'DELETE' }); toast('Pedido cancelado', 'ok'); load(); }
        catch (err) { toast(err.message, 'err'); }
      }));
      $$('[data-dup]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/company/jobs/${b.dataset.dup}/duplicate`, { method: 'POST' }); toast('Copia creada, pendiente de revisión', 'ok'); load(); }
        catch (err) { toast(err.message, 'err'); }
      }));
      $$('[data-close]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Cerrar esta búsqueda? Deja de aparecer en el portal.')) return;
        try { await api(`/api/company/jobs/${b.dataset.close}`, { method: 'PATCH', body: { status: 'closed' } }); toast('Búsqueda cerrada', 'ok'); load(); }
        catch (err) { toast(err.message, 'err'); }
      }));
    }
    $$('[data-job-filter]').forEach((b) => b.addEventListener('click', () => {
      jobStatus = b.dataset.jobFilter;
      $$('[data-job-filter]').forEach((x) => x.classList.toggle('is-active', x === b));
      renderJobs();
    }));
    $('#job-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      $$('#jobs-cards .offer-card').forEach((card) => {
        card.hidden = q && !card.textContent.toLowerCase().includes(q);
      });
    });

    /* ---------- postulantes (kanban) ---------- */
    function renderKanban() {
      const jobSel = $('#kanban-job');
      if (jobSel.options.length !== data.jobs.length + 1) {
        jobSel.innerHTML = `<option value="">Todas las búsquedas</option>` + data.jobs.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('');
        jobSel.value = jobFilter;
      }
      const apps = data.applications.filter((a) => {
        if (jobFilter && a.jobId !== jobFilter) return false;
        if (appSearch) {
          const hay = `${a.name} ${a.email} ${a.phone} ${a.jobTitle}`.toLowerCase();
          if (!hay.includes(appSearch.toLowerCase())) return false;
        }
        return true;
      });
      const counts = {};
      for (const s of STAGE_ORDER) counts[s] = apps.filter((a) => a.stage === s).length;
      $('#kanban').innerHTML = STAGE_ORDER.map((s) => `<section class="kanban-col" data-col="${s}">
        <header class="kanban-head"><span>${esc(STAGE_LABEL[s])}</span><b>${counts[s]}</b></header>
        <div class="kanban-cards">${apps.filter((a) => a.stage === s)
          .sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1) || b.createdAt - a.createdAt)
          .map(appCard).join('') || '<div class="kanban-empty">Sin postulantes</div>'}</div>
      </section>`).join('');

      $$('#kanban .app-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-quick-stage]')) return;
          openDrawer(card.dataset.app);
        });
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', card.dataset.app);
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      });
      $$('#kanban .kanban-col').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('is-over'); });
        col.addEventListener('dragleave', () => col.classList.remove('is-over'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('is-over');
          const id = e.dataTransfer.getData('text/plain');
          if (!id) return;
          await changeStage(id, col.dataset.col);
        });
      });
      $$('[data-quick-stage]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        await changeStage(b.dataset.appId, b.dataset.quickStage);
      }));
    }

    function appCard(a) {
      const nextIdx = STAGE_ORDER.indexOf(a.stage) + 1;
      const next = nextIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[nextIdx] : null;
      return `<article class="app-card" draggable="true" data-app="${a.id}">
        <div class="app-card-top">
          ${avatarHtml(a.name, a.candidate && a.candidate.photo, 'avatar-sm')}
          <div class="app-card-name"><strong>${esc(a.name)}</strong><small>${esc(a.jobTitle)}</small></div>
          ${a.aiScore != null ? `<span class="score-mini" title="Puntaje que le puso la IA (0 a 100)">IA ${a.aiScore}</span>` : ''}
        </div>
        <div class="app-card-meta">
          <span>${timeAgo(a.createdAt)}</span>
          ${a.rating ? `<span class="stars-mini">${'★'.repeat(a.rating)}</span>` : ''}
        </div>
        ${next ? `<button class="app-advance" type="button" data-quick-stage="${next}" data-app-id="${a.id}">Mover a ${esc(STAGE_LABEL[next])} ${icon('arrow', 13)}</button>` : ''}
      </article>`;
    }

    async function changeStage(id, stage) {
      try {
        const { application } = await api(`/api/company/applications/${id}`, { method: 'PATCH', body: { stage } });
        const i = data.applications.findIndex((a) => a.id === id);
        if (i >= 0) data.applications[i] = { ...data.applications[i], ...application };
        data.stageCounts = {};
        for (const s of STAGE_ORDER) data.stageCounts[s] = data.applications.filter((a) => a.stage === s).length;
        data.kpis.newApplications = data.stageCounts.nuevo;
        data.kpis.hired = data.stageCounts.contratado;
        data.kpis.applications = data.applications.length;
        renderOverview(); renderKanban();
        if (currentApp && currentApp.id === id) { currentApp = data.applications[i]; renderDrawer(); }
        toast(`Movido a ${STAGE_LABEL[stage]}`, 'ok');
      } catch (err) { toast(err.message, 'err'); }
    }

    $('#kanban-job').addEventListener('change', (e) => { jobFilter = e.target.value; renderKanban(); });
    let searchTimer;
    $('#kanban-search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { appSearch = e.target.value.trim(); renderKanban(); }, 180);
    });


    /* ---------- talento: gente disponible del Valle ---------- */
    const talentState = { jobId: '', locality: '', category: '', q: '', loaded: false };
    let talentTimer = null;
    function fillTalentFilters() {
      const published = data.jobs.filter((j) => j.status === 'approved');
      const sel = $('#talent-job');
      const keep = sel.value;
      sel.innerHTML = '<option value="">Elegí una búsqueda publicada…</option>' + published.map((j) => `<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
      sel.value = published.some((j) => j.id === keep) ? keep : (published[0] ? published[0].id : '');
      talentState.jobId = sel.value;
      if ($('#talent-loc').options.length <= 1) $('#talent-loc').innerHTML += meta.localities.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      if ($('#talent-cat').options.length <= 1) $('#talent-cat').innerHTML += meta.categories.filter((c) => c !== 'Otros').map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
    async function loadTalent() {
      if (!data) return;
      if (!talentState.loaded) { fillTalentFilters(); talentState.loaded = true; }
      const list = $('#talent-list');
      list.innerHTML = '<div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div>';
      const qs = new URLSearchParams(Object.entries(talentState).filter(([k, v]) => v && k !== 'loaded'));
      try {
        const r = await api(`/api/company/talent?${qs}`);
        $('#invites-left').textContent = `Te quedan ${r.invitesLeft} invitaciones hoy`;
        const job = data.jobs.find((j) => j.id === talentState.jobId);
        list.innerHTML = r.people.length ? r.people.map((p) => `<article class="talent-card">
          <div class="talent-top">
            ${avatarHtml(p.name, p.photo, 'avatar-lg')}
            <div class="talent-id"><strong>${esc(p.name)}</strong><span>${esc(p.headline || 'Sin titular')}</span><small>${icon('pin', 13)} ${esc(p.locality || 'Valle de Uco')}</small></div>
            ${p.match ? W.matchPill(p.match) : ''}
          </div>
          ${p.about ? `<p class="talent-about">${esc(p.about)}</p>` : ''}
          ${(p.skills || []).length ? `<div class="chips">${p.skills.slice(0, 6).map((k) => `<span class="badge">${esc(k)}</span>`).join('')}</div>` : ''}
          ${p.match && p.match.reasons.length ? `<p class="talent-why">${esc(p.match.reasons.slice(0, 2).join(' · '))}</p>` : ''}
          <div class="talent-foot">
            <span class="muted">${esc(p.availability || 'Disponibilidad a coordinar')}</span>
            ${p.applied ? '<span class="stage-pill stage-revisado"><i></i>Ya se postuló</span>'
              : p.invited ? '<span class="stage-pill stage-entrevista"><i></i>Invitada</span>'
                : job ? `<button class="btn btn-primary btn-sm" type="button" data-invite="${esc(p.id)}" data-name="${esc(p.name)}">${icon('send', 15)} Invitar</button>`
                  : '<span class="muted">Elegí una búsqueda para invitar</span>'}
          </div>
        </article>`).join('') : `<div class="empty" style="grid-column:1/-1"><h3>No encontramos gente con esos filtros</h3><p>Probá con otra habilidad o quitá la localidad.</p></div>`;
        $$('[data-invite]', list).forEach((b) => b.addEventListener('click', () => invite(b, job)));
      } catch (err) {
        list.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar la base de talento</h3><p>${esc(err.message)}</p></div>`;
      }
    }
    async function invite(btn, job) {
      const name = btn.dataset.name.split(' ')[0];
      const message = prompt(`Mensaje para ${name} (opcional). Le llega junto con la invitación a "${job.title}":`, `Hola ${name}, vimos tu perfil y creemos que podés sumar en ${data.company.name}. ¿Te postulás?`);
      if (message === null) return;
      btn.disabled = true;
      try {
        await api('/api/company/invitations', { method: 'POST', body: { jobId: job.id, candidateId: btn.dataset.invite, message } });
        btn.outerHTML = '<span class="stage-pill stage-entrevista"><i></i>Invitada</span>';
        toast(`Listo: ${name} recibió tu invitación`, 'ok');
        const left = $('#invites-left');
        const n = Number((left.textContent.match(/\d+/) || [0])[0]) - 1;
        left.textContent = `Te quedan ${Math.max(0, n)} invitaciones hoy`;
      } catch (err) { btn.disabled = false; toast(err.message, 'err'); }
    }
    $('#talent-job').addEventListener('change', (e) => { talentState.jobId = e.target.value; loadTalent(); });
    $('#talent-loc').addEventListener('change', (e) => { talentState.locality = e.target.value; loadTalent(); });
    $('#talent-cat').addEventListener('change', (e) => { talentState.category = e.target.value; loadTalent(); });
    $('#talent-q').addEventListener('input', (e) => {
      clearTimeout(talentTimer);
      talentTimer = setTimeout(() => { talentState.q = e.target.value.trim(); loadTalent(); }, 250);
    });

    /* mensajes rápidos de WhatsApp para la ficha */
    const quickMessages = (a) => {
      const first = String(a.name || '').split(' ')[0];
      return [
        ['Citar a entrevista', `Hola ${first}, te escribo de ${data.company.name}. Vimos tu postulación a "${a.jobTitle}" y nos gustaría conocerte. ¿Qué día y horario te queda bien para una entrevista esta semana?`],
        ['Pedir más datos', `Hola ${first}, te escribo de ${data.company.name} por tu postulación a "${a.jobTitle}". ¿Nos podrías contar un poco más de tu experiencia y desde cuándo podrías empezar?`],
        ['Avisar que no sigue', `Hola ${first}, te escribo de ${data.company.name}. Gracias por postularte a "${a.jobTitle}". Esta vez seguimos con otros perfiles, pero te tenemos en cuenta para próximas búsquedas. ¡Muchos éxitos!`],
      ];
    };

    /* ---------- ficha de postulante ---------- */
    function openDrawer(id) {
      currentApp = data.applications.find((a) => a.id === id);
      if (!currentApp) return;
      $('#drawer').hidden = false;
      document.body.style.overflow = 'hidden';
      renderDrawer();
    }
    function closeDrawer() {
      $('#drawer').hidden = true;
      document.body.style.overflow = '';
      currentApp = null;
    }
    $$('[data-close-drawer]').forEach((b) => b.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });

    function renderDrawer() {
      const a = currentApp;
      if (!a) return;
      const c = a.candidate;
      const cvHref = a.hasCv ? `/api/company/cv/${a.id}` : (c && c.cvUrl ? c.cvUrl : '');
      const msg = `Hola ${a.name}, te escribo de ${data.company.name} por tu postulación a "${a.jobTitle}".`;
      $('#drawer-body').innerHTML = `
        <div class="drawer-head">
          ${avatarHtml(a.name, c && c.photo, 'avatar-xl')}
          <div class="drawer-id">
            <h2>${esc(a.name)}</h2>
            <p>${esc(a.jobTitle)} · ${timeAgo(a.createdAt)}</p>
            <div class="drawer-badges">${stagePill(a.stage)}${a.match ? W.matchPill(a.match) : ''}${a.aiScore != null ? `<span class="badge badge-ai">${icon('sparkles', 13)} IA ${a.aiScore}</span>` : ''}</div>
          </div>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Cerrar">${icon('x', 18)}</button>
        </div>

        <div class="contact-actions">
          <a class="btn btn-primary btn-sm" href="${waLink(a.phone, msg)}" target="_blank" rel="noopener">${icon('whatsapp', 15)} WhatsApp</a>
          <a class="btn btn-outline btn-sm" href="mailto:${esc(a.email)}?subject=${encodeURIComponent('Tu postulación a ' + a.jobTitle)}">${icon('mail', 15)} Email</a>
          <a class="btn btn-outline btn-sm" href="tel:${esc(a.phone)}">${icon('phone', 15)} Llamar</a>
          ${cvHref ? `<a class="btn btn-outline btn-sm" href="${cvHref}" target="_blank" rel="noopener">${icon('file', 15)} CV en PDF</a>` : ''}
          ${a.candidateId ? `<a class="btn btn-outline btn-sm" href="/cv/${esc(a.candidateId)}" target="_blank" rel="noopener">${icon('file', 15)} CV WorkUco</a>` : ''}
        </div>

        <div class="drawer-section quick-wa">
          <h3>Mensajes rápidos por WhatsApp</h3>
          <div class="quick-wa-list">${quickMessages(a).map(([label, text], i) => `<a class="quick-wa-btn" href="${waLink(a.phone, text)}" target="_blank" rel="noopener" data-quick="${i}">${icon('whatsapp', 15)} ${esc(label)}</a>`).join('')}</div>
          ${a.match ? `<p class="muted" style="margin-top:10px">Compatibilidad con el aviso: ${esc(a.match.reasons.join(' · ') || 'sin coincidencias fuertes')}${a.match.missing.length ? `. Le faltaría: ${esc(a.match.missing.join(', '))}` : ''}.</p>` : ''}
        </div>

        <div class="drawer-section">
          <h3>Etapa del proceso</h3>
          <div class="stage-picker">${STAGE_ORDER.map((s) => `<button type="button" class="stage-choice stage-${s}${a.stage === s ? ' is-active' : ''}" data-set-stage="${s}">${esc(STAGE_LABEL[s])}</button>`).join('')}</div>
        </div>

        ${a.stage === 'contratado' && window.WKCert ? '<div class="drawer-section cert-box" id="cert-slot"></div>' : ''}

        <div class="drawer-section">
          <h3>Tu evaluación</h3>
          <div class="rating-row"><span>Puntaje</span><div class="stars">${starRow(a.rating, true)}</div></div>
          <div class="tag-editor">
            <div class="tag-list" id="tag-list">${(a.tags || []).map((t) => `<span class="tag">${esc(t)}<button type="button" data-rm-tag="${esc(t)}">${icon('x', 11)}</button></span>`).join('') || '<span class="muted">Sin etiquetas</span>'}</div>
            <div class="tag-add"><input class="input input-sm" id="tag-input" placeholder="Agregar etiqueta (ej. entrevista lunes)" maxlength="30"><button class="btn btn-outline btn-sm" type="button" id="tag-add">Agregar</button></div>
          </div>
          <label class="notes-label" for="notes">Notas privadas</label>
          <textarea class="input" id="notes" rows="4" placeholder="Ej.: tiene disponibilidad inmediata, pidió turno tarde…">${esc(a.notes || '')}</textarea>
          <div class="notes-state" id="notes-state"></div>
        </div>

        ${c ? `<div class="drawer-section">
          <h3>Perfil</h3>
          <p class="drawer-headline">${esc(c.headline || 'Sin titular')}</p>
          <p class="soft-text">${esc(c.about || '')}</p>
          <div class="mini-grid">
            <div><span>Localidad</span><strong>${esc(c.locality || '—')}</strong></div>
            <div><span>Disponibilidad</span><strong>${esc(c.availability || '—')}</strong></div>
            <div><span>Experiencia</span><strong>${esc(c.experience || '—')}</strong></div>
            <div><span>Formación</span><strong>${esc(c.education || '—')}</strong></div>
          </div>
          ${(c.skills || []).length ? `<div class="chips" style="margin-top:12px">${c.skills.map((s) => `<span class="badge">${esc(s)}</span>`).join('')}</div>` : ''}
        </div>` : ''}

        ${a.message ? `<div class="drawer-section"><h3>Mensaje de presentación</h3><blockquote class="quote">${esc(a.message)}</blockquote></div>` : ''}

        <div class="drawer-section ai-box">
          <div class="ai-box-head">
            <h3>${icon('sparkles', 17)} Análisis con IA</h3>
            <button class="btn btn-outline btn-sm" type="button" id="analyze-btn">${a.aiAt ? 'Volver a analizar' : 'Analizar CV'}</button>
          </div>
          <div id="ai-result">${renderAiResult(a)}</div>
        </div>

        <div class="drawer-foot">
          <button class="btn btn-danger btn-sm" type="button" id="discard-btn">${icon('x', 14)} Descartar</button>
          <button class="btn btn-ghost btn-sm" type="button" data-close-drawer>Cerrar</button>
        </div>`;

      $$('[data-close-drawer]', $('#drawer')).forEach((b) => b.addEventListener('click', closeDrawer));
      $$('[data-set-stage]').forEach((b) => b.addEventListener('click', () => changeStage(a.id, b.dataset.setStage)));
      if ($('#cert-slot')) window.WKCert.drawerSection($('#cert-slot'), a, () => window.WKCert.companyList($('#cert-issued')));
      $$('[data-rate]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const { application } = await api(`/api/company/applications/${a.id}`, { method: 'PATCH', body: { rating: Number(b.dataset.rate) } });
          Object.assign(a, application);
          renderDrawer(); renderKanban();
        } catch (err) { toast(err.message, 'err'); }
      }));

      const notes = $('#notes');
      notes.addEventListener('input', () => {
        $('#notes-state').textContent = 'Guardando…';
        clearTimeout(autoTimer);
        autoTimer = setTimeout(async () => {
          try {
            await api(`/api/company/applications/${a.id}`, { method: 'PATCH', body: { notes: notes.value } });
            a.notes = notes.value;
            $('#notes-state').textContent = 'Guardado';
            setTimeout(() => { const el = $('#notes-state'); if (el) el.textContent = ''; }, 1400);
          } catch (err) { $('#notes-state').textContent = 'No se pudo guardar'; }
        }, 700);
      });

      const addTag = async () => {
        const v = $('#tag-input').value.trim();
        if (!v) return;
        const tags = [...(a.tags || []), v.slice(0, 30)];
        try {
          const { application } = await api(`/api/company/applications/${a.id}`, { method: 'PATCH', body: { tags } });
          Object.assign(a, application);
          renderDrawer();
        } catch (err) { toast(err.message, 'err'); }
      };
      $('#tag-add').addEventListener('click', addTag);
      $('#tag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
      $$('[data-rm-tag]').forEach((b) => b.addEventListener('click', async () => {
        const tags = (a.tags || []).filter((t) => t !== b.dataset.rmTag);
        try {
          const { application } = await api(`/api/company/applications/${a.id}`, { method: 'PATCH', body: { tags } });
          Object.assign(a, application); renderDrawer();
        } catch (err) { toast(err.message, 'err'); }
      }));

      $('#discard-btn').addEventListener('click', () => changeStage(a.id, 'descartado'));

      $('#analyze-btn').addEventListener('click', async () => {
        const btn = $('#analyze-btn');
        btn.disabled = true; btn.textContent = 'Analizando…';
        $('#ai-result').innerHTML = '<div class="ai-loading"><span class="spinner"></span> Leyendo el CV y comparándolo con el puesto…</div>';
        try {
          const { application } = await api(`/api/company/applications/${a.id}/analyze`, { method: 'POST' });
          Object.assign(a, application);
          renderDrawer(); renderKanban(); renderOverview();
          toast('Análisis listo', 'ok');
        } catch (err) {
          $('#ai-result').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div><p class="muted" style="margin-top:8px">Revisá la configuración en la pestaña IA.</p>`;
          btn.disabled = false; btn.textContent = 'Reintentar';
        }
      });
    }

    function renderAiResult(a) {
      if (!a.aiAt && a.aiScore == null) {
        return `<p class="muted">Sin análisis todavía. La IA lee el CV y el perfil, y te devuelve un resumen, puntos fuertes y dudas para la entrevista.</p>`;
      }
      const rec = { avanzar: ['Recomendado para avanzar', 'ok'], entrevistar: ['Vale una entrevista', 'info'], dudar: ['Hay dudas, revisá el perfil', 'warn'], descartar: ['No parece encajar', 'bad'] }[a.aiRecommendation] || ['Análisis', 'info'];
      return `<div class="ai-result">
        <div class="ai-score-row">${scoreRing(a.aiScore)}<div><span class="ai-rec ai-rec-${rec[1]}">${esc(rec[0])}</span>
          ${a.aiSeniority ? `<small class="muted">Seniority estimado: ${esc(a.aiSeniority)}</small>` : ''}</div></div>
        <p class="ai-summary">${esc(a.aiSummary || '')}</p>
        ${(a.aiStrengths || []).length ? `<div class="ai-cols"><div><h4>${icon('check', 14)} Puntos fuertes</h4><ul>${a.aiStrengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>${icon('x', 14)} Para preguntar</h4><ul>${(a.aiGaps || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>Sin dudas detectadas</li>'}</ul></div></div>` : ''}
        ${(a.aiSkills || []).length ? `<div class="chips" style="margin-top:10px">${a.aiSkills.map((s) => `<span class="badge badge-ai-soft">${esc(s)}</span>`).join('')}</div>` : ''}
        <small class="muted">${a.aiAt ? `Analizado ${timeAgo(a.aiAt)}` : ''} · La IA puede equivocarse: usalo como apoyo, no como decisión final.</small>
      </div>`;
    }

    /* ---------- empresa ---------- */
    function renderCompanyTab() {
      const c = data.company;
      $('#p-name').value = c.name || '';
      $('#p-locality').value = c.locality || '';
      $('#p-phone').value = c.phone || '';
      $('#p-website').value = c.website || '';
      $('#p-employees').value = c.employees || '';
      $('#p-desc').value = c.description || '';
      $('#p-logo-preview').innerHTML = logoHtml(c.name, c.logo, 'logo-lg');
      const gallery = c.gallery || [];
      $('#p-gallery').innerHTML = gallery.length ? gallery.map((src) => `<figure class="gallery-item">
        <img src="${esc(src)}" alt="">
        <button type="button" class="gallery-del" data-rm-photo="${esc(src.split('/').pop())}" aria-label="Quitar foto">${icon('x', 14)}</button>
      </figure>`).join('') : `<div class="gallery-empty">${icon('image', 24)}<span>Subí fotos de tu local, equipo o trabajo. Se muestran en tus avisos.</span></div>`;
      $$('[data-rm-photo]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Quitar esta foto?')) return;
        try { const { company } = await api(`/api/company/gallery?file=${encodeURIComponent(b.dataset.rmPhoto)}`, { method: 'DELETE' }); data.company = company; renderCompanyTab(); renderOverview(); toast('Foto eliminada', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
      }));

      const locSel = $('#p-locality');
      if (locSel.options.length <= 1) {
        locSel.innerHTML = `<option value="">Sin definir</option>` + meta.localities.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      }
      locSel.value = c.locality || '';
    }

    /* ---------- soluciones (servicios para empresas) ---------- */
    let solData = null;
    const solLabel = (id) => ((solData && solData.services.find((s) => s.id === id)) || { label: id }).label;
    const paintSolState = (it) => {
      const on = it.services.length > 0;
      $('#sol-off').hidden = !on;
      $('#sol-state').textContent = on ? `Te vamos a escribir por: ${it.services.map(solLabel).join(', ')}.` : '';
    };
    async function renderSolutions() {
      try { solData = await api('/api/company/services'); } catch (err) { showAlert($('#sol-alert'), err.message, 'error'); return; }
      const it = solData.interest;
      $('#sol-list').innerHTML = solData.services.map((s) => `<label class="sol-card${it.services.includes(s.id) ? ' is-on' : ''}">
        <input type="checkbox" value="${esc(s.id)}"${it.services.includes(s.id) ? ' checked' : ''}>
        <span class="sol-title">${esc(s.label)}</span>
        <span class="sol-desc">${esc(s.description)}</span>
        <span class="sol-pick">${icon('check', 16)} Me interesa</span>
      </label>`).join('');
      $$('#sol-list input').forEach((i) => i.addEventListener('change', () => i.closest('.sol-card').classList.toggle('is-on', i.checked)));
      $('#sol-note').value = it.note || '';
      $('#sol-ok').checked = !!it.marketingOk;
      paintSolState(it);
    }
    $('#sol-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert($('#sol-alert')); setFieldErrors($('#sol-form'), null);
      const services = $$('#sol-list input:checked').map((i) => i.value);
      if (!services.length) { showAlert($('#sol-alert'), 'Marcá al menos un servicio que te interese.', 'error'); return; }
      const btn = $('#sol-save'); btn.disabled = true;
      try {
        solData = await api('/api/company/services', { method: 'PUT', body: { services, note: $('#sol-note').value.trim(), marketingOk: $('#sol-ok').checked } });
        paintSolState(solData.interest);
        showAlert($('#sol-alert'), '¡Listo! Te vamos a escribir para contarte más, sin compromiso.', 'ok');
      } catch (err) { showAlert($('#sol-alert'), err.message, 'error'); setFieldErrors($('#sol-form'), err.fields); }
      finally { btn.disabled = false; }
    });
    $('#sol-off').addEventListener('click', async () => {
      try {
        await api('/api/company/services', { method: 'PUT', body: { services: [], note: '', marketingOk: false } });
        await renderSolutions();
        showAlert($('#sol-alert'), 'Listo: no te vamos a escribir por estos servicios.', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#profile-save');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const { company } = await api('/api/company/profile', { method: 'PATCH', body: {
          name: $('#p-name').value.trim(), locality: $('#p-locality').value,
          phone: $('#p-phone').value.trim(), website: $('#p-website').value.trim(),
          employees: $('#p-employees').value, description: $('#p-desc').value.trim(),
        } });
        data.company = company;
        paintSidebar();
        showAlert($('#profile-alert'), 'Perfil actualizado.', 'ok');
        setTimeout(() => hideAlert($('#profile-alert')), 2500);
        renderOverview();
      } catch (err) {
        showAlert($('#profile-alert'), err.message, 'error');
        setFieldErrors($('#profile-form'), err.fields);
      } finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });

    $('#p-logo-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const logo = await shrinkImage(file, 480, 0.9);
        const { company } = await api('/api/company/profile', { method: 'PATCH', body: { logo } });
        data.company = company; renderCompanyTab(); paintSidebar(); renderOverview();
        toast('Logo actualizado', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    });

    $('#p-gallery-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).slice(0, 4);
      if (!files.length) return;
      const status = $('#gallery-status');
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Subiendo ${i + 1} de ${files.length}…`;
        try {
          const image = await shrinkImage(files[i], 1500, 0.82);
          const { company } = await api('/api/company/gallery', { method: 'POST', body: { image } });
          data.company = company;
        } catch (err) { toast(err.message, 'err'); }
      }
      status.textContent = '';
      renderCompanyTab(); renderOverview();
      e.target.value = '';
      toast('Fotos actualizadas', 'ok');
    });

    /* ---------- IA ---------- */
    const AI_MODELS = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
      gemini: ['gemini-3.5-flash-lite', 'gemini-3.8-flash'],
      anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
      custom: ['llama-3.3-70b-versatile', 'mistral-large-latest', 'deepseek-chat'],
    };
    const fillModels = (provider) => {
      const list = $('#ai-models');
      if (!list) return;
      list.innerHTML = (AI_MODELS[provider] || []).map((m) => `<option value="${esc(m)}"></option>`).join('');
    };
    let aiState = null;
    function renderAiTab() {
      if (!data) return;
      aiState = { ...(data.company.ai || {}) };
      const providers = meta.aiProviders || [];
      $('#ai-providers').innerHTML = providers.map((p) => `<button type="button" class="provider-card${aiState.provider === p.id ? ' is-active' : ''}" data-provider="${p.id}">
        <strong>${esc(p.name)}</strong><small>${esc(p.hint)}</small>
      </button>`).join('');
      $('#ai-key').value = '';
      $('#ai-key').placeholder = aiState.hasKey ? `Guardada: ${aiState.keyMask} (dejá vacío para conservar)` : 'Pegá tu API key';
      $('#ai-model').value = aiState.model || '';
      fillModels(aiState.provider);
      $('#ai-base').value = aiState.baseUrl || '';
      $('#ai-base-wrap').hidden = aiState.provider !== 'custom';
      $('#ai-enabled').checked = !!aiState.enabled;
      $('#ai-auto').checked = aiState.auto !== false;
      $('#ai-status').innerHTML = aiState.provider
        ? `${aiState.hasKey ? `<span class="status-dot ok"></span> Conectada a <strong>${esc(providers.find((p) => p.id === aiState.provider)?.name || aiState.provider)}</strong>` : '<span class="status-dot warn"></span> Falta la API key'}`
        : '<span class="status-dot"></span> Sin proveedor configurado';

      $$('[data-provider]').forEach((b) => b.addEventListener('click', () => {
        aiState.provider = b.dataset.provider;
        $$('[data-provider]').forEach((x) => x.classList.toggle('is-active', x === b));
        const p = providers.find((x) => x.id === b.dataset.provider);
        $('#ai-base-wrap').hidden = aiState.provider !== 'custom';
        if (!aiState.model || ['openai', 'gemini', 'anthropic', 'custom'].includes(aiState.provider)) {
          $('#ai-model').value = ({ openai: 'gpt-4o-mini', gemini: 'gemini-3.5-flash-lite', anthropic: 'claude-sonnet-5-5', custom: '' })[aiState.provider] || '';
        }
        if (aiState.provider === 'custom' && !$('#ai-base').value) $('#ai-base').value = '';
        fillModels(aiState.provider);
      }));
    }

    async function saveAi({ quiet = false } = {}) {
      const btn = $('#ai-save');
      btn.disabled = true; btn.textContent = 'Guardando…';
      const body = {
        provider: aiState.provider || '', model: $('#ai-model').value.trim(),
        baseUrl: $('#ai-base').value.trim(), enabled: $('#ai-enabled').checked, auto: $('#ai-auto').checked,
      };
      const key = $('#ai-key').value.trim();
      if (key) body.apiKey = key;
      try {
        const { ai } = await api('/api/company/ai', { method: 'PATCH', body });
        data.company.ai = ai;
        if (!quiet) {
          showAlert($('#ai-alert'), 'Configuración de IA guardada.', 'ok');
          setTimeout(() => hideAlert($('#ai-alert')), 2500);
        }
        renderAiTab(); renderOverview();
        return true;
      } catch (err) { showAlert($('#ai-alert'), err.message, 'error'); return false; }
      finally { btn.disabled = false; btn.textContent = 'Guardar configuración'; }
    }
    $('#ai-save').addEventListener('click', () => saveAi());
    $('#ai-test').addEventListener('click', async () => {
      const btn = $('#ai-test');
      if (!aiState.provider) { showAlert($('#ai-alert'), 'Elegí un proveedor de IA primero.', 'error'); return; }
      /* se prueba lo que está en pantalla: primero se guarda */
      if (!(await saveAi({ quiet: true }))) return;
      btn.disabled = true; btn.textContent = 'Probando…';
      try {
        const r = await api('/api/company/ai/test', { method: 'POST' });
        showAlert($('#ai-alert'), `Conexión exitosa. La IA respondió: ${JSON.stringify(r.reply).slice(0, 80)}`, 'ok');
      } catch (err) { showAlert($('#ai-alert'), err.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Probar conexión'; }
    });

    /* ---------- alta manual ---------- */
    $('#manual-open')?.addEventListener('click', () => {
      $('#manual-modal').hidden = false;
      const sel = $('#m-job');
      sel.innerHTML = data.jobs.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('');
    });
    $$('[data-close-manual]').forEach((b) => b.addEventListener('click', () => { $('#manual-modal').hidden = true; }));
    $('#manual-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        jobId: $('#m-job').value, name: $('#m-name').value.trim(), email: $('#m-email').value.trim(),
        phone: $('#m-phone').value.trim(), message: $('#m-msg').value.trim(),
      };
      const file = $('#m-cv').files && $('#m-cv').files[0];
      if (file) body.cv = { name: file.name, data: await W.fileToBase64(file) };
      try {
        await api('/api/company/applications', { method: 'POST', body });
        $('#manual-modal').hidden = true;
        $('#manual-form').reset();
        toast('Postulante agregado', 'ok');
        load();
      } catch (err) { toast(err.message, 'err'); }
    });

    await load();

    /* vuelta desde Mercado Pago: se confirma el pago (el aviso de Mercado Pago puede tardar) */
    const pq = new URLSearchParams(location.search);
    if (pq.get('pago')) {
      const pid = pq.get('payment_id') || pq.get('collection_id') || '';
      history.replaceState(null, '', '/panel#ofertas');
      showTab('jobs');
      if (pq.get('pago') === 'error') toast('El pago no se completó. Podés intentarlo de nuevo cuando quieras.', 'err');
      else if (/^\d{1,20}$/.test(pid)) {
        try {
          const r = await api('/api/company/payments/confirm', { method: 'POST', body: { paymentId: pid } });
          if (r.kind === 'push') {
            toast(r.status === 'approved' ? '¡Listo! Tu aviso ya le llegó al celular a la gente de tu zona.' : 'Tu pago está en proceso: el aviso se manda solo cuando se apruebe.', 'ok');
          } else if (r.kind === 'cosecha') {
            toast(r.status === 'approved' ? '¡Listo! Tu Pack Cosecha está activo.' : 'Tu pago está en proceso: el Pack Cosecha se activa solo cuando se apruebe.', 'ok');
            showTab('overview');
          } else toast(r.status === 'approved' ? `¡Listo! Tu aviso quedó destacado por ${r.days} días.` : 'Tu pago está en proceso: el aviso se destaca solo cuando se apruebe.', 'ok');
          load();
        } catch (err) { toast(err.message, 'err'); }
      } else toast('Tu pago está en proceso: el aviso se destaca solo cuando se apruebe.', 'ok');
    }
  }

  /* ================================================================== */
  /* PANEL DE LA PERSONA                                                */
  /* ================================================================== */
  async function initProfile() {
    const user = W.state.user;
    if (!user || user.role !== 'candidate') {
      $('#profile-loading').hidden = true;
      $('#profile-gate').hidden = false;
      $('#profile-gate').innerHTML = `<div class="card gate-card">
        <h1>${user && user.role === 'company' ? 'Estás con tu cuenta de empresa' : 'Tu perfil de trabajo'}</h1>
        <p>${user && user.role === 'company'
          ? 'Para postularte necesitás una cuenta de persona. Podés volver al panel de empresa o crear otra cuenta.'
          : 'Creá tu perfil con foto y CV para postularte en un toque y seguir el estado de cada postulación.'}</p>
        <div class="gate-actions">${user && user.role === 'company'
          ? `<a class="btn btn-primary" href="/panel">Ir al panel</a><a class="btn btn-outline" href="/acceder?rol=empleado">Crear cuenta de persona</a>`
          : `<a class="btn btn-primary" href="/acceder?rol=empleado&modo=registro&next=/mi-perfil">Crear mi perfil</a><a class="btn btn-outline" href="/acceder?rol=empleado&next=/mi-perfil">Ya tengo cuenta</a>`}</div>
      </div>`;
      return;
    }
    $('#profile-loading').hidden = true;
    $('#profile-app').hidden = false;

    const meta = await W.loadMeta();
    let profile = null;
    let applications = [];
    let saved = [];
    let invites = [];
    let alerts = [];
    let recs = [];

    let placesReady = false;
    let prefsReady = false;
    const showTab = (name) => {
      $$('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (name === 'services' && !placesReady && window.WKGuia) { placesReady = true; window.WKGuia.initMyPlaces($('#my-places')); }
      if (name === 'prefs' && !prefsReady) { prefsReady = true; W.initPrefs($('#prefs-box')); }
      if (name === 'certs' && window.WKCert) window.WKCert.profileSection($('#my-certs'));
    };
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    /* las notificaciones abren la pestaña justa: /mi-perfil?tab=postulaciones */
    const TAB_ALIAS = { postulaciones: 'apps', alertas: 'alerts', invitaciones: 'foryou', guardadas: 'saved', servicios: 'services', preferencias: 'prefs', datos: 'prefs', certificados: 'certs' };
    const wanted = new URLSearchParams(location.search).get('tab');
    const tabName = TAB_ALIAS[wanted] || (['profile', 'foryou', 'apps', 'certs', 'alerts', 'saved', 'services', 'prefs'].includes(wanted) ? wanted : '');
    if (tabName) showTab(tabName);

    async function load() {
      try {
        const [p, a, s, inv, al, rc] = await Promise.all([api('/api/candidate/profile'), api('/api/candidate/applications'), api('/api/candidate/saved'),
          api('/api/candidate/invitations'), api('/api/candidate/alerts'), api('/api/candidate/recommended')]);
        profile = p.candidate; applications = a.applications; saved = s.jobs;
        invites = inv.invitations; alerts = al.alerts; recs = rc.jobs;
        render();
      } catch (err) {
        if (err.status === 401) location.href = '/acceder?rol=empleado&next=/mi-perfil';
        else toast(err.message, 'err');
      }
    }

    function render() {
      const pct = W.profileCompleteness(profile);
      $('#profile-name').textContent = profile.name;
      $('#profile-summary').innerHTML = `
        ${avatarHtml(profile.name, profile.photo, 'avatar-xl')}
        <h2>${esc(profile.name)}</h2>
        <p class="profile-headline">${esc(profile.headline || 'Sumá un titular que te describa')}</p>
        <p class="muted">${icon('pin', 14)} ${esc(profile.locality || 'Valle de Uco')}</p>
        <div class="profile-bar big"><span style="width:${pct}%"></span></div>
        <div class="profile-pct">${pct}% completo</div>
        <div class="profile-mini-stats">
          <div><strong>${applications.length}</strong><span>Postulaciones</span></div>
          <div><strong>${saved.length}</strong><span>Guardadas</span></div>
        </div>
        <div class="chips">${(profile.skills || []).slice(0, 8).map((s) => `<span class="badge">${esc(s)}</span>`).join('') || '<span class="muted">Todavía no cargaste habilidades</span>'}</div>`;

      $('#c-name').value = profile.name || '';
      $('#c-phone').value = profile.phone || '';
      $('#c-locality').value = profile.locality || '';
      $('#c-headline').value = profile.headline || '';
      $('#c-about').value = profile.about || '';
      $('#c-experience').value = profile.experience || '';
      $('#c-education').value = profile.education || '';
      $('#c-availability').value = profile.availability || '';
      $('#c-linkedin').value = profile.linkedin || '';
      if ($('#c-locality').options.length <= 1) {
        $('#c-locality').innerHTML = `<option value="">Elegí tu localidad</option>` + meta.localities.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
        $('#c-locality').value = profile.locality || '';
      }
      $('#photo-preview').innerHTML = avatarHtml(profile.name, profile.photo, 'avatar-xxl');
      if ($('#photo-remove')) $('#photo-remove').hidden = !profile.photo;
      renderSkills();
      renderAvailability();
      $('#cv-status').innerHTML = profile.hasCv
        ? `<div class="file-pill">${icon('file', 16)} <span>${esc(profile.cvName || 'cv.pdf')}</span><a href="${profile.cvUrl}" target="_blank" rel="noopener">Ver</a><button type="button" id="cv-remove">Quitar</button></div>`
        : `<div class="file-empty">${icon('file', 18)} Todavía no cargaste tu CV. Sumalo para postularte mejor.</div>`;
      $('#cv-remove')?.addEventListener('click', async () => {
        if (!confirm('¿Quitar tu CV?')) return;
        try { const r = await api('/api/candidate/profile', { method: 'PATCH', body: { removeCv: true } }); profile = r.candidate; render(); toast('CV eliminado', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
      });
      renderApps();
      renderSaved();
      renderVisibility();
      renderForYou();
      renderAlerts();
    }

    /* visibilidad: disponible, rubros, sueldo, perfil público */
    function renderVisibility() {
      $('#c-open').checked = !!profile.openToWork;
      $('#c-public').checked = !!profile.isPublic;
      $('#c-salary').value = profile.salaryMin || '';
      const cats = new Set(profile.categories || []);
      $('#cat-chips').innerHTML = meta.categories.filter((c) => c !== 'Otros').map((c) =>
        `<button type="button" class="filter-chip${cats.has(c) ? ' is-active' : ''}" data-cat="${esc(c)}" aria-pressed="${cats.has(c)}">${esc(c)}</button>`).join('');
      $$('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        b.classList.toggle('is-active');
        b.setAttribute('aria-pressed', String(b.classList.contains('is-active')));
      }));
      const url = `${location.origin}/p/${profile.publicSlug}`;
      $('#public-url').textContent = url;
      $('#share-wa').href = `https://wa.me/?text=${encodeURIComponent(`Mirá mi perfil en WorkUco: ${url}`)}`;
      $('#share-row').hidden = !profile.isPublic;
      const cv = `/cv/${profile.id}`;
      $('#cv-link').href = cv;
      $$('[data-cv-link]').forEach((a) => { a.href = cv; });
    }
    $('#copy-public').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#public-url').textContent); toast('Link copiado', 'ok'); } catch (_) { toast('No pudimos copiar el link', 'err'); }
    });
    /* estos dos interruptores se guardan al toque, sin esperar al botón */
    ['#c-open', '#c-public'].forEach((sel) => $(sel).addEventListener('change', async (e) => {
      const body = sel === '#c-open' ? { openToWork: e.target.checked } : { isPublic: e.target.checked };
      try {
        const r = await api('/api/candidate/profile', { method: 'PATCH', body });
        profile = r.candidate;
        $('#share-row').hidden = !profile.isPublic;
        toast(sel === '#c-open'
          ? (profile.openToWork ? 'Listo: las empresas ya pueden encontrarte' : 'Saliste de la base de talento')
          : (profile.isPublic ? 'Tu perfil público está activo' : 'Tu perfil público quedó oculto'), 'ok');
      } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'err'); }
    }));

    function renderForYou() {
      const pending = invites.filter((i) => i.status === 'enviada');
      const count = $('#foryou-count');
      count.hidden = !pending.length; count.textContent = String(pending.length);
      $('#my-invites').innerHTML = invites.length ? invites.map((i) => `<div class="my-app invite">
        ${logoHtml(i.companyName, i.job.companyLogo, 'logo')}
        <div class="my-app-main"><strong>${esc(i.job.title)}</strong><span>${esc(i.companyName)} · ${esc(i.job.locality)}${i.job.salaryLabel ? ` · ${esc(i.job.salaryLabel)}` : ''}</span>
          ${i.message ? `<p class="invite-msg">“${esc(i.message)}”</p>` : ''}<small>${esc(timeAgo(i.createdAt))}</small></div>
        ${i.status === 'postulada' ? '<span class="stage-pill stage-revisado"><i></i>Ya te postulaste</span>'
          : `<a class="btn btn-primary btn-sm" href="/oferta/${esc(i.job.id)}">Ver y postularme</a>`}
      </div>`).join('') : '<div class="empty"><h3>Todavía no te invitaron</h3><p>Activá "Estoy disponible" para que las empresas te encuentren.</p></div>';
      $('#my-recs').innerHTML = recs.length ? recs.map(W.jobCard).join('')
        : '<div class="empty" style="grid-column:1/-1"><h3>Todavía no hay recomendaciones</h3><p>Sumá habilidades, localidad y rubros para que calculemos tu compatibilidad.</p></div>';
    }

    function renderAlerts() {
      $('#my-alerts').innerHTML = alerts.length ? alerts.map((a) => `<div class="my-app">
        <span class="alert-ico">${icon('clock', 18)}</span>
        <div class="my-app-main"><strong>${esc(a.label)}</strong><small>Creada ${esc(timeAgo(a.createdAt).toLowerCase())}</small></div>
        <a class="btn btn-ghost btn-sm" href="/buscar?${new URLSearchParams(Object.entries({ q: a.q, locality: a.locality, category: a.category, type: a.type, modality: a.modality, gig: a.gig ? '1' : '' }).filter(([, v]) => v))}">Ver ofertas</a>
        <button class="icon-btn" type="button" data-rm-alert="${esc(a.id)}" title="Borrar alerta" aria-label="Borrar alerta">${icon('trash', 16)}</button>
      </div>`).join('') : '<div class="empty"><h3>No tenés alertas</h3><p>En Buscar empleo, filtrá lo que te interesa y tocá "Avisarme de búsquedas como esta".</p></div>';
      $$('[data-rm-alert]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/candidate/alerts/${b.dataset.rmAlert}`, { method: 'DELETE' }); alerts = alerts.filter((x) => x.id !== b.dataset.rmAlert); renderAlerts(); toast('Alerta borrada', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
      }));
    }


    let skills = [];
    function renderSkills() {
      skills = [...(profile.skills || [])];
      $('#skills-list').innerHTML = skills.length ? skills.map((s, i) => `<span class="tag">${esc(s)}<button type="button" data-rm-skill="${i}">${icon('x', 11)}</button></span>`).join('') : '<span class="muted">Agregá habilidades (ej. atención al público, Excel, tractor)</span>';
      $$('[data-rm-skill]').forEach((b) => b.addEventListener('click', () => { skills.splice(Number(b.dataset.rmSkill), 1); profile.skills = [...skills]; renderSkills(); }));
    }
    $('#skill-add').addEventListener('click', () => {
      const v = $('#skill-input').value.trim();
      if (!v) return;
      if (!skills.includes(v)) skills.push(v.slice(0, 30));
      $('#skill-input').value = '';
      profile.skills = [...skills];
      renderSkills();
    });
    $('#skill-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#skill-add').click(); } });

    function renderAvailability() {
      const opts = ['Tiempo completo', 'Medio tiempo', 'Turnos rotativos', 'Fines de semana', 'Disponibilidad inmediata'];
      $('#avail-chips').innerHTML = opts.map((o) => `<button type="button" class="filter-chip${(profile.availability || '').includes(o) ? ' is-active' : ''}" data-avail="${esc(o)}">${esc(o)}</button>`).join('');
      $$('[data-avail]').forEach((b) => b.addEventListener('click', () => {
        const current = ($('#c-availability').value || '').split(',').map((x) => x.trim()).filter(Boolean);
        const i = current.indexOf(b.dataset.avail);
        if (i >= 0) current.splice(i, 1); else current.push(b.dataset.avail);
        $('#c-availability').value = current.join(', ');
        b.classList.toggle('is-active');
      }));
    }

    function renderApps() {
      $('#my-apps').innerHTML = applications.length ? applications.map((a) => `<a class="my-app" href="/oferta/${a.jobId}">
        ${logoHtml(a.companyName, a.companyLogo, 'logo')}
        <div class="my-app-main"><strong>${esc(a.jobTitle)}</strong><span>${esc(a.companyName)} · ${esc(a.locality || '')}</span>
          <small>Postulación del ${fmtDate(a.createdAt)}</small></div>
        ${stagePill(a.stage)}
      </a>`).join('') : `<div class="empty"><h3>Todavía no te postulaste</h3><p>Explorá las búsquedas abiertas y postulate con tu perfil.</p><a class="btn btn-primary" href="/buscar" style="margin-top:14px">Buscar empleo</a></div>`;
    }

    function renderSaved() {
      $('#my-saved').innerHTML = saved.length ? saved.map((j) => `<div class="my-app">
        ${logoHtml(j.company_name, j.company_logo, 'logo')}
        <div class="my-app-main"><a href="/oferta/${j.id}"><strong>${esc(j.title)}</strong></a><span>${esc(j.company_name)} · ${esc(j.locality)}</span><small>${esc(j.salary || 'A convenir')}</small></div>
        <button class="icon-btn" type="button" data-unsave="${j.id}" title="Quitar">${icon('heart', 18)}</button>
      </div>`).join('') : `<div class="empty"><h3>No tenés ofertas guardadas</h3><p>Tocá el corazón en una oferta para guardarla.</p></div>`;
      $$('[data-unsave]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/candidate/saved/${b.dataset.unsave}`, { method: 'POST' }); saved = saved.filter((x) => x.id !== b.dataset.unsave); render(); }
        catch (err) { toast(err.message, 'err'); }
      }));
    }

    /* quitar la foto: dos toques (el primero pide confirmar) para no borrarla sin querer */
    $('#photo-remove')?.addEventListener('click', async () => {
      const b = $('#photo-remove');
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tocá de nuevo para quitarla'; setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = 'Quitar foto'; } }, 4000); return; }
      b.dataset.armed = ''; b.textContent = 'Quitar foto'; b.disabled = true;
      try {
        const r = await api('/api/candidate/profile', { method: 'PATCH', body: { removePhoto: true } });
        profile = r.candidate; W.state.user.candidate = profile; render(); toast('Foto quitada', 'ok');
      } catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; }
    });

    $('#photo-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const photo = await shrinkImage(file, 600, 0.88);
        const r = await api('/api/candidate/profile', { method: 'PATCH', body: { photo } });
        profile = r.candidate; W.state.user.candidate = profile; render(); toast('Foto actualizada', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    });

    $('#cv-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/\.pdf$/i.test(file.name)) { toast('El CV debe ser un PDF', 'err'); return; }
      if (file.size > 4 * 1024 * 1024) { toast('El PDF supera los 4 MB', 'err'); return; }
      try {
        const data = await W.fileToBase64(file);
        const r = await api('/api/candidate/profile', { method: 'PATCH', body: { cv: { name: file.name, data } } });
        profile = r.candidate; render(); toast('CV cargado', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    });

    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#profile-save');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await api('/api/candidate/profile', { method: 'PATCH', body: {
          name: $('#c-name').value.trim(), phone: $('#c-phone').value.trim(),
          locality: $('#c-locality').value, headline: $('#c-headline').value.trim(),
          about: $('#c-about').value.trim(), skills, experience: $('#c-experience').value.trim(),
          education: $('#c-education').value.trim(), availability: $('#c-availability').value.trim(),
          linkedin: $('#c-linkedin').value.trim(),
          openToWork: $('#c-open').checked, isPublic: $('#c-public').checked,
          categories: $$('[data-cat].is-active').map((b) => b.dataset.cat),
          salaryMin: Number(String($('#c-salary').value).replace(/\D/g, '')) || 0,
        } });
        profile = r.candidate; W.state.user.candidate = profile;
        render();
        showAlert($('#profile-alert'), 'Perfil guardado.', 'ok');
        setTimeout(() => hideAlert($('#profile-alert')), 2500);
      } catch (err) {
        showAlert($('#profile-alert'), err.message, 'error');
        setFieldErrors($('#profile-form'), err.fields);
      } finally { btn.disabled = false; btn.textContent = 'Guardar perfil'; }
    });

    await load();
  }

  /* ================================================================== */
  /* ADMIN                                                              */
  /* ================================================================== */
  let ADMIN_JOBS = [];
  async function initAdmin() {
    const user = W.state.user;
    if (!user || user.role !== 'admin') { $('#admin-gate').hidden = false; }
    else { $('#admin-gate').hidden = true; $('#admin-app').hidden = false; await adminData(); initImport(); }

    $('#admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert($('#admin-login-alert'));
      try {
        await api('/api/admin/login', { method: 'POST', body: { email: $('#ad-email').value.trim(), password: $('#ad-pass').value } });
        location.reload();
      } catch (err) { showAlert($('#admin-login-alert'), err.message, 'error'); }
    });
    $('#admin-logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
    $$('[data-close-edit]').forEach((b) => b.addEventListener('click', closeEdit));
    $('#edit-modal').addEventListener('click', (e) => { if (e.target.id === 'edit-modal') closeEdit(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#edit-modal').hidden) closeEdit(); });
    let adminPlacesReady = false;
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
      $$('.tab').forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      if ($('#adm-title') && tab.dataset.title) { $('#adm-title').textContent = tab.dataset.title; $('#adm-sub').textContent = tab.dataset.sub || ''; }
      if (matchMedia('(max-width: 960px)').matches) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
      if (tab.dataset.tab === 'guide' && !adminPlacesReady && window.WKGuia) { adminPlacesReady = true; window.WKGuia.initAdminPlaces($('#admin-places')); }
      if (tab.dataset.tab === 'services') adminServices();
      if (tab.dataset.tab === 'certs' && window.WKCert) window.WKCert.adminList($('#admin-certs'));
      if (tab.dataset.tab === 'vecinos') adminVecinos();
      if (tab.dataset.tab === 'home') adminInbox();
      if (tab.dataset.tab === 'people') adminPeople();
      if (tab.dataset.tab === 'payments') adminPayments();
      if (tab.dataset.tab === 'prospects') adminProspects();
      if (tab.dataset.tab === 'import') { try { history.replaceState(null, '', '#importar'); } catch (_) {} }
    }));
    $('#jobs-filter').addEventListener('change', () => adminJobs($('#jobs-filter').value));
    $$('[data-goto-tab]').forEach((b) => b.addEventListener('click', () => {
      const t = $(`.tab[data-tab="${b.dataset.gotoTab}"]`); if (!t) return;
      if (b.dataset.jobsFilter && $('#jobs-filter')) $('#jobs-filter').value = b.dataset.jobsFilter;
      t.click(); adminJobs($('#jobs-filter').value);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    if (!user || user.role !== 'admin') return;
    /* /admin#importar (el link del mail) abre directo la pestaña Importar */
    if (location.hash === '#importar') { const t = $('.tab[data-tab="import"]'); if (t) setTimeout(() => t.click(), 0); }

    /* Personas: filtros */
    W.loadMeta().then((m) => {
      $('#people-loc').innerHTML = '<option value="">Todo el Valle</option>' + m.localities.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    }).catch(() => {});
    let pTimer = 0;
    $('#people-q').addEventListener('input', () => { clearTimeout(pTimer); pTimer = setTimeout(adminPeople, 250); });
    $('#people-loc').addEventListener('change', adminPeople);
    $('#people-av').addEventListener('change', adminPeople);

    /* buscador: avisos, fichas y empresas; también llega con ?q= desde el botón "Abrir en el panel" */
    let qTimer = 0;
    const q = $('#adm-q');
    q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => adminSearch(q.value), 250); });
    const q0 = new URLSearchParams(location.search).get('q');
    if (q0) { q.value = q0; adminSearch(q0); }
    $('#inbox-seen').addEventListener('click', async () => {
      try { await api('/api/admin/inbox/seen', { method: 'POST', body: {} }); toast('Listo: lo nuevo quedó revisado', 'ok'); adminInbox(); } catch (err) { toast(err.message, 'err'); }
    });
    /* cambios hechos desde la hoja "Gestionar": se refresca lo que está a la vista */
    document.addEventListener('wk-admin-changed', () => {
      adminInbox();
      if (q.value.trim().length >= 2) adminSearch(q.value);
      refreshStats();
      if (!$('[data-panel="jobs"]').hidden) adminJobs($('#jobs-filter').value);
    });
    /* acciones rápidas de la bandeja y del buscador */
    $('[data-panel="home"]').addEventListener('click', async (e) => {
      if (e.target.closest('[data-goto-import]')) { const t = $('.tab[data-tab="import"]'); if (t) t.click(); return; }
      if (e.target.closest('[data-goto-vecinos]')) { const t = $('.tab[data-tab="vecinos"]'); if (t) t.click(); return; }
      const ap = e.target.closest('[data-quick-approve]');
      if (ap) {
        try { await api(`/api/admin/jobs/${encodeURIComponent(ap.dataset.quickApprove)}`, { method: 'PATCH', body: { status: 'approved' } }); toast('Aviso publicado', 'ok'); } catch (err) { toast(err.message, 'err'); }
        document.dispatchEvent(new CustomEvent('wk-admin-changed'));
      }
      const pa = e.target.closest('[data-quick-place]');
      if (pa) {
        try { await api(`/api/admin/places/${encodeURIComponent(pa.dataset.quickPlace)}`, { method: 'PATCH', body: { status: 'approved' } }); toast('Ficha publicada', 'ok'); } catch (err) { toast(err.message, 'err'); }
        document.dispatchEvent(new CustomEvent('wk-admin-changed'));
      }
      const fr = e.target.closest('[data-quick-feature]');
      if (fr) {
        try { await api(`/api/admin/jobs/${encodeURIComponent(fr.dataset.quickFeature)}`, { method: 'PATCH', body: { featuredDays: 7 } }); toast('Destacada por 7 días', 'ok'); } catch (err) { toast(err.message, 'err'); }
        document.dispatchEvent(new CustomEvent('wk-admin-changed'));
      }
      const co = e.target.closest('[data-goto-companies]');
      if (co) { const t = $('.tab[data-tab="companies"]'); if (t) t.click(); }
    });
  }

  /* ---------- Personas ---------- */
  let peopleSeq = 0;
  async function adminPeople() {
    const box = $('#admin-people');
    const qs = new URLSearchParams();
    if ($('#people-q').value.trim()) qs.set('q', $('#people-q').value.trim());
    if ($('#people-loc').value) qs.set('locality', $('#people-loc').value);
    if ($('#people-av').checked) qs.set('available', '1');
    const seq = ++peopleSeq;
    let d;
    try { d = await api(`/api/admin/candidates?${qs}`); } catch (err) { box.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; return; }
    if (seq !== peopleSeq) return;
    $('#people-sub').innerHTML = `<strong>${d.counts.available}</strong> disponible${d.counts.available === 1 ? '' : 's'} de <strong>${d.counts.total}</strong> persona${d.counts.total === 1 ? '' : 's'} registrada${d.counts.total === 1 ? '' : 's'}. Las disponibles marcaron "estoy buscando trabajo".`;
    const wa = (ph) => { const n = String(ph || '').replace(/\D/g, '').replace(/^0/, '').replace(/^54/, ''); return n.length >= 8 ? `https://wa.me/549${n.replace(/^9/, '')}` : ''; };
    box.innerHTML = d.people.length ? `<p class="cell-sub" style="margin:10px 0 4px">${d.people.length} resultado${d.people.length === 1 ? '' : 's'}${d.people.length >= 300 ? ' (se muestran los primeros 300)' : ''}</p>
      <ul class="adm-list people-list">${d.people.map((c) => `<li class="adm-item person-item">
        ${W.avatarHtml ? W.avatarHtml(c.name, c.photo) : ''}
        <div class="adm-item-main">
          <div class="cell-title">${esc(c.name)} ${c.openToWork ? '<span class="badge badge-green">Disponible</span>' : '<span class="badge">No busca ahora</span>'}</div>
          <div class="cell-sub">${esc(c.headline || 'Sin titular')} · ${esc(c.locality || 'Sin localidad')} · ${c.applications} postulación${c.applications === 1 ? '' : 'es'} · se sumó ${timeAgo(c.createdAt).toLowerCase()}</div>
          ${c.skills.length ? `<div class="person-skills">${c.skills.slice(0, 6).map((s) => `<span class="badge">${esc(s)}</span>`).join('')}</div>` : ''}
          <div class="cell-sub">${esc(c.email)}${c.phone ? ` · ${esc(c.phone)}` : ''}${c.availability ? ` · ${esc(c.availability)}` : ''}</div>
        </div>
        <div class="row-actions">
          ${wa(c.phone) ? `<a class="btn btn-wa btn-sm" href="${esc(wa(c.phone))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${c.cvUrl ? `<a class="btn btn-outline btn-sm" href="${esc(c.cvUrl)}" target="_blank" rel="noopener">Ver CV</a>` : ''}
          ${c.publicUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(c.publicUrl)}" target="_blank" rel="noopener">Perfil público</a>` : ''}
        </div></li>`).join('')}</ul>`
      : '<div class="list-empty">No hay personas con esos filtros.</div>';
  }

  /* ---------- Pagos ---------- */
  const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  const PAY_STATUS = {
    approved: ['badge-green', 'Aprobado'], created: ['', 'Sin pagar'], pending: ['badge-amber', 'Pendiente'], in_process: ['badge-amber', 'En revisión'],
    rejected: ['badge-red', 'Rechazado'], cancelled: ['', 'Cancelado'], refunded: ['', 'Devuelto'], charged_back: ['badge-red', 'Contracargo'],
    monto_incorrecto: ['badge-red', 'Monto incorrecto'], error: ['badge-red', 'Error al abrir'],
  };
  async function adminPayments() {
    const box = $('#admin-payments');
    let d;
    try { d = await api('/api/admin/payments'); } catch (err) { box.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; return; }
    const missing = [];
    if (!d.mp.connected) missing.push('cargar la clave de Mercado Pago en el servidor (<code>WORKUCO_MP_TOKEN</code> en <code>/etc/workuco.env</code>)');
    if (!d.mp.publicUrl) missing.push('que la dirección del sitio (<code>PUBLIC_URL</code>) sea pública y con https, p. ej. <code>https://workuco.com.ar</code>');
    if (!Object.keys(d.settings.prices).length) missing.push('poner al menos un precio');
    if (!d.settings.charge) missing.push('activar "Cobrar los destacados"');
    box.innerHTML = `<div class="pay-status ${d.enabled ? 'is-on' : ''}">
        <strong>${d.enabled ? `${icon('check', 16)} El cobro está activo: las empresas pagan con Mercado Pago y el aviso se destaca solo.` : 'El cobro todavía no está activo.'}</strong>
        ${missing.length ? `<p>Falta: ${missing.join(' · ')}.</p>` : ''}
        <p>Mercado Pago: ${d.mp.connected ? '<span class="badge badge-green">Conectado</span>' : '<span class="badge badge-amber">Sin conectar</span>'}
          · Firma de los avisos: ${d.mp.webhookSecret ? '<span class="badge badge-green">Verificada</span>' : '<span class="badge badge-amber">Sin clave secreta</span> (recomendado: <code>WORKUCO_MP_WEBHOOK_SECRET</code>)'}</p>
      </div>
      <form id="pay-form" class="pay-form">
        <label class="switch-row"><input type="checkbox" id="pay-charge" ${d.settings.charge ? 'checked' : ''}><span class="switch" aria-hidden="true"></span>
          <span><strong>Cobrar los destacados</strong><small>Apagado: las empresas sólo "piden" el destacado y vos lo activás a mano (como en el lanzamiento).</small></span></label>
        <div class="pay-prices">${d.featuredDays.map((n) => `<label class="field"><span>${n} días</span>
          <span class="pay-input"><span>$</span><input class="input" type="number" min="0" step="100" inputmode="numeric" data-price="${n}" value="${d.settings.prices[n] || ''}" placeholder="Sin vender"></span></label>`).join('')}</div>
        <div class="pay-cv">
          <label class="switch-row"><input type="checkbox" id="pay-sellcv" ${d.settings.sellCv ? 'checked' : ''}><span class="switch" aria-hidden="true"></span>
            <span><strong>Vender CV Pro</strong><small>${d.cvPro && d.cvPro.ai ? 'Las personas pagan el CV hecho con IA. El análisis y la vista previa siempre son gratis.' : 'Falta la IA del servidor (<code>WORKUCO_IMPORT_AI_PROVIDER</code> y <code>_KEY</code>): sin ella el CV Pro no se ofrece.'}</small></span></label>
          <label class="field"><span>Precio del CV Pro</span>
            <span class="pay-input"><span>$</span><input class="input" type="number" min="100" step="100" inputmode="numeric" id="pay-cvprice" value="${d.settings.cvPrice || 5000}"></span></label>
        </div>
        <div class="pay-cv">
          <label class="switch-row"><input type="checkbox" id="pay-sellcosecha" ${d.settings.sellCosecha ? 'checked' : ''}><span class="switch" aria-hidden="true"></span>
            <span><strong>Vender Pack Cosecha</strong><small>30 días: hasta 5 avisos de cosecha destacados, 100 invitaciones por día y sello "Cosecha". Apagado: las empresas lo piden y vos lo activás en Empresas.</small></span></label>
          <label class="field"><span>Precio del Pack Cosecha</span>
            <span class="pay-input"><span>$</span><input class="input" type="number" min="0" step="100" inputmode="numeric" id="pay-cosechaprice" value="${d.settings.cosechaPrice || ''}" placeholder="Sin vender"></span></label>
        </div>
        <div class="pay-cv">
          <p><strong>Avisar al celular</strong><br><small>La empresa manda su aviso, una vez, al celular de la gente de la zona que activó los avisos de empleo. Gratis durante el lanzamiento; después se cobra junto con los destacados.</small></p>
          <label class="field"><span>Precio por envío</span>
            <span class="pay-input"><span>$</span><input class="input" type="number" min="100" step="100" inputmode="numeric" id="pay-pushprice" value="${d.settings.pushPrice || 3500}"></span></label>
        </div>
        <button class="btn btn-primary" type="submit">Guardar</button>
      </form>
      <h3 class="pay-h">Cobrado: ${money(d.totals.approved)} <small>(${d.totals.count} pago${d.totals.count === 1 ? '' : 's'} aprobado${d.totals.count === 1 ? '' : 's'})</small></h3>
      ${d.payments.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Fecha</th><th>Qué</th><th>Quién</th><th>Monto</th><th>Estado</th><th>N° de Mercado Pago</th></tr></thead><tbody>
        ${d.payments.map((x) => { const st = PAY_STATUS[x.status] || ['', x.status]; return `<tr>
          <td class="cell-sub">${fmtDate(x.paidAt || x.createdAt)}</td>
          <td>${x.kind === 'cv' ? '<span class="badge">CV Pro</span>' : x.kind === 'cosecha' ? `<span class="badge">Pack Cosecha ${x.days} días</span>` : `<span class="badge">Destacado ${x.days} días</span><div class="cell-sub">${esc(x.jobTitle || '')}</div>`}</td>
          <td><div class="cell-title">${esc(x.companyName || (x.kind === 'cv' ? 'Cuenta borrada' : ''))}</div></td>
          <td>${money(x.amount)}</td>
          <td><span class="badge ${st[0]}">${esc(st[1])}</span></td>
          <td class="cell-sub">${esc(x.mpPaymentId || '—')}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="list-empty">Todavía no hay pagos.</div>'}`;
    $('#pay-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const prices = {};
      $$('[data-price]', box).forEach((i) => { prices[i.dataset.price] = i.value === '' ? 0 : Number(i.value); });
      try {
        await api('/api/admin/payments/settings', { method: 'PUT', body: {
          charge: $('#pay-charge').checked, prices, sellCv: $('#pay-sellcv').checked, cvPrice: Number($('#pay-cvprice').value) || 0,
          sellCosecha: $('#pay-sellcosecha').checked, cosechaPrice: Number($('#pay-cosechaprice').value) || 0,
          pushPrice: Number($('#pay-pushprice').value) || 0,
        } });
        toast('Guardado', 'ok');
        adminPayments();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ---------- Inicio: bandeja "para revisar" y buscador ---------- */
  const gestionar = (attr) => `<button class="btn btn-outline btn-sm" type="button" ${attr}>${icon('settings', 14)} Gestionar</button>`;
  const placeOwner = (p) => (p.owner ? `${esc(p.owner.name)}${p.owner.email ? ` · ${esc(p.owner.email)}` : ''}` : 'cargada por la administración');
  const placeStatus = (s) => ({ approved: '<span class="badge badge-green">Publicada</span>', pending: '<span class="badge badge-amber">Pendiente</span>', rejected: '<span class="badge badge-red">Rechazada</span>', hidden: '<span class="badge">Oculta</span>' }[s] || '');
  const jobLine = (j, extra = '') => `<li class="adm-item">
      <div class="adm-item-main"><a class="cell-title" href="/oferta/${esc(j.id)}">${esc(j.title)}</a>
        <div class="cell-sub">${esc(j.companyName)} · ${esc(j.locality)} · ${timeAgo(j.createdAt)} ${W.statusBadge(j.status)}</div></div>
      <div class="row-actions">${extra}${gestionar(`data-adm-job="${esc(j.id)}"`)}</div></li>`;
  const placeLine = (p) => `<li class="adm-item">
      <div class="adm-item-main"><a class="cell-title" href="/guia/${esc(p.slug)}">${esc(p.name)}</a>
        <div class="cell-sub">${esc(p.category)} · ${esc((p.localities || []).join(', '))} · ${placeOwner(p)} ${placeStatus(p.status)}</div></div>
      <div class="row-actions">${p.status === 'pending' ? `<button class="btn btn-primary btn-sm" type="button" data-quick-place="${esc(p.id)}">Aprobar</button>` : ''}${gestionar(`data-adm-place="${esc(p.slug)}"`)}</div></li>`;
  const companyLine = (c) => `<li class="adm-item">
      <div class="adm-item-main"><span class="cell-title">${esc(c.name)}${c.verified ? ' ✓' : ''}</span>
        <div class="cell-sub">${esc(c.email || '')}${c.phone ? ` · ${esc(c.phone)}` : ''} · ${timeAgo(c.createdAt)}</div></div>
      <div class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-goto-companies>Ver en Empresas</button></div></li>`;
  const group = (title, items, line, hint = '') => (items.length ? `<div class="adm-group"><h3>${title} <span class="tab-count">${items.length}</span></h3>${hint ? `<p class="cell-sub">${hint}</p>` : ''}<ul class="adm-list">${items.map(line).join('')}</ul></div>` : '');

  function paintCounts(counts) {
    $$('[data-count]').forEach((el) => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = n; el.hidden = !n;
    });
  }
  async function refreshStats() {
    try {
      const { stats } = await api('/api/admin/stats');
      $('#s-published').textContent = stats.published;
      $('#s-pending').textContent = stats.pending; $('#s-pending').closest('.adm-stat')?.classList.toggle('is-zero', !Number(stats.pending));
      $('#s-apps').textContent = stats.applications;
      $('#s-companies').textContent = stats.companies;
      if ($('#s-candidates')) $('#s-candidates').textContent = stats.candidates;
    } catch (_) {}
  }
  async function adminInbox() {
    const box = $('#admin-inbox');
    if (!box) return;
    let d;
    try { d = await api('/api/admin/inbox'); } catch (err) { box.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; return; }
    paintCounts(d.counts);
    box.innerHTML = d.counts.total ? [
      group('Avisos esperando aprobación', d.jobs, (j) => jobLine(j, `<button class="btn btn-primary btn-sm" type="button" data-quick-approve="${esc(j.id)}">Aprobar</button>`)),
      group('Pedidos de vecinos', d.requests || [], (r) => `<li class="adm-item">
        <div class="adm-item-main"><span class="cell-title">${esc(r.title)}</span>
          <div class="cell-sub">${esc(r.ownerName)} · ${esc(r.locality)} · ${timeAgo(r.createdAt)}</div></div>
        <div class="row-actions"><button class="btn btn-primary btn-sm" type="button" data-goto-vecinos>Revisar</button></div></li>`, 'Pedidos de particulares (cortar el pasto, ordenar el patio...). No se ven hasta que los apruebes.'),
      group('Fichas de la Guía', d.places, placeLine, 'Las pendientes no se ven en la página hasta que las apruebes. Las publicadas son nuevas de usuarios: revisalas y, si no corresponden, ocultalas o eliminalas.'),
      group('Pedidos de destacado', d.featureRequests, (j) => jobLine(j, `<button class="btn btn-primary btn-sm" type="button" data-quick-feature="${esc(j.id)}">Destacar 7 días</button>`)),
      group('Empresas nuevas', d.companies, companyLine),
      group('Gran oportunidad para avisar', d.opportunities || [], (c) => `<li class="adm-item">
        <div class="adm-item-main"><span class="cell-title">${esc(c.name)}</span>
          <div class="cell-sub">${esc(c.jobs.join(', '))} · <span class="badge badge-opp">${c.applications} postulantes</span> y todavía no reclamó su aviso</div></div>
        <div class="row-actions"><button class="btn btn-primary btn-sm" type="button" data-goto-import>Avisar</button></div></li>`, 'Avisos importados que ya juntaron 10 o más postulantes: escribile a la empresa con el mensaje de gran oportunidad.'),
      group('Se borran pronto', d.expiringSoon || [], (c) => `<li class="adm-item">
        <div class="adm-item-main"><span class="cell-title">${esc(c.name)}</span>
          <div class="cell-sub">${esc(c.jobs.join(', '))} · se borra solo el ${new Date(c.expiresAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} · ${c.applications} postulante${c.applications === 1 ? '' : 's'}</div></div>
        <div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-goto-import>Ver</button></div></li>`, 'Avisos importados sin reclamar que vencen en los próximos 2 días: última oportunidad para escribirle a la empresa.'),
      group('Respuestas de empresas', d.importResponses || [], (r) => `<li class="adm-item">
        <div class="adm-item-main"><span class="cell-title">${esc(r.name)} ${r.action === 'aceptada' ? 'aceptó su aviso' : r.action === 'vencida' ? 'no respondió: su aviso se borró solo' : 'borró su aviso'}</span>
          <div class="cell-sub">${esc(r.jobs.join(', ') || 'sin avisos')} · ${timeAgo(r.createdAt)} ${r.action === 'aceptada' ? '<span class="badge badge-green">Aceptada</span>' : r.action === 'vencida' ? '<span class="badge">Vencida</span>' : `<span class="badge badge-red">${esc(r.reasonLabel)}</span>`}</div>
          ${r.comment ? `<div class="imp-comment">"${esc(r.comment)}"</div>` : ''}</div>
        <div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-goto-import>Ver en Importar</button></div></li>`),
    ].join('') : `<div class="list-empty">${icon('check', 18)} Todo al día: no hay nada nuevo para revisar.</div>`;
  }
  let searchSeq = 0;
  async function adminSearch(text) {
    const box = $('#adm-search-results');
    const t = String(text || '').trim();
    if (t.length < 2) { box.innerHTML = ''; return; }
    const seq = ++searchSeq;
    let d;
    try { d = await api(`/api/admin/search?q=${encodeURIComponent(t)}`); } catch (err) { box.innerHTML = `<p class="cell-sub">${esc(err.message)}</p>`; return; }
    if (seq !== searchSeq) return;
    const total = d.jobs.length + d.places.length + d.companies.length;
    box.innerHTML = total ? [
      group('Avisos', d.jobs, (j) => jobLine(j)),
      group('Fichas de la Guía', d.places, placeLine),
      group('Empresas', d.companies, companyLine),
    ].join('') : `<p class="cell-sub" style="margin-top:12px">No encontramos nada con "${esc(t)}".</p>`;
  }

  /* Changas de vecinos: revisión de pedidos de particulares */
  let vecFilter = 'pending';
  let vecReady = false;
  async function adminVecinos() {
    const box = $('#admin-vecinos');
    if (!box) return;
    if (!vecReady) {
      vecReady = true;
      $$('[data-vec-admin]').forEach((b) => b.addEventListener('click', () => {
        $$('[data-vec-admin]').forEach((x) => x.classList.toggle('is-on', x === b)); vecFilter = b.dataset.vecAdmin; adminVecinos();
      }));
      box.addEventListener('click', async (e) => {
        const ap = e.target.closest('[data-vec-approve]'); const rj = e.target.closest('[data-vec-reject]'); const dl = e.target.closest('[data-vec-del]');
        try {
          if (ap) { await api(`/api/admin/vecinos/${ap.dataset.vecApprove}/aprobar`, { method: 'POST' }); toast('Pedido publicado', 'ok'); }
          else if (rj) {
            const why = $(`[data-vec-why="${rj.dataset.vecReject}"]`);
            await api(`/api/admin/vecinos/${rj.dataset.vecReject}/rechazar`, { method: 'POST', body: { reason: why ? why.value : '' } });
            toast('Pedido rechazado: le avisamos a la persona', 'ok');
          } else if (dl) {
            if (dl.dataset.armed !== '1') { dl.dataset.armed = '1'; dl.textContent = 'Tocá de nuevo'; return; }
            await api(`/api/vecinos/${dl.dataset.vecDel}`, { method: 'DELETE' }); toast('Pedido borrado', 'ok');
          } else return;
        } catch (err) { toast(err.message, 'err'); }
        document.dispatchEvent(new CustomEvent('wk-admin-changed'));
        adminVecinos();
      });
    }
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    const LABEL = { pending: 'Para revisar', approved: 'Publicado', rejected: 'Rechazado', resolved: 'Resuelto', expired: 'Vencido' };
    try {
      const { requests } = await api(`/api/admin/vecinos${vecFilter ? `?status=${vecFilter}` : ''}`);
      box.innerHTML = requests.length ? `<ul class="adm-list">${requests.map((r) => `<li class="adm-item">
        <div class="adm-item-main"><span class="cell-title"><a href="/vecinos/${esc(r.id)}" target="_blank" rel="noopener">${esc(r.title)}</a></span>
          <div class="cell-sub">${esc(r.categoryLabel)} · ${esc(r.area ? `${r.area}, ${r.locality}` : r.locality)} · ${esc(r.payLabel)} · ${esc(r.whenNote || r.whenDate || 'A coordinar')}</div>
          <div class="cell-sub">${esc(r.ownerName)} (${esc(r.ownerEmail)}) · ${timeAgo(r.createdAt)} · <span class="badge">${esc(LABEL[r.status] || r.status)}</span> · ${r.interestCount} interesado${r.interestCount === 1 ? '' : 's'}</div>
          ${r.description ? `<div class="imp-comment">${esc(r.description)}</div>` : ''}
          ${(r.warnings || []).length ? `<div class="cell-sub" style="color:var(--red)">Ojo: ${esc(r.warnings.join(' · '))}</div>` : ''}
          ${r.status === 'pending' ? `<input class="input input-sm" data-vec-why="${esc(r.id)}" maxlength="200" placeholder="Motivo si lo rechazás (le llega a la persona)" style="margin-top:8px">` : ''}</div>
        <div class="row-actions">
          ${r.status === 'pending' || r.status === 'rejected' ? `<button class="btn btn-primary btn-sm" type="button" data-vec-approve="${esc(r.id)}">Aprobar</button>` : ''}
          ${r.status === 'pending' ? `<button class="btn btn-outline btn-sm" type="button" data-vec-reject="${esc(r.id)}">Rechazar</button>` : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-vec-del="${esc(r.id)}">Borrar</button>
        </div></li>`).join('')}</ul>`
        : `<div class="list-empty">${vecFilter === 'pending' ? 'No hay pedidos para revisar.' : 'No hay pedidos.'}</div>`;
    } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  }

  /* empresas que pidieron servicios (Soluciones) y aceptaron que las contacten */
  async function adminServices() {
    const box = $('#admin-services');
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const { services, interested } = await api('/api/admin/services');
      const label = (id) => (services.find((s) => s.id === id) || { label: id }).label;
      box.innerHTML = interested.length ? `<p class="muted">${interested.length} empresa${interested.length === 1 ? '' : 's'} ${interested.length === 1 ? 'pidió' : 'pidieron'} que la contactes.</p>
        <div class="table-wrap"><table class="data">
        <thead><tr><th>Empresa</th><th>Contacto</th><th>Le interesa</th><th>Tamaño y web</th><th>Lo que contó</th><th>Desde</th></tr></thead>
        <tbody>${interested.map((c) => `<tr>
          <td><div class="cell-title">${esc(c.name)}</div><div class="cell-sub">${esc(c.locality || 'Sin localidad')}</div></td>
          <td class="cell-sub"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br>${esc(c.phone)}</td>
          <td>${c.services.map((id) => `<span class="badge">${esc(label(id))}</span>`).join(' ')}</td>
          <td class="cell-sub">${esc(c.employees || 'Sin dato')}<br>${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">Tiene web</a>` : 'Sin web'}</td>
          <td class="cell-sub">${esc(c.note || '—')}</td>
          <td class="cell-sub">${timeAgo(c.at)}</td>
        </tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Todavía ninguna empresa pidió servicios. Cuando una marque "Me interesa" en su panel (Soluciones) y acepte que la contacten, aparece acá.</p>';
    } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  }

  /* ================================================================== */
  /* ADMIN · IMPORTAR AVISOS                                            */
  /* ================================================================== */
  async function initImport() {
    if (!$('[data-panel="import"]')) return;
    const meta = await W.loadMeta();
    let drafts = [];
    let images = [];
    const SOURCE_KEY = 'wk_import_source';
    try { $('#imp-source').value = localStorage.getItem(SOURCE_KEY) || ''; } catch (_) {}
    $('#imp-source').addEventListener('change', () => { try { localStorage.setItem(SOURCE_KEY, $('#imp-source').value.trim()); } catch (_) {} });
    $('#imp-text').addEventListener('input', () => { $('#imp-count').textContent = `${$('#imp-text').value.length.toLocaleString('es-AR')} / 20.000`; });

    try {
      const cfg = await api('/api/admin/import/config');
      const NAMES = { anthropic: 'Claude', gemini: 'Gemini', openai: 'OpenAI', custom: 'otra IA', prueba: 'IA de prueba' };
      $('#imp-ai-note').innerHTML = cfg.aiReady
        ? `<p class="muted imp-ai-status">${icon('sparkles', 14)} Lee: <strong>${esc(NAMES[cfg.provider] || cfg.provider)}</strong>${cfg.model ? ` (${esc(cfg.model)})` : ''}${cfg.verifier ? ` · verifica: <strong>${esc(NAMES[cfg.verifier.provider] || cfg.verifier.provider)}</strong>. Lo que las dos lean distinto queda marcado para revisar.` : '. Podés sumar una segunda IA que verifique con <code>WORKUCO_IMPORT_AI2_PROVIDER</code> y <code>WORKUCO_IMPORT_AI2_KEY</code>.'}</p>`
        : `<div class="alert alert-info">La IA del importador no está configurada: podés cargar los avisos a mano. Para leer texto e imágenes automáticamente, configurá <code>WORKUCO_IMPORT_AI_PROVIDER</code> y <code>WORKUCO_IMPORT_AI_KEY</code> en el servidor (y, para que una segunda IA verifique, <code>WORKUCO_IMPORT_AI2_PROVIDER</code> y <code>WORKUCO_IMPORT_AI2_KEY</code>).</div>`;
    } catch (_) {}

    const renderThumbs = () => {
      $('#imp-thumbs').innerHTML = images.map((img, i) => `<span class="imp-thumb"><img src="${esc(img.dataUrl)}" alt="Captura ${i + 1}"><button type="button" data-rm-img="${i}" aria-label="Quitar captura ${i + 1}">${icon('x', 12)}</button></span>`).join('');
      $$('[data-rm-img]').forEach((b) => b.addEventListener('click', () => { images.splice(Number(b.dataset.rmImg), 1); renderThumbs(); }));
    };
    $('#imp-images').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        if (images.length >= 6) { toast('Hasta 6 imágenes por vez', 'err'); break; }
        try { images.push({ dataUrl: await shrinkImage(f, 1600, 0.85) }); } catch (_) { toast(`No pudimos leer ${f.name}`, 'err'); }
      }
      e.target.value = '';
      renderThumbs();
    });

    const opts = (list, val) => list.map((x) => `<option${x === val ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const empty = () => ({ title: '', companyName: '', locality: '', category: 'Otros', type: 'Tiempo completo', modality: 'Presencial', description: '', requirements: '', salaryMin: 0, salaryMax: 0, salaryPeriod: 'mes', gig: false, startDate: '', duration: '', positions: 1, contactPhone: '', contactEmail: '', skills: [], warnings: [] });

    function renderDrafts() {
      $('#imp-drafts').innerHTML = drafts.map((d, i) => `<article class="card imp-draft" data-draft="${i}">
        <div class="imp-draft-head">${d.imageIndex >= 0 && images[d.imageIndex] ? `<img class="imp-draft-flyer" src="${esc(images[d.imageIndex].dataUrl)}" alt="Flyer del borrador ${i + 1}">` : ''}<h3>Borrador ${i + 1}${d.title ? `: ${esc(d.title)}` : ''}</h3>
          ${d.checked === 'ok' ? `<span class="badge badge-ok">${icon('check', 12)} Las dos IA coinciden</span>` : ''}
          ${(d.warnings || []).map((w) => `<span class="badge badge-amber">${esc(w)}</span>`).join('')}</div>
        <div class="form-grid">
          <div class="field"><label>Puesto</label><input class="input" data-f="title" value="${esc(d.title)}" maxlength="120"><span class="error-text" data-error="title" hidden></span></div>
          <div class="field"><label>Empresa</label><input class="input" data-f="companyName" value="${esc(d.companyName)}" maxlength="120"><span class="error-text" data-error="companyName" hidden></span></div>
          <div class="field"><label>Localidad</label><select class="input" data-f="locality"><option value="">Elegí…</option>${opts(meta.localities, d.locality)}</select><span class="error-text" data-error="locality" hidden></span></div>
          <div class="field"><label>Rubro</label><select class="input" data-f="category">${opts(meta.categories, d.category)}</select></div>
          <div class="field"><label>Tipo</label><select class="input" data-f="type">${opts(meta.types, d.type)}</select></div>
          <div class="field"><label>Modalidad</label><select class="input" data-f="modality">${opts(meta.modalities, d.modality)}</select></div>
          <div class="field span-2"><label>Descripción</label><textarea class="input" data-f="description" rows="4" maxlength="8000">${esc(d.description)}</textarea><span class="error-text" data-error="description" hidden></span></div>
          <div class="field"><label>Sueldo desde</label><input class="input" data-f="salaryMin" inputmode="numeric" value="${d.salaryMin || ''}"></div>
          <div class="field"><label>Hasta / por</label><div class="imp-inline"><input class="input" data-f="salaryMax" inputmode="numeric" value="${d.salaryMax || ''}"><select class="input" data-f="salaryPeriod">${opts(meta.salaryPeriods || ['mes', 'día', 'hora'], d.salaryPeriod)}</select></div></div>
          <div class="field"><label>Teléfono de contacto</label><input class="input" data-f="contactPhone" value="${esc(d.contactPhone)}" maxlength="60"></div>
          <div class="field"><label>Email de contacto</label><input class="input" data-f="contactEmail" value="${esc(d.contactEmail)}" maxlength="160"></div>
          <div class="field"><label class="imp-check"><input type="checkbox" data-f="gig"${d.gig ? ' checked' : ''}> Es una changa</label></div>
          <div class="field"><label>Empieza / dura</label><div class="imp-inline"><input class="input" type="date" data-f="startDate" value="${esc(d.startDate)}"><input class="input" data-f="duration" value="${esc(d.duration)}" placeholder="3 semanas" maxlength="60"></div></div>
        </div>
        <div class="imp-draft-foot">
          <button class="btn btn-ghost btn-sm" type="button" data-discard="${i}">Descartar</button>
          <button class="btn btn-primary btn-sm" type="button" data-publish="${i}">Publicar</button>
        </div>
      </article>`).join('');
      $$('[data-discard]').forEach((b) => b.addEventListener('click', () => { drafts.splice(Number(b.dataset.discard), 1); renderDrafts(); }));
      $$('[data-publish]').forEach((b) => b.addEventListener('click', () => publish(Number(b.dataset.publish), b)));
    }

    function readDraft(i) {
      const card = $(`[data-draft="${i}"]`);
      const d = { ...drafts[i] };
      $$('[data-f]', card).forEach((el) => {
        const k = el.dataset.f;
        d[k] = el.type === 'checkbox' ? el.checked : (['salaryMin', 'salaryMax'].includes(k) ? Number(String(el.value).replace(/\D/g, '')) || 0 : el.value.trim());
      });
      return d;
    }

    async function publish(i, btn, force = false) {
      const card = $(`[data-draft="${i}"]`);
      const draft = readDraft(i);
      setFieldErrors(card, null);
      btn.disabled = true;
      try {
        const flyer = draft.imageIndex >= 0 && images[draft.imageIndex] ? images[draft.imageIndex].dataUrl : undefined;
        await api('/api/admin/import/publish', { method: 'POST', body: { draft, sourceName: $('#imp-source').value.trim(), sourceText: $('#imp-text').value, force, flyer } });
        toast(`Publicado: ${draft.title}`, 'ok');
        drafts.splice(i, 1);
        renderDrafts();
        loadList();
        /* sin borradores pendientes: limpiar para no volver a leer lo mismo */
        if (!drafts.length) { $('#imp-text').value = ''; $('#imp-count').textContent = '0 / 20.000'; images = []; renderThumbs(); }
      } catch (err) {
        btn.disabled = false;
        if (err.status === 409 && /igual/.test(err.message)) {
          if (confirm(`${err.message}. ¿Publicar igual?`)) publish(i, btn, true);
        } else {
          toast(err.message, 'err');
          if (err.fields) setFieldErrors(card, err.fields);
        }
      }
    }

    $('#imp-read').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = $('#imp-text').value;
      if (!text.trim() && !images.length) { toast('Pegá mensajes o subí capturas', 'err'); return; }
      btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = `${icon('sparkles', 16)} Leyendo…`;
      try {
        const body = { text, images: images.map((x) => ({ mime: 'image/jpeg', base64: x.dataUrl.split(',')[1] })) };
        const r = await api('/api/admin/import/parse', { method: 'POST', body });
        drafts = drafts.concat(r.drafts);
        renderDrafts();
        toast(r.drafts.length ? `Encontramos ${r.drafts.length} aviso${r.drafts.length === 1 ? '' : 's'}: revisalos antes de publicar` : 'No encontramos avisos en ese texto', r.drafts.length ? 'ok' : 'err');
      } catch (err) { toast(err.message, 'err'); }
      finally { btn.disabled = false; btn.innerHTML = old; }
    });
    $('#imp-manual').addEventListener('click', () => { drafts.push(empty()); renderDrafts(); });

    /* filtros: para avisar → avisadas → aceptadas / rechazadas (se recuerda el último elegido) */
    const FILTERS = [['avisar', 'Para avisar'], ['avisadas', 'Avisadas'], ['aceptadas', 'Aceptadas'], ['rechazadas', 'Rechazadas'], ['vencidas', 'Vencidas']];
    let impFilter = 'avisar';
    try { impFilter = localStorage.getItem('wk_imp_filter') || 'avisar'; } catch (_) {}
    const dm = (ts) => (ts ? new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');
    async function loadList() {
      try {
        const { companies, removed, responses, settings = {} } = await api('/api/admin/import');
        /* una "gran oportunidad" sin avisar vuelve a "Para avisar" y va primero */
        const toNotify = (c) => !c.claimed && (c.notifyStatus !== 'avisado' || (c.opportunity && !c.opportunityNotifiedAt));
        const groups = {
          avisar: companies.filter(toNotify).sort((a, b) => Number(b.opportunity) - Number(a.opportunity) || (a.expiresAt || 0) - (b.expiresAt || 0)),
          avisadas: companies.filter((c) => !c.claimed && !toNotify(c)),
          aceptadas: companies.filter((c) => c.claimed),
          rechazadas: (responses || []).filter((r) => r.action === 'rechazada'),
          vencidas: (responses || []).filter((r) => r.action === 'vencida'),
        };
        if (!groups[impFilter]) impFilter = 'avisar';
        const ttlBox = `<form class="imp-ttl" data-imp-ttl><label for="imp-ttl">Los avisos sin reclamar se borran solos a los</label>
          <input class="input" id="imp-ttl" type="number" min="7" max="30" step="1" value="${settings.ttlDays || 14}"><span>días</span>
          <button class="btn btn-outline btn-sm" type="submit">Guardar</button></form>`;
        const chips = ttlBox + `<div class="imp-filters" role="tablist" aria-label="Filtrar fichas importadas">${FILTERS.map(([id, label]) =>
          `<button type="button" role="tab" class="chip-filter${id === impFilter ? ' is-on' : ''}" aria-selected="${id === impFilter}" data-imp-filter="${id}">${label} <span class="tab-count">${groups[id].length}</span></button>`).join('')}</div>`;
        const actions = (c) => (c.claimed ? '' : `<button class="btn btn-lime btn-sm" type="button" data-msg-open="${esc(c.id)}" aria-expanded="false">${icon('sparkles', 15)} Mensaje</button>
                ${c.waUrl ? `<a class="btn btn-primary btn-sm" href="${esc(c.waUrl)}" target="_blank" rel="noopener" data-notify="${esc(c.id)}"${c.opportunity ? ' data-notify-kind="oportunidad"' : ''}>${icon('whatsapp', 15)} WhatsApp</a>` : ''}
                ${c.gmailUrl ? `<a class="btn btn-gmail btn-sm" href="${esc(c.gmailUrl)}" target="_blank" rel="noopener" data-notify="${esc(c.id)}"${c.opportunity ? ' data-notify-kind="oportunidad"' : ''}>${icon('mail', 15)} Avisar por Gmail</a>
                <button class="btn btn-ghost btn-sm" type="button" data-copy-mail="${esc(c.email)}">${icon('copy', 15)} Copiar mail</button>` : ''}
                <button class="btn btn-outline btn-sm" type="button" data-copy="${esc(c.claimUrl)}">${icon('copy', 15)} Copiar link</button>
                ${c.notifyStatus !== 'avisado' ? `<button class="btn btn-outline btn-sm" type="button" data-mark="${esc(c.id)}">${icon('check', 15)} Marcar avisado</button>` : ''}
                <button class="btn btn-ghost btn-sm" type="button" data-del-co="${esc(c.id)}" data-name="${esc(c.name)}">${icon('trash', 15)} Borrar</button>`);
        const extra = (c) => (c.claimed ? '' : `${c.opportunity ? `<div><span class="badge badge-opp">${icon('star', 12)} ${c.applications} postulantes · gran oportunidad</span></div>` : ''}${c.expiresAt ? `<div class="cell-sub">Se borra el ${dm(c.expiresAt)}</div>` : ''}`);
        const state = (c) => (c.claimed ? `<span class="badge badge-green">Aceptó${c.claimedAt ? ` el ${dm(c.claimedAt)}` : ''}</span>`
          : c.notifyStatus === 'avisado' ? `<span class="badge">Avisada${c.notifiedAt ? ` el ${dm(c.notifiedAt)}` : ''}</span>${c.opportunity && !c.opportunityNotifiedAt ? '' : '<div class="cell-sub">Esperando respuesta</div>'}${extra(c)}`
            : `<span class="badge badge-amber">Sin avisar</span>${extra(c)}`);
        const list = groups[impFilter];
        const empty = { avisar: 'No hay empresas para avisar: todas están avisadas o ya respondieron.', avisadas: 'No hay empresas avisadas esperando respuesta.', aceptadas: 'Todavía ninguna empresa aceptó su aviso.', rechazadas: 'Ninguna empresa borró su aviso.', vencidas: 'Todavía no se borró solo ningún aviso.' }[impFilter];
        const table = !list.length ? `<p class="muted">${empty}</p>`
          : impFilter === 'rechazadas' || impFilter === 'vencidas'
            ? `<div class="table-wrap"><table class="data"><thead><tr><th>Empresa</th><th>Avisos</th><th>Motivo</th><th>Cuándo</th></tr></thead><tbody>
              ${list.map((r) => `<tr>
                <td><strong>${esc(r.name)}</strong><div class="cell-sub">${r.notified ? `Avisada el ${dm(r.notifiedAt)}` : 'Borró sin que le avisemos'}</div></td>
                <td>${r.jobs.map((t) => `<div>${esc(t)}</div>`).join('') || '—'}<div class="cell-sub">${r.applications} postulante${r.applications === 1 ? '' : 's'}</div></td>
                <td>${r.action === 'vencida' ? '<span class="badge">Se borró solo: nadie lo reclamó</span>' : `<span class="badge badge-red">${esc(r.reasonLabel)}</span>`}${r.comment ? `<div class="imp-comment">"${esc(r.comment)}"</div>` : ''}</td>
                <td class="cell-sub">${dm(r.createdAt)} · ${timeAgo(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="table-wrap"><table class="data"><thead><tr><th>Empresa</th><th>Avisos</th><th>Postulantes</th><th>Estado</th><th></th></tr></thead><tbody>
              ${list.map((c) => `<tr>
                <td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.locality || '—')} · ${esc(c.phone || 'sin teléfono')}</div>${c.email ? `<div class="imp-email">${icon('mail', 13)} ${esc(c.email)}</div>` : ''}</td>
                <td>${c.jobs.map((j) => `<div>${esc(j.title)}</div>`).join('')}</td>
                <td>${c.applications}</td>
                <td>${state(c)}</td>
                <td class="imp-row-actions">${actions(c)}</td></tr>
                ${c.claimed ? '' : `<tr class="imp-msg-row" data-msg-row="${esc(c.id)}" hidden><td colspan="5"><div class="imp-msg">
                  <label for="msg-${esc(c.id)}">Mensaje para ${esc(c.name)}</label>
                  <textarea class="input" id="msg-${esc(c.id)}" rows="6" maxlength="1500" data-msg-text="${esc(c.id)}" data-wa-base="${esc((c.waUrl || '').split('?')[0])}" data-gmail-base="${esc((c.gmailUrl || '').split('&body=')[0])}">${esc(c.messageText || '')}</textarea>
                  <div class="imp-msg-actions">
                    <button class="btn btn-lime btn-sm" type="button" data-msg-ai="${esc(c.id)}">${icon('sparkles', 15)} ${c.message ? 'Escribir otro con IA' : 'Escribir con IA'}</button>
                    <button class="btn btn-outline btn-sm" type="button" data-msg-save="${esc(c.id)}">Guardar</button>
                    <button class="btn btn-outline btn-sm" type="button" data-msg-copy="${esc(c.id)}">${icon('copy', 15)} Copiar</button>
                    ${c.waUrl ? `<a class="btn btn-primary btn-sm" href="${esc(c.waUrl)}" target="_blank" rel="noopener" data-msg-wa="${esc(c.id)}" data-notify="${esc(c.id)}">${icon('whatsapp', 15)} Mandar por WhatsApp</a>` : ''}
                    ${c.gmailUrl ? `<a class="btn btn-gmail btn-sm" href="${esc(c.gmailUrl)}" target="_blank" rel="noopener" data-msg-gmail="${esc(c.id)}" data-notify="${esc(c.id)}">${icon('mail', 15)} Mandar por Gmail</a>` : ''}
                    ${!c.waUrl && !c.gmailUrl ? '<span class="muted">Sin teléfono ni mail: copiá el mensaje y mandalo por otro lado.</span>' : ''}
                  </div>
                  <p class="cell-sub" data-msg-note="${esc(c.id)}">${c.message ? 'Mensaje guardado. Podés corregirlo antes de mandarlo.' : 'Este es el mensaje de siempre. Tocá "Escribir con IA" para uno personalizado.'}</p>
                </div></td></tr>`}`).join('')}</tbody></table></div>`;
        $('#imp-list').innerHTML = chips + table
          + (removed.length ? `<p class="muted imp-removed">Pidieron no aparecer más: ${removed.map((r) => esc(r.name)).join(', ')}.</p>` : '');
        $$('[data-imp-filter]').forEach((b) => b.addEventListener('click', () => {
          impFilter = b.dataset.impFilter;
          try { localStorage.setItem('wk_imp_filter', impFilter); } catch (_) {}
          loadList();
        }));
        /* editor del mensaje: la IA lo escribe, el admin lo corrige; WhatsApp siempre lleva lo que está escrito */
        const msgEl = (id, attr) => $(`[${attr}="${CSS.escape(id)}"]`);
        const syncWa = (id) => {
          const ta = msgEl(id, 'data-msg-text'); const wa = msgEl(id, 'data-msg-wa'); const gm = msgEl(id, 'data-msg-gmail');
          if (ta && wa && ta.dataset.waBase) wa.href = `${ta.dataset.waBase}?text=${encodeURIComponent(ta.value)}`;
          if (ta && gm && ta.dataset.gmailBase) gm.href = `${ta.dataset.gmailBase}&body=${encodeURIComponent(ta.value)}`;
        };
        $$('[data-msg-gmail]').forEach((a) => a.addEventListener('click', () => {
          const ta = msgEl(a.dataset.msgGmail, 'data-msg-text');
          api(`/api/admin/import/companies/${encodeURIComponent(a.dataset.msgGmail)}/message`, { method: 'PUT', body: { message: ta.value } }).catch(() => {});
        }));
        $$('[data-copy-mail]').forEach((b) => b.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(b.dataset.copyMail); toast('Mail copiado', 'ok'); } catch (_) { toast(b.dataset.copyMail, 'ok'); }
        }));
        $$('[data-msg-open]').forEach((b) => b.addEventListener('click', () => {
          const row = msgEl(b.dataset.msgOpen, 'data-msg-row');
          row.hidden = !row.hidden; b.setAttribute('aria-expanded', String(!row.hidden));
          if (!row.hidden) msgEl(b.dataset.msgOpen, 'data-msg-text').focus();
        }));
        $$('[data-msg-text]').forEach((ta) => ta.addEventListener('input', () => syncWa(ta.dataset.msgText)));
        $$('[data-msg-ai]').forEach((b) => b.addEventListener('click', async () => {
          const id = b.dataset.msgAi; const note = msgEl(id, 'data-msg-note');
          const old = b.innerHTML; b.disabled = true; b.innerHTML = `${icon('sparkles', 15)} Escribiendo…`;
          note.textContent = 'La IA está escribiendo el mensaje (puede tardar unos segundos)…';
          try {
            const r = await api(`/api/admin/import/companies/${encodeURIComponent(id)}/message`, { method: 'POST' });
            msgEl(id, 'data-msg-text').value = r.message; syncWa(id);
            note.textContent = r.ai ? 'Lo escribió la IA y quedó guardado. Leelo y corregí lo que quieras antes de mandarlo.' : r.warning;
            b.innerHTML = `${icon('sparkles', 15)} Escribir otro con IA`;
          } catch (err) { note.textContent = err.message; b.innerHTML = old; } finally { b.disabled = false; }
        }));
        $$('[data-msg-save]').forEach((b) => b.addEventListener('click', async () => {
          const id = b.dataset.msgSave; const ta = msgEl(id, 'data-msg-text');
          try {
            const r = await api(`/api/admin/import/companies/${encodeURIComponent(id)}/message`, { method: 'PUT', body: { message: ta.value } });
            ta.value = r.message; syncWa(id); msgEl(id, 'data-msg-note').textContent = 'Mensaje guardado.'; toast('Mensaje guardado', 'ok');
          } catch (err) { toast(err.message, 'err'); }
        }));
        $$('[data-msg-copy]').forEach((b) => b.addEventListener('click', async () => {
          const ta = msgEl(b.dataset.msgCopy, 'data-msg-text');
          try { await navigator.clipboard.writeText(ta.value); toast('Mensaje copiado', 'ok'); } catch (_) { ta.select(); toast('Seleccionado: copialo con Ctrl+C', 'ok'); }
        }));
        $$('[data-msg-wa]').forEach((a) => a.addEventListener('click', () => {
          const ta = msgEl(a.dataset.msgWa, 'data-msg-text');
          api(`/api/admin/import/companies/${encodeURIComponent(a.dataset.msgWa)}/message`, { method: 'PUT', body: { message: ta.value } }).catch(() => {});
        }));
        $$('[data-mark]').forEach((b) => b.addEventListener('click', async () => {
          try { await api(`/api/admin/import/companies/${b.dataset.mark}/notified`, { method: 'POST' }); toast('Marcada como avisada', 'ok'); loadList(); } catch (err) { toast(err.message, 'err'); }
        }));
        $$('[data-notify]').forEach((a) => a.addEventListener('click', () => { api(`/api/admin/import/companies/${a.dataset.notify}/notified`, { method: 'POST', body: { kind: a.dataset.notifyKind || '' } }).then(loadList).catch(() => {}); }));
        $('[data-imp-ttl]')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          try { const r = await api('/api/admin/import/settings', { method: 'PUT', body: { ttlDays: Number($('#imp-ttl').value) } }); toast(`Listo: se borran a los ${r.settings.ttlDays} días`, 'ok'); loadList(); }
          catch (err) { toast(err.message, 'err'); }
        });
        $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copiado', 'ok'); } catch (_) { toast('No pudimos copiar', 'err'); } }));
        $$('[data-del-co]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm(`¿Borrar la ficha de ${b.dataset.name} y sus avisos? Se pierden sus postulaciones.`)) return;
          try { await api(`/api/admin/import/companies/${b.dataset.delCo}`, { method: 'DELETE' }); toast('Ficha borrada', 'ok'); loadList(); } catch (err) { toast(err.message, 'err'); }
        }));
      } catch (err) { $('#imp-list').innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
    }
    loadList();
  }

  async function adminData() {
    try {
      const { stats } = await api('/api/admin/stats');
      $('#s-published').textContent = stats.published;
      $('#s-pending').textContent = stats.pending; $('#s-pending').closest('.adm-stat')?.classList.toggle('is-zero', !Number(stats.pending));
      $('#s-apps').textContent = stats.applications;
      $('#s-companies').textContent = stats.companies;
      if ($('#s-candidates')) $('#s-candidates').textContent = stats.candidates;
      await adminInbox();
      await adminJobs('');
      await adminApps();
      await adminCompanies();
    } catch (err) { toast(err.message, 'err'); }
  }

  async function adminJobs(status) {
    const wrap = $('#admin-jobs');
    wrap.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const [{ jobs }, fst] = await Promise.all([api(`/api/admin/jobs${status ? '?status=' + status : ''}`), api('/api/admin/featured-stats').catch(() => null)]);
      ADMIN_JOBS = jobs;
      const pedidos = jobs.filter((j) => j.featureRequested).length;
      const resumen = fst ? `<div class="feat-summary">
        <span>${icon('star', 14)} Destacados: <strong>${fst.featured.viewsPerJobDay}</strong> vistas por aviso y por día · resto: <strong>${fst.normal.viewsPerJobDay}</strong>${fst.ratio ? ` · <strong>${fst.ratio}×</strong>` : ''} <small>(últimos 30 días)</small></span>
        ${pedidos ? `<span class="feat-req-count">${pedidos} pedido${pedidos === 1 ? '' : 's'} de destacado</span>` : ''}
      </div>` : '';
      wrap.innerHTML = resumen + (jobs.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Oferta</th><th>Empresa</th><th>Estado</th><th>Post.</th><th></th></tr></thead>
        <tbody>${jobs.map((j) => `<tr>
          <td><div class="cell-title">${esc(j.title)}</div><div class="cell-sub">${esc(j.locality)} · ${esc(j.category)} · ${timeAgo(j.createdAt)}</div>${(j.warnings || []).length ? `<div class="legal-flag" title="${esc(j.warnings.map((w) => w.message).join(' '))}">⚠ Posible requisito discriminatorio: ${j.warnings.map((w) => `"${esc(w.match)}"`).join(', ')}</div>` : ''}</td>
          <td class="cell-sub">${esc(j.companyName)}${j.companyVerified ? ' ✓' : ''}</td>
          <td>${W.statusBadge(j.status)}${j.featured ? `<div style="margin-top:4px"><span class="badge badge-featured">Destacada${j.featuredUntil ? ` hasta el ${new Date(j.featuredUntil).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : ''}</span></div>` : ''}${j.featureRequested ? `<div style="margin-top:4px"><span class="badge badge-amber">Pidió destacar · ${timeAgo(j.featureRequestedAt)}</span></div>` : ''}</td>
          <td>${j.applications}</td>
          <td><div class="row-actions">
            ${j.status !== 'approved' ? `<button class="btn btn-primary btn-sm" data-approve="${j.id}">Aprobar</button>` : ''}
            ${j.status !== 'rejected' ? `<button class="btn btn-outline btn-sm" data-reject="${j.id}">Rechazar</button>` : ''}
            <select class="input input-sm" data-feature-days="${j.id}" aria-label="Destacar ${esc(j.title)}">
              <option value="">${j.featured ? 'Destacada' : 'Destacar…'}</option>
              <option value="7">7 días</option><option value="15">15 días</option><option value="30">30 días</option>
              ${j.featured ? '<option value="off">Quitar destacado</option>' : ''}
            </select>
            <button class="btn btn-outline btn-sm" data-edit="${j.id}">Editar</button>
            ${gestionar(`data-adm-job="${esc(j.id)}"`)}
            <button class="btn btn-danger btn-sm" data-remove="${j.id}">Eliminar</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="list-empty">No hay ofertas con ese estado.</div>');

      $$('[data-approve]').forEach((b) => b.addEventListener('click', () => patchJob(b.dataset.approve, { status: 'approved' })));
      $$('[data-reject]').forEach((b) => b.addEventListener('click', () => {
        const reason = prompt('Motivo del rechazo (lo ve la empresa):', 'Faltan datos obligatorios o la oferta no cumple las normas.');
        if (reason === null) return;
        patchJob(b.dataset.reject, { status: 'rejected', rejectReason: reason });
      }));
      $$('[data-feature-days]').forEach((s) => s.addEventListener('change', () => {
        if (!s.value) return;
        patchJob(s.dataset.featureDays, { featuredDays: s.value === 'off' ? null : Number(s.value) });
      }));
      $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openEdit(b.dataset.edit)));
      $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
        const reason = prompt('¿Eliminar esta oferta y sus postulaciones? No se puede deshacer.\nMotivo (le llega a la empresa):', 'Contenido no permitido');
        if (reason === null) return;
        try { await api(`/api/admin/jobs/${b.dataset.remove}`, { method: 'DELETE', body: { reason } }); toast('Oferta eliminada', 'ok'); adminData(); }
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
      $('#s-pending').textContent = stats.pending; $('#s-pending').closest('.adm-stat')?.classList.toggle('is-zero', !Number(stats.pending));
      await adminJobs($('#jobs-filter').value);
    } catch (err) { toast(err.message, 'err'); }
  }

  async function openEdit(id) {
    const j = ADMIN_JOBS.find((x) => x.id === id);
    if (!j) return;
    const meta = await W.loadMeta();
    const fill = (sel, items, val) => { const el = $(sel); el.innerHTML = items.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join(''); el.value = val; };
    fill('#e-locality', meta.localities, j.locality);
    fill('#e-category', meta.categories, j.category);
    fill('#e-type', meta.types, j.type);
    fill('#e-modality', meta.modalities, j.modality);
    $('#e-id').value = j.id; $('#e-title').value = j.title; $('#e-desc').value = j.description;
    $('#e-salary').value = j.salary || ''; $('#e-contact').value = j.contactEmail || ''; $('#e-closes').value = j.closesAt || '';
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
        closeEdit(); toast('Oferta actualizada', 'ok'); await adminJobs($('#jobs-filter').value);
      } catch (err) { showAlert($('#edit-alert'), err.message, 'error'); }
    };
  }
  function closeEdit() { $('#edit-modal').hidden = true; document.body.style.overflow = ''; }

  async function adminApps() {
    const wrap = $('#admin-apps');
    try {
      const { applications } = await api('/api/admin/applications');
      wrap.innerHTML = applications.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Candidato</th><th>Oferta</th><th>Contacto</th><th>Etapa</th><th>IA</th><th>CV</th></tr></thead>
        <tbody>${applications.map((a) => `<tr>
          <td><div class="cell-title">${esc(a.name)}</div><div class="cell-sub">${timeAgo(a.createdAt)}</div></td>
          <td class="cell-sub">${esc(a.jobTitle)}<br><span style="color:#8a968f">${esc(a.companyName)}</span></td>
          <td class="cell-sub">${esc(a.email)}<br>${esc(a.phone)}</td>
          <td>${stagePill(a.stage)}</td>
          <td class="cell-sub">${a.aiScore == null ? '—' : `<strong>${a.aiScore}</strong>`}</td>
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
        <thead><tr><th>Empresa</th><th>Contacto</th><th>Ofertas</th><th>Post.</th><th>IA</th><th>Pack Cosecha</th><th>Plan</th><th>Verificada</th></tr></thead>
        <tbody>${companies.map((c) => `<tr>
          <td><div class="company-cell">${logoHtml(c.name, c.logo, 'logo-xs')}<div><div class="cell-title">${esc(c.name)}</div><div class="cell-sub">${timeAgo(c.createdAt)}</div></div></div></td>
          <td class="cell-sub">${esc(c.email)}<br>${esc(c.phone || '')}</td>
          <td class="cell-sub">${c.published} publicadas / ${c.jobs} totales</td>
          <td class="cell-sub">${c.applications || 0}</td>
          <td class="cell-sub">${c.ai ? `${esc(c.ai.provider)}${c.ai.enabled ? ' ✓' : ''}` : '—'}</td>
          <td class="cell-sub">${c.cosechaUntil
            ? `<span class="badge badge-green">Activo hasta ${fmtDate(c.cosechaUntil)}</span><br><button class="link-btn" type="button" data-cosecha-off="${c.id}">Quitar</button>`
            : `${c.cosechaRequestedAt ? `<span class="badge badge-amber">Lo pidió ${timeAgo(c.cosechaRequestedAt)}</span><br>` : ''}<button class="btn btn-outline btn-sm" type="button" data-cosecha-on="${c.id}">Activar 30 días</button>`}</td>
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
      /* Pack Cosecha: activar 30 días o quitarlo (los avisos conservan su fecha de destacado) */
      $$('[data-cosecha-on]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/admin/companies/${b.dataset.cosechaOn}`, { method: 'PATCH', body: { cosechaDays: 30 } }); toast('Pack Cosecha activado por 30 días', 'ok'); adminCompanies(); }
        catch (err) { toast(err.message, 'err'); }
      }));
      $$('[data-cosecha-off]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Quitar el Pack Cosecha? Los avisos que ya están destacados siguen así hasta su fecha.')) return;
        try { await api(`/api/admin/companies/${b.dataset.cosechaOff}`, { method: 'PATCH', body: { cosechaDays: null } }); toast('Pack Cosecha quitado', 'ok'); adminCompanies(); }
        catch (err) { toast(err.message, 'err'); }
      }));
    } catch (err) { wrap.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; }
  }

  /* ---------- Empresas para contactar ---------- */
  const PROS_FILTERS = [['pendiente', 'Para contactar'], ['contactada', 'Contactadas'], ['recordatorio', 'Recordatorio enviado'], ['registrada', 'Se registraron'], ['no_contactar', 'No contactar']];
  const PROS_LABEL = { pendiente: ['Para contactar', 'badge-amber'], contactada: ['Contactada', ''], recordatorio: ['Recordatorio enviado', ''], registrada: ['Se registró', 'badge-green'], no_contactar: ['No contactar', 'badge-red'] };
  let prosFilter = 'pendiente';
  let prosReady = false;
  async function adminProspects() {
    const box = $('#pros-list');
    if (!box) return;
    if (!prosReady) {
      prosReady = true;
      $('#pros-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: $('#pros-name').value, category: $('#pros-cat').value, locality: $('#pros-loc').value, phone: $('#pros-phone').value,
          email: $('#pros-email').value, instagram: $('#pros-ig').value, web: $('#pros-web').value, sourceUrl: $('#pros-src').value };
        try { await api('/api/admin/prospects', { method: 'POST', body }); toast('Empresa agregada', 'ok'); ['#pros-name', '#pros-cat', '#pros-phone', '#pros-email', '#pros-ig', '#pros-web', '#pros-src'].forEach((s) => { $(s).value = ''; }); adminProspects(); }
        catch (err) { toast(err.message, 'err'); }
      });
      $('#pros-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#pros-csv').value = await f.text(); });
      $('#pros-import').addEventListener('click', async () => {
        const csv = $('#pros-csv').value;
        if (!csv.trim()) { toast('Elegí o pegá una planilla', 'err'); return; }
        try { const r = await api('/api/admin/prospects/import', { method: 'POST', body: { csv } }); toast(`Listo: ${r.added} nuevas${r.skipped ? `, ${r.skipped} salteadas` : ''}`, 'ok'); $('#pros-csv').value = ''; $('#pros-file').value = ''; adminProspects(); }
        catch (err) { toast(err.message, 'err'); }
      });
    }
    let d;
    try { d = await api('/api/admin/prospects'); } catch (err) { box.innerHTML = `<div class="list-empty">${esc(err.message)}</div>`; return; }
    const list = d.prospects.filter((p) => p.status === prosFilter);
    const contacts = (p) => [p.phone && `${icon('phone', 12)} ${esc(p.phone)}`, p.email && `${icon('mail', 12)} ${esc(p.email)}`, p.instagram && `@${esc(p.instagram)}`,
      p.web && `<a href="${esc(p.web)}" target="_blank" rel="noopener">sitio web</a>`].filter(Boolean).join(' · ') || '<span class="muted">Sin contactos</span>';
    const when = (p) => (p.remindedAt ? `Recordatorio el ${fmtDate(p.remindedAt)}` : p.contactedAt ? `Contactada el ${fmtDate(p.contactedAt)}` : '');
    const canRemind = (p) => p.status === 'contactada' && p.contactedAt && Date.now() - p.contactedAt >= 3 * 86400000;
    box.innerHTML = `<p class="pros-today ${d.today >= d.dailyMax ? 'is-max' : ''}">Hoy contactaste <strong>${d.today}</strong> ${d.today === 1 ? 'empresa' : 'empresas'}. Recomendado: hasta ${d.dailyMax} por día, así tu WhatsApp y tu Gmail no quedan marcados como spam.</p>
      <div class="imp-filters" role="tablist" aria-label="Filtrar empresas">${PROS_FILTERS.map(([id, label]) =>
        `<button type="button" role="tab" class="chip-filter${id === prosFilter ? ' is-on' : ''}" aria-selected="${id === prosFilter}" data-pros-filter="${id}">${label} <span class="tab-count">${d.counts[id] || 0}</span></button>`).join('')}</div>
      ${!list.length ? '<p class="muted">No hay empresas en este grupo.</p>' : `<div class="table-wrap"><table class="data"><thead><tr><th>Empresa</th><th>Contacto</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map((p) => {
        const st = PROS_LABEL[p.status] || ['', ''];
        const open = p.status === 'pendiente' || p.status === 'contactada' || p.status === 'recordatorio';
        const kind = p.status === 'pendiente' ? 'contacto' : 'recordatorio';
        return `<tr>
          <td><strong>${esc(p.name)}</strong><div class="cell-sub">${esc(p.category || 'Sin rubro')} · ${esc(p.locality || '—')}</div>${p.sourceUrl ? `<div class="cell-sub"><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">Fuente</a></div>` : ''}</td>
          <td class="cell-sub">${contacts(p)}</td>
          <td><span class="badge ${st[1]}">${st[0]}</span><div class="cell-sub">${when(p)}</div></td>
          <td class="imp-row-actions">${open ? `<button class="btn btn-lime btn-sm" type="button" data-pros-open="${esc(p.id)}" aria-expanded="false">${icon('sparkles', 15)} Mensaje</button>
            ${p.status !== 'contactada' || canRemind(p) ? `${p.waUrl ? `<a class="btn btn-primary btn-sm" href="${esc(p.waUrl)}" target="_blank" rel="noopener" data-pros-sent="${esc(p.id)}" data-kind="${kind}">${icon('whatsapp', 15)} ${kind === 'recordatorio' ? 'Recordatorio' : 'WhatsApp'}</a>` : ''}
            ${p.gmailUrl ? `<a class="btn btn-gmail btn-sm" href="${esc(p.gmailUrl)}" target="_blank" rel="noopener" data-pros-sent="${esc(p.id)}" data-kind="${kind}">${icon('mail', 15)} Gmail</a>` : ''}
            <button class="btn btn-outline btn-sm" type="button" data-pros-mark="${esc(p.id)}" data-kind="${kind}">${icon('check', 15)} Marcar ${kind === 'recordatorio' ? 'recordatorio' : 'contactada'}</button>` : '<span class="cell-sub">Recordatorio a partir de los 3 días</span>'}
            <button class="btn btn-ghost btn-sm" type="button" data-pros-status="${esc(p.id)}" data-to="no_contactar">No contactar</button>` : ''}
            ${p.status === 'no_contactar' ? `<button class="btn btn-ghost btn-sm" type="button" data-pros-status="${esc(p.id)}" data-to="pendiente">Volver a la lista</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" data-pros-del="${esc(p.id)}" data-name="${esc(p.name)}">${icon('trash', 15)}</button></td></tr>
          ${open ? `<tr class="imp-msg-row" data-pros-row="${esc(p.id)}" hidden><td colspan="4"><div class="imp-msg">
            <label for="pmsg-${esc(p.id)}">Mensaje para ${esc(p.name)}</label>
            <textarea class="input" id="pmsg-${esc(p.id)}" rows="6" maxlength="1500" data-pros-text="${esc(p.id)}">${esc(p.messageText)}</textarea>
            <div class="imp-msg-actions">
              <button class="btn btn-lime btn-sm" type="button" data-pros-ai="${esc(p.id)}">${icon('sparkles', 15)} ${p.message ? 'Escribir otro con IA' : 'Escribir con IA'}</button>
              <button class="btn btn-outline btn-sm" type="button" data-pros-save="${esc(p.id)}">Guardar</button>
              <button class="btn btn-outline btn-sm" type="button" data-pros-copy="${esc(p.id)}">${icon('copy', 15)} Copiar</button>
            </div>
            <p class="cell-sub" data-pros-note="${esc(p.id)}">Después de guardar, los botones de WhatsApp y Gmail de la fila llevan este texto.</p>
          </div></td></tr>` : ''}`;
      }).join('')}</tbody></table></div>`}`;
    const call = async (url, opts, msgOk) => { try { await api(url, opts); if (msgOk) toast(msgOk, 'ok'); adminProspects(); } catch (err) { toast(err.message, 'err'); } };
    $$('[data-pros-filter]', box).forEach((b) => b.addEventListener('click', () => { prosFilter = b.dataset.prosFilter; adminProspects(); }));
    $$('[data-pros-sent]', box).forEach((a) => a.addEventListener('click', () => { call(`/api/admin/prospects/${a.dataset.prosSent}/contacted`, { method: 'POST', body: { kind: a.dataset.kind } }); }));
    $$('[data-pros-mark]', box).forEach((b) => b.addEventListener('click', () => call(`/api/admin/prospects/${b.dataset.prosMark}/contacted`, { method: 'POST', body: { kind: b.dataset.kind } }, 'Listo')));
    $$('[data-pros-status]', box).forEach((b) => b.addEventListener('click', () => call(`/api/admin/prospects/${b.dataset.prosStatus}`, { method: 'PATCH', body: { status: b.dataset.to } }, b.dataset.to === 'no_contactar' ? 'No se le vuelve a escribir' : 'Vuelve a la lista')));
    $$('[data-pros-del]', box).forEach((b) => b.addEventListener('click', () => { if (confirm(`¿Borrar ${b.dataset.name} de la lista?`)) call(`/api/admin/prospects/${b.dataset.prosDel}`, { method: 'DELETE' }, 'Borrada'); }));
    $$('[data-pros-open]', box).forEach((b) => b.addEventListener('click', () => {
      const row = $(`[data-pros-row="${CSS.escape(b.dataset.prosOpen)}"]`, box); row.hidden = !row.hidden; b.setAttribute('aria-expanded', String(!row.hidden));
    }));
    $$('[data-pros-ai]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.prosAi; const note = $(`[data-pros-note="${CSS.escape(id)}"]`, box);
      b.disabled = true; note.textContent = 'La IA está escribiendo el mensaje…';
      try { const r = await api(`/api/admin/prospects/${encodeURIComponent(id)}/message`, { method: 'POST' }); $(`[data-pros-text="${CSS.escape(id)}"]`, box).value = r.message; note.textContent = r.ai ? 'Lo escribió la IA y quedó guardado. Revisalo antes de mandarlo.' : r.warning; }
      catch (err) { note.textContent = err.message; } finally { b.disabled = false; }
    }));
    $$('[data-pros-save]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.prosSave; const ta = $(`[data-pros-text="${CSS.escape(id)}"]`, box);
      try { const r = await api(`/api/admin/prospects/${encodeURIComponent(id)}/message`, { method: 'PUT', body: { message: ta.value } }); ta.value = r.message; toast('Mensaje guardado', 'ok'); adminProspects(); }
      catch (err) { toast(err.message, 'err'); }
    }));
    $$('[data-pros-copy]', box).forEach((b) => b.addEventListener('click', async () => {
      const ta = $(`[data-pros-text="${CSS.escape(b.dataset.prosCopy)}"]`, box);
      try { await navigator.clipboard.writeText(ta.value); toast('Mensaje copiado', 'ok'); } catch (_) { ta.select(); }
    }));
  }

  /* ================================================================== */
  document.addEventListener('DOMContentLoaded', async () => {
    await W.ready;
    const page = document.body.dataset.page;
    try {
      if (page === 'panel') await initPanel();
      else if (page === 'profile') await initProfile();
      else if (page === 'admin') await initAdmin();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Ocurrió un error', 'err');
    }
  });
})();
