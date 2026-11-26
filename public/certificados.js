/* =====================================================================
   WorkUco · Certificados de trabajo
   Usa los helpers de app.js (window.WK) y el QR de /vendor/qrcode.js.
   - initPage: /certificado/<código> (ver, imprimir y verificar)
   ===================================================================== */
(function () {
  'use strict';
  const W = window.WK;
  const { $, api, esc } = W;

  const codeLabel = (c) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
  const fmtIssued = (ts) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Mendoza' });

  /* QR en SVG (sin pedidos a la red) */
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: 'Código QR para verificar el certificado' });
  }

  async function initPage() {
    const root = $('#cert-root');
    if (!root) return;
    let raw = location.pathname.split('/').pop() || '';
    try { raw = decodeURIComponent(raw); } catch (_) { /* queda como vino: la API responde que no existe */ }
    let data;
    try {
      data = (await api(`/api/certificates/${encodeURIComponent(raw)}`)).certificate;
    } catch (_) {
      root.innerHTML = '<section class="cert-wrap"><div class="cert-paper cert-missing"><h1>No encontramos ese certificado</h1><p>Revisá el código o escribinos desde <a class="link-inline" href="/contacto">Contacto</a>.</p></div></section>';
      return;
    }
    const url = `${location.origin}/certificado/${data.code.replace('-', '')}`;
    if (data.status !== 'valid') {
      root.innerHTML = `<section class="cert-wrap"><div class="cert-paper cert-revoked">
        <div class="cert-stamp">Anulado</div>
        <h1>Este certificado fue anulado</h1>
        <p>Lo anuló ${data.revokedBy === 'admin' ? 'WorkUco' : 'la empresa que lo emitió'}. Ya no certifica ningún trabajo.</p>
        <p class="cert-code">Código ${esc(data.code)}</p>
      </div></section>`;
      return;
    }
    document.title = `Certificado de trabajo · ${data.personName} · WorkUco`;
    root.innerHTML = `<section class="cert-wrap">
      <div class="cert-actions no-print">
        <span class="cert-valid">✓ Certificado verificado por WorkUco</span>
        <button class="btn btn-lime" type="button" data-cert-print>Descargar / imprimir</button>
      </div>
      <article class="cert-paper" aria-label="Certificado de trabajo">
        <header class="cert-head">
          <span class="cert-brand">Work<b>Uco</b></span>
          <span class="cert-kicker">Portal de empleo del Valle de Uco</span>
        </header>
        <div class="cert-body">
          <p class="cert-eyebrow">Certificado de trabajo</p>
          <p class="cert-lead">Se certifica que</p>
          <h1 class="cert-name">${esc(data.personName)}</h1>
          <p class="cert-text">trabajó como <strong>${esc(data.position)}</strong> en <strong>${esc(data.companyName)}</strong>${data.locality ? ` (${esc(data.locality)})` : ''}, ${esc(data.period)}.</p>
          ${data.comment ? `<blockquote class="cert-comment"><p>“${esc(data.comment)}”</p><cite>— ${esc(data.companyName)}</cite></blockquote>` : ''}
        </div>
        <footer class="cert-foot">
          <div class="cert-meta">
            <p><span>Emitido el</span> ${esc(fmtIssued(data.issuedAt))}</p>
            <p><span>Código</span> <strong class="cert-code-big">${esc(data.code)}</strong></p>
            <p class="cert-verify">Verificalo en <strong>${esc(location.host)}/certificado/${esc(data.code)}</strong> o escaneando el código QR.</p>
          </div>
          <div class="cert-qr">${qrSvg(url)}</div>
        </footer>
        <p class="cert-legal">Emitido por ${esc(data.companyName)} a través de WorkUco. WorkUco verifica que la empresa contrató a la persona mediante una postulación en la plataforma; los datos del período y el comentario son responsabilidad de la empresa.</p>
      </article>
    </section>`;
    const btn = $('[data-cert-print]', root);
    if (btn) btn.addEventListener('click', () => window.print());
  }

  const todayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const appliedDay = (ts) => new Date(ts - 3 * 3600e3 - 86400000).toISOString().slice(0, 10);
  const STATUS = (c) => (c.status === 'valid' ? '<span class="badge badge-green">Vigente</span>'
    : `<span class="badge badge-red">Anulado${c.revokedBy === 'admin' ? ' por WorkUco' : ''}</span>`);
  const errMsg = (err) => (err && err.data && err.data.errors ? Object.values(err.data.errors).join(' · ') : (err && err.message) || 'No se pudo');

  /* ---------- empresa: bloque en la ficha de la postulación ---------- */
  async function drawerSection(slot, app, onChange) {
    if (!slot) return;
    if (!app.candidateId) {
      slot.innerHTML = '<h3>Certificado de trabajo</h3><p class="soft-text">Sólo se puede dar a personas que se postularon con su cuenta de WorkUco.</p>';
      return;
    }
    slot.innerHTML = '<h3>Certificado de trabajo</h3><div class="skeleton" style="height:60px"></div>';
    let cert = null;
    try { cert = (await api(`/api/company/applications/${app.id}`)).application.certificate; } catch (_) { /* sin datos */ }
    if (cert && cert.status === 'revoked' && cert.revokedBy === 'admin') {
      slot.innerHTML = '<h3>Certificado de trabajo</h3><p class="soft-text">WorkUco anuló el certificado de esta postulación. Si creés que es un error, escribinos desde Contacto.</p>';
      return;
    }
    if (cert && cert.status === 'valid') {
      slot.innerHTML = `<h3>Certificado de trabajo</h3>
        <div class="cert-mini"><div><strong>${esc(cert.position)}</strong><span>${esc(cert.period)}</span><span class="cert-mini-code">Código ${esc(cert.codeLabel)}</span></div>
          <div class="cert-mini-actions"><a class="btn btn-outline btn-sm" href="${esc(cert.url)}" target="_blank" rel="noopener">Ver certificado</a>
          <button class="btn btn-ghost btn-sm" type="button" data-cert-revoke>Anular</button></div></div>`;
      $('[data-cert-revoke]', slot).addEventListener('click', () => revokeFlow(slot, cert, () => drawerSection(slot, app, onChange)));
      return;
    }
    slot.innerHTML = `<h3>Certificado de trabajo</h3>
      <p class="soft-text">Cuando el trabajo termine, dale a ${esc(String(app.name || '').split(' ')[0])} un certificado que puede mostrar en su próxima búsqueda. Cualquiera lo verifica con un código o un QR.</p>
      <button class="btn btn-lime btn-sm" type="button" data-cert-open>Terminó el trabajo · Dar certificado</button>`;
    $('[data-cert-open]', slot).addEventListener('click', () => issueForm(slot, app, () => { drawerSection(slot, app, onChange); if (onChange) onChange(); }));
  }

  function issueForm(slot, app, done) {
    const max = todayAR();
    slot.innerHTML = `<h3>Dar certificado de trabajo</h3>
      <form class="cert-form" novalidate>
        <label class="field"><span>Puesto</span><input class="input" name="position" maxlength="80" value="${esc(app.jobTitle || '')}" required></label>
        <div class="cert-form-row">
          <label class="field"><span>Desde</span><input class="input" type="date" name="startDate" min="${appliedDay(app.createdAt)}" max="${max}" required></label>
          <label class="field"><span>Hasta</span><input class="input" type="date" name="endDate" min="${appliedDay(app.createdAt)}" max="${max}" value="${max}" required></label>
        </div>
        <label class="field"><span>Comentario (opcional)</span>
          <textarea class="input" name="comment" rows="3" maxlength="280" placeholder="Ej.: Responsable y puntual, la volveríamos a contratar."></textarea>
          <small class="soft-text"><span data-cert-count>0</span>/280 · La persona lo ve antes y decide si se muestra en el certificado.</small></label>
        <p class="cert-form-err" data-cert-err hidden></p>
        <div class="cert-form-actions"><button class="btn btn-lime btn-sm" type="submit">Dar certificado</button>
          <button class="btn btn-ghost btn-sm" type="button" data-cert-cancel>Cancelar</button></div>
      </form>`;
    const form = $('form', slot);
    const ta = form.elements.comment;
    ta.addEventListener('input', () => { $('[data-cert-count]', slot).textContent = ta.value.length; });
    $('[data-cert-cancel]', slot).addEventListener('click', done);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const err = $('[data-cert-err]', slot);
      btn.disabled = true; err.hidden = true;
      try {
        const body = { position: form.elements.position.value, startDate: form.elements.startDate.value, endDate: form.elements.endDate.value, comment: ta.value };
        await api(`/api/company/applications/${app.id}/certificate`, { method: 'POST', body });
        W.toast('Certificado emitido: le avisamos a la persona', 'ok');
        done();
      } catch (ex) {
        err.textContent = errMsg(ex); err.hidden = false; btn.disabled = false;
      }
    });
  }

  function revokeFlow(slot, cert, done) {
    const box = document.createElement('div');
    box.className = 'cert-revoke';
    box.innerHTML = `<label class="field"><span>¿Por qué lo anulás? (sólo lo ve WorkUco)</span><input class="input" maxlength="200" data-cert-why></label>
      <div class="cert-form-actions"><button class="btn btn-danger btn-sm" type="button" data-cert-yes>Anular certificado</button>
      <button class="btn btn-ghost btn-sm" type="button" data-cert-no>Cancelar</button></div>`;
    slot.appendChild(box);
    $('[data-cert-no]', box).addEventListener('click', () => box.remove());
    $('[data-cert-yes]', box).addEventListener('click', async () => {
      try {
        await api(`/api/company/certificates/${cert.id}/revoke`, { method: 'POST', body: { reason: $('[data-cert-why]', box).value } });
        W.toast('Certificado anulado: le avisamos a la persona', 'ok');
        done();
      } catch (ex) { W.toast(errMsg(ex), 'err'); }
    });
  }

  /* ---------- empresa: certificados emitidos ---------- */
  async function companyList(box) {
    if (!box) return;
    let list = [];
    try { list = (await api('/api/company/certificates')).certificates; } catch (_) { box.innerHTML = ''; return; }
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<details class="cert-issued"><summary>Certificados emitidos (${list.length})</summary>
      <ul class="cert-list">${list.map((c) => `<li class="cert-row" data-cert-row="${esc(c.id)}">
        <div><strong>${esc(c.personName)}</strong><span>${esc(c.position)} · ${esc(c.period)}</span></div>
        <div class="cert-row-actions">${STATUS(c)}<a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Ver</a>
        ${c.status === 'valid' ? `<button class="btn btn-ghost btn-sm" type="button" data-cert-revoke-row="${esc(c.id)}">Anular</button>` : ''}</div></li>`).join('')}</ul></details>`;
    box.querySelectorAll('[data-cert-revoke-row]').forEach((b) => b.addEventListener('click', () => {
      const c = list.find((x) => x.id === b.dataset.certRevokeRow);
      const row = b.closest('.cert-row');
      if (row.querySelector('.cert-revoke')) return;
      revokeFlow(row, c, () => companyList(box).then(() => { const d = $('details', box); if (d) d.open = true; }));
    }));
  }

  /* ---------- persona: pestaña "Certificados" de Mi perfil ---------- */
  async function profileSection(box) {
    if (!box) return;
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    let list = [];
    let isPublic = false;
    try {
      const [l, p] = await Promise.all([api('/api/candidate/certificates'), api('/api/candidate/profile')]);
      list = l.certificates; isPublic = !!(p.candidate && p.candidate.isPublic);
    } catch (ex) { box.innerHTML = `<p class="soft-text">${esc(errMsg(ex))}</p>`; return; }
    if (!list.length) {
      box.innerHTML = '<div class="empty"><h3>Todavía no tenés certificados</h3><p>Cuando una empresa que te contrató por WorkUco termine el trabajo, te puede dar un certificado. Te avisamos.</p></div>';
      return;
    }
    box.innerHTML = list.map((c) => `<article class="cert-card${c.status === 'valid' ? '' : ' is-revoked'}" data-cert="${esc(c.id)}">
      <div class="cert-card-head"><div><h3>${esc(c.position)}</h3><p>${esc(c.companyName)} · ${esc(c.period)}</p></div>${STATUS(c)}</div>
      ${c.status === 'valid' && c.comment ? `<div class="cert-card-comment"><p>“${esc(c.comment)}”</p>
        ${c.commentStatus === 'pending' ? '<p class="soft-text">La empresa dejó este comentario. ¿Querés que aparezca en tu certificado?</p>' : `<p class="soft-text">${c.commentStatus === 'shown' ? 'Se muestra en el certificado.' : 'No se muestra en el certificado.'}</p>`}
        <div class="cert-form-actions">
          ${c.commentStatus !== 'shown' ? '<button class="btn btn-outline btn-sm" type="button" data-cert-comment="1">Mostrarlo en el certificado</button>' : ''}
          ${c.commentStatus !== 'hidden' ? '<button class="btn btn-ghost btn-sm" type="button" data-cert-comment="0">No mostrarlo</button>' : ''}
        </div></div>` : ''}
      ${c.status === 'valid' ? `<div class="cert-card-foot">
        <a class="btn btn-lime btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Ver / Descargar</a>
        <label class="cert-switch${isPublic ? '' : ' is-disabled'}"><input type="checkbox" data-cert-profile ${c.onProfile ? 'checked' : ''} ${isPublic ? '' : 'disabled'}>
          <span>Mostrar en mi perfil público</span></label>
        ${isPublic ? '' : '<small class="soft-text">Para mostrarlo, primero hacé público tu perfil en "Mi perfil".</small>'}
      </div>` : '<p class="soft-text">Este certificado fue anulado y ya no certifica el trabajo.</p>'}
    </article>`).join('');
    box.querySelectorAll('[data-cert]').forEach((card) => {
      const id = card.dataset.cert;
      card.querySelectorAll('[data-cert-comment]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/candidate/certificates/${id}`, { method: 'PATCH', body: { commentShown: b.dataset.certComment === '1' } }); W.toast('Listo', 'ok'); profileSection(box); } catch (ex) { W.toast(errMsg(ex), 'err'); }
      }));
      const sw = card.querySelector('[data-cert-profile]');
      if (sw) sw.addEventListener('change', async () => {
        try { await api(`/api/candidate/certificates/${id}`, { method: 'PATCH', body: { onProfile: sw.checked } }); W.toast(sw.checked ? 'Se ve en tu perfil público' : 'Ya no se ve en tu perfil público', 'ok'); } catch (ex) { sw.checked = !sw.checked; W.toast(errMsg(ex), 'err'); }
      });
    });
  }

  /* ---------- perfil público ---------- */
  function publicBlock(list) {
    if (!list || !list.length) return '';
    return `<section class="pp-block"><h2>Certificados de trabajo</h2><ul class="cert-list">${list.map((c) => `<li class="cert-row">
      <div><strong>${esc(c.position)}</strong><span>${esc(c.companyName)} · ${esc(c.period)}</span></div>
      <a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Verificar</a></li>`).join('')}</ul></section>`;
  }

  /* ---------- admin ---------- */
  let adminReady = false;
  async function adminList(box) {
    if (!box) return;
    const q = ($('#admin-cert-q') || {}).value || '';
    if (!adminReady) {
      adminReady = true;
      const input = $('#admin-cert-q');
      let t = null;
      if (input) input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => adminList(box), 300); });
      box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-cert-admin-revoke]');
        if (!b) return;
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tocá de nuevo para anular'; return; }
        const why = $(`[data-cert-admin-why="${b.dataset.certAdminRevoke}"]`);
        try { await api(`/api/admin/certificates/${b.dataset.certAdminRevoke}/revoke`, { method: 'POST', body: { reason: why ? why.value : '' } }); W.toast('Certificado anulado: le avisamos a la persona', 'ok'); } catch (ex) { W.toast(errMsg(ex), 'err'); }
        adminList(box);
      });
    }
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    let list = [];
    try { list = (await api(`/api/admin/certificates?q=${encodeURIComponent(q)}`)).certificates; } catch (ex) { box.innerHTML = `<p class="soft-text">${esc(errMsg(ex))}</p>`; return; }
    box.innerHTML = list.length ? `<ul class="cert-list">${list.map((c) => `<li class="cert-row">
      <div><strong>${esc(c.personName)}</strong><span>${esc(c.position)} · ${esc(c.companyName)} · ${esc(c.period)}</span>
        <span class="cert-mini-code">${esc(c.codeLabel)}${c.revokeReason ? ` · Motivo: ${esc(c.revokeReason)}` : ''}</span></div>
      <div class="cert-row-actions">${STATUS(c)}<a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Ver</a>
      ${c.status === 'valid' ? `<input class="input input-sm" placeholder="Motivo" maxlength="200" data-cert-admin-why="${esc(c.id)}">
        <button class="btn btn-danger btn-sm" type="button" data-cert-admin-revoke="${esc(c.id)}">Anular</button>` : ''}</div></li>`).join('')}</ul>`
      : '<p class="soft-text">No hay certificados que coincidan.</p>';
  }

  window.WKCert = { initPage, qrSvg, codeLabel, drawerSection, issueForm, companyList, profileSection, publicBlock, adminList };
}());
