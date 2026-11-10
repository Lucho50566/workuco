/* Workuco — paneles de empresa, persona y administración */
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
        img.onerror = reject;
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
    return canvas.toDataURL('image/jpeg', quality);
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b && b.closest('#panel-app')) showTab(b.dataset.goto);
    });

    /* ---------- resumen ---------- */
    function renderOverview() {
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

    /* ---------- ofertas ---------- */
    let jobStatus = '';
    function renderJobs() {
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
              ${j.newApplications ? `<span class="new-dot">${j.newApplications} nuevo${j.newApplications === 1 ? '' : 's'}</span>` : ''}
            </div>
            ${j.status === 'rejected' && j.rejectReason ? `<p class="reject-note">${esc(j.rejectReason)}</p>` : ''}
            <div class="offer-actions">
              <a class="btn btn-outline btn-sm" href="/publicar?edit=${j.id}">${icon('edit', 14)} Editar</a>
              <button class="btn btn-ghost btn-sm" type="button" data-dup="${j.id}">${icon('copy', 14)} Duplicar</button>
              <button class="btn btn-ghost btn-sm" type="button" data-close="${j.id}">${icon('x', 14)} Cerrar</button>
              ${j.status === 'approved' ? `<a class="btn btn-ghost btn-sm" href="/oferta/${j.id}" target="_blank" rel="noopener">${icon('external', 14)} Ver</a>` : ''}
              <button class="btn btn-danger btn-sm" type="button" data-del="${j.id}">${icon('trash', 14)}</button>
            </div>
          </div>
        </article>`;
      }).join('') : `<div class="empty"><h3>No hay publicaciones acá</h3><p>Probá con otro filtro o creá una búsqueda nueva.</p><a class="btn btn-primary" href="/publicar" style="margin-top:14px">Publicar empleo</a></div>`;

      $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta publicación? También se borran sus postulaciones.')) return;
        try { await api(`/api/company/jobs/${b.dataset.del}`, { method: 'DELETE' }); toast('Publicación eliminada', 'ok'); load(); }
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
            <div class="drawer-badges">${stagePill(a.stage)}${a.aiScore != null ? `<span class="badge badge-ai">${icon('sparkles', 13)} IA ${a.aiScore}</span>` : ''}</div>
          </div>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Cerrar">${icon('x', 18)}</button>
        </div>

        <div class="contact-actions">
          <a class="btn btn-primary btn-sm" href="${waLink(a.phone, msg)}" target="_blank" rel="noopener">${icon('whatsapp', 15)} WhatsApp</a>
          <a class="btn btn-outline btn-sm" href="mailto:${esc(a.email)}?subject=${encodeURIComponent('Tu postulación a ' + a.jobTitle)}">${icon('mail', 15)} Email</a>
          <a class="btn btn-outline btn-sm" href="tel:${esc(a.phone)}">${icon('phone', 15)} Llamar</a>
          ${cvHref ? `<a class="btn btn-outline btn-sm" href="${cvHref}" target="_blank" rel="noopener">${icon('file', 15)} Ver CV</a>` : ''}
        </div>

        <div class="drawer-section">
          <h3>Etapa del proceso</h3>
          <div class="stage-picker">${STAGE_ORDER.map((s) => `<button type="button" class="stage-choice stage-${s}${a.stage === s ? ' is-active' : ''}" data-set-stage="${s}">${esc(STAGE_LABEL[s])}</button>`).join('')}</div>
        </div>

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

    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#profile-save');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const { company } = await api('/api/company/profile', { method: 'PATCH', body: {
          name: $('#p-name').value.trim(), locality: $('#p-locality').value,
          phone: $('#p-phone').value.trim(), website: $('#p-website').value.trim(),
          description: $('#p-desc').value.trim(),
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
      gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
      anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
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
          $('#ai-model').value = ({ openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash', anthropic: 'claude-sonnet-4-5', custom: '' })[aiState.provider] || '';
        }
        if (aiState.provider === 'custom' && !$('#ai-base').value) $('#ai-base').value = '';
        fillModels(aiState.provider);
      }));
    }

    async function saveAi() {
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
        showAlert($('#ai-alert'), 'Configuración de IA guardada.', 'ok');
        setTimeout(() => hideAlert($('#ai-alert')), 2500);
        renderAiTab(); renderOverview();
      } catch (err) { showAlert($('#ai-alert'), err.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Guardar configuración'; }
    }
    $('#ai-save').addEventListener('click', saveAi);
    $('#ai-test').addEventListener('click', async () => {
      const btn = $('#ai-test');
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

    const showTab = (name) => {
      $$('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    };
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    /* las notificaciones abren la pestaña justa: /mi-perfil?tab=postulaciones */
    const TAB_ALIAS = { postulaciones: 'apps', alertas: 'alerts', invitaciones: 'foryou', guardadas: 'saved' };
    const wanted = new URLSearchParams(location.search).get('tab');
    if (wanted && $(`[data-panel="${TAB_ALIAS[wanted] || wanted}"]`)) showTab(TAB_ALIAS[wanted] || wanted);

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
      $('#share-wa').href = `https://wa.me/?text=${encodeURIComponent(`Mirá mi perfil en Workuco: ${url}`)}`;
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
    else { $('#admin-gate').hidden = true; $('#admin-app').hidden = false; await adminData(); }

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
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    }));
    $('#jobs-filter').addEventListener('change', () => adminJobs($('#jobs-filter').value));
  }

  async function adminData() {
    try {
      const { stats } = await api('/api/admin/stats');
      $('#s-published').textContent = stats.published;
      $('#s-pending').textContent = stats.pending;
      $('#s-apps').textContent = stats.applications;
      $('#s-companies').textContent = stats.companies;
      if ($('#s-candidates')) $('#s-candidates').textContent = stats.candidates;
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
          <td>${W.statusBadge(j.status)}${j.featured ? '<div style="margin-top:4px"><span class="badge badge-featured">Destacada</span></div>' : ''}</td>
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
        <thead><tr><th>Empresa</th><th>Contacto</th><th>Ofertas</th><th>Post.</th><th>IA</th><th>Plan</th><th>Verificada</th></tr></thead>
        <tbody>${companies.map((c) => `<tr>
          <td><div class="company-cell">${logoHtml(c.name, c.logo, 'logo-xs')}<div><div class="cell-title">${esc(c.name)}</div><div class="cell-sub">${timeAgo(c.createdAt)}</div></div></div></td>
          <td class="cell-sub">${esc(c.email)}<br>${esc(c.phone || '')}</td>
          <td class="cell-sub">${c.published} publicadas / ${c.jobs} totales</td>
          <td class="cell-sub">${c.applications || 0}</td>
          <td class="cell-sub">${c.ai ? `${esc(c.ai.provider)}${c.ai.enabled ? ' ✓' : ''}` : '—'}</td>
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
