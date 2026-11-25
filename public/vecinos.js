/* =====================================================================
   WorkUco · Changas de vecinos (pedidos de particulares)
   Usa los helpers de app.js (window.WK). Páginas: /vecinos y /vecinos/:id.
   El teléfono del vecino nunca se muestra; el de quien se ofrece lo ve
   sólo el vecino de ese pedido.
   ===================================================================== */
(function () {
  'use strict';
  const W = window.WK;
  const { $, $$, api, esc, toast, setFieldErrors, icon, state, timeAgo } = W;

  const CATS = [['jardin', 'Jardín y pasto'], ['limpieza', 'Limpieza y orden'], ['mudanza', 'Mudanzas y fletes'], ['arreglos', 'Arreglos de la casa'],
    ['pintura', 'Pintura'], ['mascotas', 'Mascotas'], ['otro', 'Otro']];
  const CAT_LABEL = Object.fromEntries(CATS);
  const LOCS = ['San Carlos', 'Tunuyán', 'Tupungato'];
  const STATE_LABEL = { pending: 'En revisión', approved: 'Publicado', rejected: 'No se publicó', resolved: 'Resuelto', expired: 'Vencido' };
  const isCand = () => !!(state.user && state.user.role === 'candidate');
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
  const whenText = (r) => r.whenNote || (r.whenDate ? fmtDay(r.whenDate) : 'A coordinar');
  const nextUrl = (hash) => `/acceder?rol=empleado&next=${encodeURIComponent(`${location.pathname}${hash || ''}`)}`;
  const registerUrl = (hash) => `/acceder?rol=empleado&modo=registro&next=${encodeURIComponent(`${location.pathname}${hash || ''}`)}`;

  function card(r) {
    return `<a class="vec-card" href="/vecinos/${esc(r.id)}">
      <div class="vec-top"><span class="vec-cat">${esc(r.categoryLabel)}</span><span class="vec-ago">${esc(timeAgo(r.approvedAt))}</span></div>
      <div class="vec-pay">${esc(r.payLabel)}</div>
      <h3 class="vec-title">${esc(r.title)}</h3>
      <div class="vec-where">${esc(r.ownerFirstName)} · ${esc(r.area ? `${r.area}, ${r.locality}` : r.locality)}</div>
      <dl class="vec-facts">
        <div><dt>Cuándo</dt><dd>${esc(whenText(r))}</dd></div>
        <div><dt>Interesados</dt><dd>${r.interestCount ? r.interestCount : 'Sé el primero'}</dd></div>
      </dl>
      <span class="vec-cta">Ver el pedido ${icon('arrow', 16)}</span>
    </a>`;
  }

  /* ---------------- /vecinos ---------------- */
  async function initList() {
    const list = $('#vec-list');
    let loc = ''; let cat = '';
    $('[data-vec-cats]').innerHTML = `<button class="chip-filter is-on" type="button" data-vec-cat="">Todos los rubros</button>${CATS.map(([id, l]) => `<button class="chip-filter" type="button" data-vec-cat="${id}">${esc(l)}</button>`).join('')}`;
    const load = async () => {
      try {
        const qs = new URLSearchParams();
        if (loc) qs.set('locality', loc);
        if (cat) qs.set('category', cat);
        const { requests, total } = await api(`/api/vecinos?${qs}`);
        $('[data-vec-count]').textContent = total === 1 ? '1 pedido abierto' : `${total} pedidos abiertos`;
        list.innerHTML = requests.length ? requests.map(card).join('')
          : `<div class="empty" style="grid-column:1/-1"><h3>No hay pedidos abiertos${loc ? ` en ${esc(loc)}` : ''}${cat ? ` de ${esc(CAT_LABEL[cat])}` : ''}</h3>
             <p>¿Necesitás una mano? Publicá el primero.</p><a class="btn btn-primary" href="#publicar">Publicar un pedido</a></div>`;
      } catch (err) {
        list.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No pudimos cargar los pedidos</h3><p>${esc(err.message)}</p></div>`;
      }
    };
    $$('[data-vec-loc]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-vec-loc]').forEach((x) => x.classList.toggle('is-on', x === b)); loc = b.dataset.vecLoc; load();
    }));
    $$('[data-vec-cat]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-vec-cat]').forEach((x) => x.classList.toggle('is-on', x === b)); cat = b.dataset.vecCat; load();
    }));
    paintForm();
    await Promise.all([load(), loadMine()]);
    if (location.hash) { const t = $(location.hash); if (t && !t.hidden) t.scrollIntoView(); }
  }

  function paintForm() {
    const slot = $('#vec-form-slot');
    const u = state.user;
    if (!u) {
      slot.innerHTML = `<div class="vec-gate"><h3>Ingresá para publicar</h3>
        <p class="soft-text">Usás la misma cuenta de WorkUco que para buscar trabajo. Si no tenés, la creás en un minuto.</p>
        <div class="gate-actions"><a class="btn btn-primary" href="${registerUrl('#publicar')}">Crear mi cuenta</a><a class="btn btn-outline" href="${nextUrl('#publicar')}">Ya tengo cuenta</a></div></div>`;
      return;
    }
    if (u.role !== 'candidate') {
      slot.innerHTML = `<div class="vec-gate"><h3>Los pedidos son de vecinos</h3>
        <p class="soft-text">Esta sección es para particulares. ${u.role === 'company' ? 'Si tu empresa busca gente por jornada, publicá una <a href="/publicar">changa</a>.' : ''}</p></div>`;
      return;
    }
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    slot.innerHTML = `<form class="vec-form" id="vec-form" novalidate>
      <div class="field"><label for="v-title">¿Qué necesitás?</label>
        <input class="input" id="v-title" name="title" maxlength="90" placeholder="Ej.: Cortar el pasto del fondo" required>
        <span class="error-text" data-error="title" hidden></span></div>
      <div class="field"><label>Rubro</label><div class="vec-cat-picks" role="radiogroup" aria-label="Rubro">
        ${CATS.map(([id, l]) => `<button class="vec-pick" type="button" role="radio" aria-checked="false" data-pick-cat="${id}">${esc(l)}</button>`).join('')}</div>
        <input type="hidden" name="category"><span class="error-text" data-error="category" hidden></span></div>
      <div class="row2">
        <div class="field"><label for="v-loc">Localidad</label>
          <select class="input" id="v-loc" name="locality"><option value="">Elegí…</option>${LOCS.map((l) => `<option${u.candidate && u.candidate.locality === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <span class="error-text" data-error="locality" hidden></span></div>
        <div class="field"><label for="v-area">Barrio o zona <span class="hint">(opcional, sin la dirección)</span></label>
          <input class="input" id="v-area" name="area" maxlength="40" placeholder="Ej.: Barrio Centro">
          <span class="error-text" data-error="area" hidden></span></div>
      </div>
      <div class="field"><label for="v-desc">Contá un poco más <span class="hint">(opcional)</span></label>
        <textarea class="input" id="v-desc" name="description" maxlength="600" placeholder="Ej.: Patio de 10 x 15. Tengo la máquina, falta quien la use. Unas 2 horas."></textarea>
        <span class="error-text" data-error="description" hidden></span></div>
      <div class="row2">
        <div class="field"><label for="v-date">¿Para cuándo? <span class="hint">(opcional)</span></label>
          <input class="input" id="v-date" name="whenDate" type="date" min="${today}">
          <span class="error-text" data-error="whenDate" hidden></span></div>
        <div class="field"><label for="v-note">O contalo con palabras</label>
          <input class="input" id="v-note" name="whenNote" maxlength="40" placeholder="Ej.: Este fin de semana">
          <span class="error-text" data-error="whenNote" hidden></span></div>
      </div>
      <div class="field"><label for="v-pay">¿Cuánto pagás? <span class="hint">(vacío = a convenir)</span></label>
        <div class="vec-pay-row"><input class="input" id="v-pay" name="pay" inputmode="numeric" placeholder="$ 15.000">
          <select class="input" name="payUnit" aria-label="Por"><option value="trabajo">por el trabajo</option><option value="hora">por hora</option><option value="dia">por día</option></select></div>
        <span class="error-text" data-error="pay" hidden></span></div>
      <p class="hint">No pongas teléfonos, mails ni links: los interesados te contactan por WorkUco.</p>
      <button class="btn btn-primary btn-lg" type="submit">Enviar a revisión</button>
    </form>`;
    const form = $('#vec-form');
    $$('[data-pick-cat]', form).forEach((b) => b.addEventListener('click', () => {
      $$('[data-pick-cat]', form).forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
      form.elements.category.value = b.dataset.pickCat;
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFieldErrors(form, null);
      const body = Object.fromEntries(new FormData(form).entries());
      const btn = $('button[type="submit"]', form); btn.disabled = true;
      try {
        const { request } = await api('/api/vecinos', { method: 'POST', body });
        slot.innerHTML = `<div class="vec-done"><div class="vec-done-icon">${icon('check', 30)}</div>
          <h3>¡Listo! Lo estamos revisando</h3><p class="soft-text">Te avisamos cuando "${esc(request.title)}" esté publicado y cada vez que alguien se ofrezca.</p>
          <a class="btn btn-outline" href="/vecinos/${esc(request.id)}">Ver mi pedido</a></div>`;
        loadMine();
      } catch (err) {
        btn.disabled = false;
        if (err.fields) setFieldErrors(form, err.fields);
        toast(err.message, 'err');
      }
    });
  }

  async function loadMine() {
    const sec = $('#mis-pedidos');
    if (!sec || !isCand()) return;
    try {
      const { requests, interests } = await api('/api/vecinos/mios');
      if (!requests.length && !interests.length) { sec.hidden = true; return; }
      sec.hidden = false;
      const row = (r, badge, sub) => `<div class="vec-row"><div><a href="/vecinos/${esc(r.id)}">${esc(r.title)}</a><p>${esc(sub)}</p></div>${badge}</div>`;
      $('#vec-mine').innerHTML = `
        ${requests.length ? `<div><h3>Lo que pediste</h3><div class="vec-mine-list">${requests.map((r) => row(r,
          `<span class="vec-state is-${esc(r.status)}">${esc(STATE_LABEL[r.status] || r.status)}</span>`,
          r.status === 'rejected' ? (r.rejectReason || 'No cumple las reglas de la sección') : `${r.interestCount === 1 ? '1 interesado' : `${r.interestCount} interesados`} · ${r.locality}`)).join('')}</div></div>` : ''}
        ${interests.length ? `<div><h3>Donde te ofreciste</h3><div class="vec-mine-list">${interests.map((r) => row(r,
          r.chosen ? '<span class="vec-state is-chosen">¡Te eligieron!</span>' : `<span class="vec-state is-${esc(r.status)}">${r.status === 'approved' ? 'Esperando' : esc(STATE_LABEL[r.status] || '')}</span>`,
          `${r.payLabel} · ${r.locality}`)).join('')}</div></div>` : ''}`;
    } catch (_) { sec.hidden = true; }
  }

  /* ---------------- /vecinos/:id ---------------- */
  async function initDetail() {
    const view = $('#pedido-view');
    const id = location.pathname.split('/').pop();
    let d;
    try { d = await api(`/api/vecinos/${encodeURIComponent(id)}`); } catch (err) {
      view.innerHTML = `<div class="empty"><h3>Este pedido ya no está publicado</h3><p>Puede que se haya resuelto o vencido.</p><a class="btn btn-primary" href="/vecinos">Ver otros pedidos</a></div>`;
      return;
    }
    const r = d.request;
    document.title = `${r.title} · Changas de vecinos · WorkUco`;
    $('[data-crumb]').textContent = r.title;
    const facts = `<dl class="vec-facts">
      <div><dt>Dónde</dt><dd>${esc(r.area ? `${r.area}, ${r.locality}` : r.locality)}</dd></div>
      <div><dt>Cuándo</dt><dd>${esc(whenText(r))}</dd></div>
      <div><dt>Pago</dt><dd>${esc(r.payLabel)}</dd></div>
      <div><dt>Pidió</dt><dd>${esc(r.ownerFirstName)}</dd></div>
    </dl>`;
    const main = `<article class="card vec-detail-main">
      <div class="vec-top"><span class="vec-cat">${esc(r.categoryLabel)}</span>${d.isOwner ? `<span class="vec-state is-${esc(r.status)}">${esc(STATE_LABEL[r.status] || '')}</span>` : `<span class="vec-ago">${esc(timeAgo(r.approvedAt))}</span>`}</div>
      <h1>${esc(r.title)}</h1>
      <div class="vec-pay">${esc(r.payLabel)}</div>
      ${r.description ? `<p class="vec-desc">${esc(r.description)}</p>` : ''}
      ${facts}
    </article>`;
    view.innerHTML = `<div class="vec-detail">${main}<aside class="vec-aside" id="vec-aside"></aside></div>`;
    if (d.isOwner) paintOwner(d); else paintHelper(d);
  }

  function paintHelper(d) {
    const r = d.request;
    const aside = $('#vec-aside');
    const tips = `<div class="card"><h2>Antes de ir</h2><p class="soft-text" style="margin:0">Coordiná todo por WhatsApp, pedí la dirección recién cuando estén de acuerdo y cobrá cuando el trabajo esté hecho.</p></div>`;
    if (!state.user) {
      aside.innerHTML = `<div class="card"><h2>¿Lo podés hacer?</h2><p class="soft-text">Ingresá con tu cuenta y tocá "Me interesa". ${esc(r.ownerFirstName)} ve tu perfil y te escribe por WhatsApp.</p>
        <div class="vec-person-actions"><a class="btn btn-primary" href="${registerUrl()}">Crear mi cuenta</a><a class="btn btn-outline" href="${nextUrl()}">Ingresar</a></div></div>${tips}`;
      return;
    }
    if (!isCand()) { aside.innerHTML = `<div class="card"><h2>Pedido de un vecino</h2><p class="soft-text" style="margin:0">Para ofrecerte, ingresá con una cuenta de persona.</p></div>`; return; }
    const mine = d.myInterest;
    if (mine) {
      aside.innerHTML = `<div class="card">${mine.chosen
        ? `<h2>¡Te eligieron!</h2><p class="soft-text">${esc(r.ownerFirstName)} te va a escribir por WhatsApp al número de tu perfil para coordinar.</p>`
        : `<h2>Ya te ofreciste</h2><p class="soft-text">${esc(r.ownerFirstName)} ve tu perfil y tu mensaje. Si te elige, te avisamos y te escribe por WhatsApp.</p>
           <button class="btn btn-outline btn-sm" type="button" data-unoffer>Ya no puedo</button>`}</div>${tips}`;
      const un = $('[data-unoffer]', aside);
      if (un) un.addEventListener('click', async () => {
        try { await api(`/api/vecinos/${r.id}/interes`, { method: 'DELETE' }); toast('Listo, te bajamos de este pedido', 'ok'); initDetail(); } catch (err) { toast(err.message, 'err'); }
      });
      return;
    }
    if (r.status !== 'approved') { aside.innerHTML = `<div class="card"><h2>Ya no recibe interesados</h2></div>`; return; }
    aside.innerHTML = `<div class="card"><h2>¿Lo podés hacer?</h2>
      <form id="vec-offer" novalidate>
        <div class="field"><label for="v-msg">Mensaje para ${esc(r.ownerFirstName)} <span class="hint">(opcional)</span></label>
          <textarea class="input" id="v-msg" name="message" maxlength="300" placeholder="Ej.: Tengo bordeadora y puedo el sábado a la mañana."></textarea>
          <span class="error-text" data-error="message" hidden></span></div>
        <button class="btn btn-primary" type="submit">Me interesa</button>
        <p class="hint" style="margin:10px 0 0">${esc(r.ownerFirstName)} va a ver tu nombre, tu perfil y tu WhatsApp para escribirte.</p>
      </form></div>${tips}`;
    const form = $('#vec-offer');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); setFieldErrors(form, null);
      try {
        await api(`/api/vecinos/${r.id}/interes`, { method: 'POST', body: { message: form.elements.message.value } });
        toast(`¡Listo! Le avisamos a ${r.ownerFirstName}`, 'ok'); initDetail();
      } catch (err) { if (err.fields) setFieldErrors(form, err.fields); toast(err.message, 'err'); }
    });
  }

  function paintOwner(d) {
    const r = d.request;
    const aside = $('#vec-aside');
    const people = d.interested || [];
    const status = r.status === 'pending' ? '<p class="soft-text">Lo estamos revisando. Te avisamos cuando esté publicado.</p>'
      : r.status === 'rejected' ? `<p class="soft-text">No se publicó: ${esc(r.rejectReason || 'no cumple las reglas de la sección')}.</p>`
        : r.status === 'resolved' ? '<p class="soft-text">Lo marcaste como resuelto. Ya no aparece en la lista.</p>'
          : r.status === 'expired' ? '<p class="soft-text">Venció. Si todavía lo necesitás, publicalo de nuevo.</p>' : '';
    const personHtml = (p) => `<div class="vec-person${p.chosen ? ' is-chosen' : ''}">
      <div class="vec-person-head"><span class="av">${esc(firstName(p.name).charAt(0).toUpperCase())}</span>
        <div><strong>${esc(p.name)}</strong><small>${esc([p.headline, p.locality].filter(Boolean).join(' · '))}</small></div></div>
      ${p.message ? `<p>“${esc(p.message)}”</p>` : ''}
      <div class="vec-person-actions">
        ${p.waUrl ? `<a class="btn btn-wa btn-sm" href="${esc(p.waUrl)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} Escribirle</a>` : `<span class="hint">Tel.: ${esc(p.phone)}</span>`}
        ${p.chosen ? '<span class="vec-state is-chosen">Elegido</span>' : (r.status === 'approved' ? `<button class="btn btn-outline btn-sm" type="button" data-choose="${esc(p.candidateId)}">Elegir</button>` : '')}
      </div></div>`;
    aside.innerHTML = `<div class="card"><h2>${people.length ? (people.length === 1 ? '1 persona se ofreció' : `${people.length} personas se ofrecieron`) : 'Todavía nadie se ofreció'}</h2>
        ${status}
        ${people.length ? `<div class="vec-people">${people.map(personHtml).join('')}</div>` : (r.status === 'approved' ? '<p class="soft-text" style="margin:0">Te avisamos apenas alguien toque "Me interesa".</p>' : '')}
      </div>
      <div class="card"><h2>Tu pedido</h2>
        <div class="vec-person-actions">
          ${['approved', 'pending', 'expired'].includes(r.status) ? '<button class="btn btn-primary btn-sm" type="button" data-resolve>Ya lo resolví</button>' : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-delete>Borrar pedido</button>
        </div>
        <p class="hint" style="margin:10px 0 0">Tu teléfono no se muestra: vos elegís a quién escribirle.</p></div>`;
    $$('[data-choose]', aside).forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/api/vecinos/${r.id}/elegir`, { method: 'POST', body: { candidateId: b.dataset.choose } }); toast('Le avisamos que lo elegiste. Escribile por WhatsApp para coordinar.', 'ok'); initDetail(); } catch (err) { toast(err.message, 'err'); }
    }));
    const res = $('[data-resolve]', aside);
    if (res) res.addEventListener('click', async () => {
      try { await api(`/api/vecinos/${r.id}/resuelto`, { method: 'POST' }); toast('¡Qué bueno! Lo sacamos de la lista', 'ok'); initDetail(); } catch (err) { toast(err.message, 'err'); }
    });
    const del = $('[data-delete]', aside);
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) { armed = true; del.textContent = 'Tocá de nuevo para borrarlo'; setTimeout(() => { armed = false; del.textContent = 'Borrar pedido'; }, 4000); return; }
      try { await api(`/api/vecinos/${r.id}`, { method: 'DELETE' }); location.href = '/vecinos#mis-pedidos'; } catch (err) { toast(err.message, 'err'); }
    });
  }

  window.WKVecinos = { initList, initDetail };
})();
