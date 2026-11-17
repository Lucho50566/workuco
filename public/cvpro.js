/* WorkUco — CV Pro ("Mejorá tu CV con IA"): subir → análisis gratis → vista previa → pago → CV completo. */
(function () {
  'use strict';
  const W = window.WK;
  const { $, $$, api, esc, toast, icon } = W;

  const DESIGNS = [
    ['clasico', 'Clásico'], ['moderno', 'Moderno'], ['campo', 'Campo y oficios'],
    ['servicio', 'Atención al público'], ['creativo', 'Creativo'], ['primer-empleo', 'Primer empleo'],
  ];
  const ACCENTS = { verde: '#0a8263', malbec: '#7a1f4d', azul: '#1f4e79', terracota: '#b5521b', grafito: '#2d2d2d', uva: '#5b4fa3' };
  const LOCK = '▇▇▇▇▇▇▇▇▇▇▇▇';
  const MAX_VERSIONS = 3;
  /* campos que se pueden completar cuando el análisis marca que faltan */
  const FIELDS = {
    contacto: ['Contacto', 'Teléfono, mail y localidad', 'input'],
    titular: ['Puesto que buscás', 'Ej.: Encargado de viñedo, Moza, Administrativa', 'input'],
    resumen: ['Contanos de vos', 'En 2 o 3 líneas: qué sabés hacer y qué buscás', 'textarea'],
    experiencia: ['Experiencia que no aparece', 'Empresa, cargo y qué hacías', 'textarea'],
    fechas: ['Fechas de tus trabajos', 'Ej.: Finca Los Nogales, mar 2021 a dic 2024', 'textarea'],
    logros: ['Logros concretos', 'Ej.: Coordiné una cuadrilla de 8 personas en la cosecha', 'textarea'],
    estudios: ['Estudios', 'Institución, título y año', 'textarea'],
    habilidades: ['Habilidades', 'Ej.: Poda, riego por goteo, Excel, atención al cliente', 'input'],
    idiomas: ['Idiomas', 'Ej.: Inglés intermedio', 'input'],
    movilidad: ['Carnet o movilidad', 'Ej.: Carnet B1, moto propia', 'input'],
    disponibilidad: ['Disponibilidad', 'Ej.: Lunes a sábado, temporada de cosecha', 'input'],
    referencias: ['Referencias', 'Nombre y teléfono, o "a disposición"', 'input'],
  };
  const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  const root = () => $('#cvp-root');
  let meta = null;

  /* ---------- render del CV (los 6 diseños comparten el marcado; el CSS hace la diferencia) ---------- */
  const SIDE = ['habilidades', 'idiomas', 'disponibilidad'];
  function sectionHtml(s, cv) {
    const h = (t) => `<h3 class="cvp-h">${t}</h3>`;
    const bullet = (b) => (b === LOCK ? '<li class="cvp-lock"><span></span></li>' : `<li>${esc(b)}</li>`);
    switch (s) {
      case 'resumen': return cv.summary ? `<section class="cvp-sec cvp-sum">${h('Perfil')}<p>${esc(cv.summary)}</p></section>` : '';
      case 'experiencia': return cv.experience.length ? `<section class="cvp-sec">${h('Experiencia')}${cv.experience.map((e) => `<div class="cvp-item">
          <div class="cvp-item-top"><strong>${esc(e.role || e.company)}</strong>${e.from || e.to ? `<span class="cvp-date">${esc([e.from, e.to].filter(Boolean).join(' – '))}</span>` : ''}</div>
          ${e.role && e.company ? `<div class="cvp-org">${esc(e.company)}</div>` : ''}
          ${e.bullets.length ? `<ul>${e.bullets.map(bullet).join('')}</ul>` : ''}</div>`).join('')}</section>` : '';
      case 'estudios': return cv.education.length ? `<section class="cvp-sec">${h('Estudios')}${cv.education.map((e) => `<div class="cvp-item">
          <div class="cvp-item-top"><strong>${esc(e.title || e.institution)}</strong>${e.year ? `<span class="cvp-date">${esc(e.year)}</span>` : ''}</div>
          ${e.title ? `<div class="cvp-org">${esc(e.institution)}</div>` : ''}</div>`).join('')}${cv.locked ? '<p class="cvp-lock-line"></p>' : ''}</section>` : '';
      case 'habilidades': return cv.skills.length ? `<section class="cvp-sec">${h('Habilidades')}<div class="cvp-tags">${cv.skills.map((x) => `<span>${esc(x)}</span>`).join('')}${cv.locked ? '<span class="cvp-lock-tag"></span><span class="cvp-lock-tag"></span>' : ''}</div></section>` : '';
      case 'idiomas': return cv.languages.length ? `<section class="cvp-sec">${h('Idiomas')}<ul class="cvp-plain">${cv.languages.map((l) => `<li><b>${esc(l.name)}</b>${l.level ? ` · ${esc(l.level)}` : ''}</li>`).join('')}</ul></section>` : '';
      case 'cursos': return cv.courses.length ? `<section class="cvp-sec">${h('Cursos')}<ul>${cv.courses.map(bullet).join('')}</ul></section>` : '';
      case 'logros': return cv.achievements.length ? `<section class="cvp-sec">${h('Logros')}<ul>${cv.achievements.map(bullet).join('')}</ul></section>` : '';
      case 'voluntariado': return cv.volunteering.length ? `<section class="cvp-sec">${h('Voluntariado')}<ul>${cv.volunteering.map(bullet).join('')}</ul></section>` : '';
      case 'disponibilidad': return cv.availability ? `<section class="cvp-sec">${h('Disponibilidad')}<p>${esc(cv.availability)}</p></section>` : '';
      case 'referencias': return cv.references ? `<section class="cvp-sec">${h('Referencias')}<p>${esc(cv.references)}</p></section>` : '';
      default: return '';
    }
  }
  function cvHtml(cv) {
    const c = cv.contact || {};
    const contact = [c.phone, c.email, c.locality, c.extra].filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('');
    const main = cv.sections.filter((s) => !SIDE.includes(s)).map((s) => sectionHtml(s, cv)).join('');
    const side = cv.sections.filter((s) => SIDE.includes(s)).map((s) => sectionHtml(s, cv)).join('');
    return `<article class="cvp-sheet" data-design="${esc(cv.design)}" style="--cvp-accent:${ACCENTS[cv.accent] || ACCENTS.verde}">
      ${cv.locked ? '<div class="cvp-water" aria-hidden="true"><span>Vista previa · WorkUco</span><span>Vista previa · WorkUco</span><span>Vista previa · WorkUco</span></div>' : ''}
      <header class="cvp-head">
        <h2 class="cvp-name">${esc(cv.name || 'Tu nombre')}</h2>
        ${cv.headline ? `<p class="cvp-title">${esc(cv.headline)}</p>` : ''}
        ${contact ? `<ul class="cvp-contact">${contact}</ul>` : ''}
      </header>
      <div class="cvp-cols">
        <div class="cvp-main">${main}</div>
        ${side ? `<aside class="cvp-side">${side}</aside>` : ''}
      </div>
    </article>`;
  }

  /* si el contenido no entra en una hoja A4, se compacta en dos pasos (letra y espacios más chicos) */
  function fitSheet(sheet) {
    if (!sheet) return;
    const zoom = sheet.style.zoom;
    sheet.style.zoom = '1';
    sheet.classList.remove('is-dense', 'is-denser');
    const limit = 297 * (96 / 25.4);
    const over = () => sheet.scrollHeight > limit + 2;
    if (over()) sheet.classList.add('is-dense');
    if (over()) { sheet.classList.remove('is-dense'); sheet.classList.add('is-denser'); }
    sheet.style.zoom = zoom;
    scaleSheet(sheet);
  }
  /* en pantalla la hoja A4 se muestra a escala para que entre en el ancho disponible (al imprimir va a tamaño real) */
  function scaleSheet(sheet) {
    const stage = sheet && sheet.parentElement;
    if (!stage) return;
    const cs = getComputedStyle(stage);
    const room = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    sheet.style.zoom = String(Math.min(1, room / (210 * (96 / 25.4))));
  }
  window.addEventListener('resize', () => { const sh = document.querySelector('.cvp-stage .cvp-sheet'); if (sh) scaleSheet(sh); });

  /* ---------- pantallas ---------- */
  function gate(title, text, cta) {
    root().innerHTML = `<div class="card cvp-gate"><h2>${title}</h2><p>${text}</p>${cta || ''}</div>`;
  }

  async function listAndStart() {
    let orders = [];
    try { ({ orders } = await api('/api/cvpro')); } catch (_) { /* sigue */ }
    root().innerHTML = `
      ${orders.length ? `<div class="cvp-mine"><h2>Mis CV</h2><div class="cvp-mine-list">${orders.map((o) => `<a class="cvp-mine-item" href="/cv-pro/${esc(o.id)}">
        <span class="cvp-mine-dot" style="background:${o.cv ? ACCENTS[o.cv.accent] || ACCENTS.verde : '#ccc'}"></span>
        <span><strong>${o.status === 'pagado' ? 'CV Pro listo' : o.status === 'generado' ? 'Vista previa' : 'Analizado'}</strong>
        <small>${W.fmtDate(o.createdAt)} · ${o.analysis ? `${o.analysis.score}/100` : ''}</small></span>
        <span class="badge ${o.status === 'pagado' ? 'badge-green' : ''}">${o.status === 'pagado' ? 'Pago' : 'Seguir'}</span></a>`).join('')}</div></div>` : ''}
      <form class="card cvp-upload" id="cvp-form">
        <h2>Empecemos por tu CV</h2>
        <p class="soft-text">Elegí cómo cargarlo. El análisis es gratis.</p>
        <div class="cvp-src" role="radiogroup" aria-label="Cómo cargar tu CV">
          <label class="cvp-src-opt"><input type="radio" name="src" value="pdf" checked><span>${icon('file', 20)}<b>Subir PDF</b><small>El que exportaste de Word o Canva</small></span></label>
          <label class="cvp-src-opt"><input type="radio" name="src" value="fotos"><span>${icon('camera', 20)}<b>Sacarle fotos</b><small>Hasta 3, si lo tenés impreso</small></span></label>
          <label class="cvp-src-opt"><input type="radio" name="src" value="perfil"><span>${icon('user', 20)}<b>Usar mi perfil</b><small>Lo que cargaste en WorkUco</small></span></label>
        </div>
        <div class="cvp-file" data-for="pdf"><input class="input" type="file" id="cvp-pdf" accept="application/pdf,.pdf"></div>
        <div class="cvp-file" data-for="fotos" hidden><input class="input" type="file" id="cvp-photos" accept="image/*" multiple></div>
        <label class="cvp-consent"><input type="checkbox" id="cvp-consent"> <span>Acepto que el contenido de mi CV se procese con inteligencia artificial para analizarlo y mejorarlo. El archivo no se guarda. <a class="link-inline" href="/privacidad" target="_blank" rel="noopener">Privacidad</a></span></label>
        <button class="btn btn-primary btn-lg" type="submit" id="cvp-go">${icon('sparkles', 18)} Analizar gratis</button>
        <p class="cvp-price-note">Después del análisis ves una vista previa sin cargo. El CV completo cuesta <strong>${money(meta.cvPro.price)}</strong>.</p>
      </form>`;
    const form = $('#cvp-form');
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'src') return;
      $$('.cvp-file', form).forEach((f) => { f.hidden = f.dataset.for !== e.target.value; });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const src = form.querySelector('input[name=src]:checked').value;
      if (!$('#cvp-consent').checked) { toast('Para seguir, aceptá el uso de IA', 'err'); return; }
      const body = { source: src, consent: true };
      try {
        if (src === 'pdf') {
          const f = $('#cvp-pdf').files[0];
          if (!f) { toast('Elegí el PDF de tu CV', 'err'); return; }
          if (f.size > 5 * 1024 * 1024) { toast('El PDF supera los 5 MB', 'err'); return; }
          body.pdf = { name: f.name, data: await W.fileToBase64(f) };
        } else if (src === 'fotos') {
          const fs = [...$('#cvp-photos').files].slice(0, 3);
          if (!fs.length) { toast('Elegí al menos una foto', 'err'); return; }
          body.photos = await Promise.all(fs.map((f) => W.shrinkImage(f, 1800, 0.88)));
        }
      } catch (_) { toast('No pudimos leer el archivo', 'err'); return; }
      const btn = $('#cvp-go');
      btn.disabled = true; btn.innerHTML = '<span class="cvp-spin"></span> Analizando tu CV…';
      try {
        const { order } = await api('/api/cvpro/analyze', { method: 'POST', body });
        history.pushState(null, '', `/cv-pro/${order.id}`);
        renderOrder(order);
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.innerHTML = `${icon('sparkles', 18)} Analizar gratis`; }
    });
  }

  const STATUS_ICON = { ok: ['check', 'is-ok', 'Bien'], mejorable: ['clock', 'is-warn', 'Mejorable'], falta: ['x', 'is-miss', 'Falta'] };
  function analysisHtml(a, { compact = false } = {}) {
    const deg = Math.round((a.score / 100) * 360);
    return `<div class="card cvp-analysis${compact ? ' is-compact' : ''}">
      <div class="cvp-score" style="--deg:${deg}deg"><b>${a.score}</b><small>/100</small></div>
      <div class="cvp-analysis-txt">
        <h2>${a.score >= 75 ? 'Tu CV está bien, y puede estar mejor' : a.score >= 50 ? 'Buen punto de partida' : 'A tu CV le faltan cosas importantes'}</h2>
        ${a.rubro ? `<p class="soft-text">Rubro: <strong>${esc(a.rubro)}</strong></p>` : ''}
        ${a.strengths.length ? `<p class="cvp-good">${icon('check', 15)} ${a.strengths.map(esc).join(' · ')}</p>` : ''}
      </div>
      ${compact ? '' : `<ul class="cvp-checks">${a.checks.map((c) => { const s = STATUS_ICON[c.status]; return `<li class="${s[1]}">
        <span class="cvp-ck">${icon(s[0], 14)}</span><span><b>${esc(c.label)}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span><em>${s[2]}</em></li>`; }).join('')}</ul>
      ${a.suggestions.length ? `<div class="cvp-sugs"><h3>Sugerencias</h3><ul>${a.suggestions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`}
    </div>`;
  }

  function stylePicker(cv) {
    return `<div class="cvp-style">
      <div><span class="cvp-lbl">Diseño</span><div class="cvp-designs">${DESIGNS.map(([id, label]) => `<button type="button" class="cvp-chip${cv.design === id ? ' is-on' : ''}" data-design="${id}">${label}</button>`).join('')}</div></div>
      <div><span class="cvp-lbl">Color</span><div class="cvp-accents">${Object.entries(ACCENTS).map(([id, hex]) => `<button type="button" class="cvp-dot${cv.accent === id ? ' is-on' : ''}" data-accent="${id}" style="background:${hex}" aria-label="Color ${id}"></button>`).join('')}</div></div>
    </div>`;
  }

  function renderOrder(o) {
    /* dentro de un CV la portada se achica: lo importante es el CV */
    document.body.classList.add('cvp-in-order');
    const a = o.analysis;
    if (o.status === 'analizado') {
      const missing = a.checks.filter((c) => c.status !== 'ok' && FIELDS[c.id]);
      root().innerHTML = `${analysisHtml(a)}
        <form class="card cvp-complete" id="cvp-gen">
          <h2>${missing.length ? 'Completá lo que falta' : 'Todo listo'}</h2>
          <p class="soft-text">${missing.length ? 'Es opcional, pero cuanto más nos contés, mejor queda. No inventamos nada: sólo usamos lo que vos nos das.' : 'Tu CV tiene lo principal. Armemos la versión profesional.'}</p>
          <div class="cvp-fields">${missing.map((c) => { const f = FIELDS[c.id]; return `<label class="field"><span>${f[0]}</span>${f[2] === 'textarea'
            ? `<textarea class="input" rows="3" maxlength="500" data-in="${c.id}" placeholder="${esc(f[1])}"></textarea>`
            : `<input class="input" maxlength="300" data-in="${c.id}" placeholder="${esc(f[1])}">`}</label>`; }).join('')}</div>
          <label class="field"><span>¿Algún pedido? <small>(opcional)</small></span><input class="input" id="cvp-req" maxlength="300" placeholder="Ej.: orientalo a gastronomía, que sea sobrio"></label>
          <button class="btn btn-primary btn-lg" type="submit" id="cvp-gen-btn">${icon('sparkles', 18)} Armar mi CV</button>
        </form>`;
      $('#cvp-gen').addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = {};
        $$('[data-in]').forEach((i) => { if (i.value.trim()) inputs[i.dataset.in] = i.value.trim(); });
        await generate(o, { inputs, request: $('#cvp-req').value.trim() }, $('#cvp-gen-btn'));
      });
      return;
    }
    const paid = o.status === 'pagado';
    const left = MAX_VERSIONS - o.versions;
    root().innerHTML = `<div class="cvp-result">
      <div class="cvp-stage">${cvHtml(o.cv)}</div>
      <aside class="cvp-panel no-print">
        ${paid ? `<div class="card cvp-paid"><span class="cvp-kicker is-dark">${icon('check', 14)} CV Pro</span><h2>¡Tu CV está listo!</h2>
            <button class="btn btn-primary btn-lg" type="button" data-print>${icon('file', 18)} Descargar PDF</button>
            <p class="cvp-hint">En la ventana que se abre elegí <strong>“Guardar como PDF”</strong>, tamaño A4.</p></div>`
          : `<div class="card cvp-buy"><span class="cvp-kicker is-dark">Vista previa</span><h2>Así queda tu CV</h2>
            <p class="soft-text">Parte del contenido está oculto. Pagando ves y descargás el CV completo, y podés reescribirlo con IA hasta 3 veces.</p>
            ${meta.cvPro.canPay ? `<button class="btn btn-lime btn-lg cvp-pay" type="button" id="cvp-pay">Pagar ${money(o.price)} con Mercado Pago</button>`
              : '<p class="cvp-soon">El pago en línea se habilita muy pronto. Tu vista previa queda guardada.</p>'}</div>`}
        <div class="card">${stylePicker(o.cv)}</div>
        <form class="card cvp-again" id="cvp-again">
          <h3>${paid ? `Reescribir con IA <small>(${o.rewritesLeft} de 3)</small>` : `Otra versión <small>(te quedan ${left})</small>`}</h3>
          <input class="input" id="cvp-req2" maxlength="300" placeholder="${paid ? 'Ej.: orientalo a turismo' : 'Ej.: más corto, más formal'}">
          <button class="btn btn-outline" type="submit" ${(paid ? o.rewritesLeft : left) <= 0 ? 'disabled' : ''}>${icon('wand', 16)} ${paid ? 'Reescribir' : 'Generar otra'}</button>
        </form>
        ${analysisHtml(a, { compact: true })}
      </aside>
    </div>`;
    fitSheet($('.cvp-sheet'));
    const pr = $('[data-print]');
    if (pr) pr.addEventListener('click', () => window.print());
    $('.cvp-style').addEventListener('click', async (e) => {
      const d = e.target.closest('[data-design]'); const c = e.target.closest('[data-accent]');
      if (!d && !c) return;
      try {
        const { order } = await api(`/api/cvpro/${o.id}/style`, { method: 'PATCH', body: d ? { design: d.dataset.design } : { accent: c.dataset.accent } });
        renderOrder(order);
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#cvp-again').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      if (paid) await rewrite(o, $('#cvp-req2').value.trim(), btn);
      else await generate(o, { request: $('#cvp-req2').value.trim() }, btn);
    });
    const pay = $('#cvp-pay');
    if (pay) pay.addEventListener('click', async () => {
      pay.disabled = true; pay.textContent = 'Abriendo Mercado Pago…';
      try { const r = await api(`/api/cvpro/${o.id}/checkout`, { method: 'POST' }); location.href = r.url; }
      catch (err) { toast(err.message, 'err'); pay.disabled = false; pay.textContent = `Pagar ${money(o.price)} con Mercado Pago`; }
    });
  }

  async function generate(o, body, btn) {
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="cvp-spin"></span> Escribiendo tu CV…';
    try { const { order } = await api(`/api/cvpro/${o.id}/generate`, { method: 'POST', body }); renderOrder(order); window.scrollTo({ top: $('#cvp-root').offsetTop - 80, behavior: 'smooth' }); }
    catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.innerHTML = label; }
  }
  async function rewrite(o, request, btn) {
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="cvp-spin"></span> Reescribiendo…';
    try { const { order } = await api(`/api/cvpro/${o.id}/rewrite`, { method: 'POST', body: { request } }); renderOrder(order); toast('Listo: nueva versión', 'ok'); }
    catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.innerHTML = label; }
  }

  async function init() {
    /* app.js crea WK.ready al cargar la página: se espera a que exista y a que traiga la sesión */
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    await W.ready;
    meta = await W.loadMeta();
    const u = W.state.user;
    if (!meta.cvPro || !meta.cvPro.enabled) { gate('Muy pronto', 'El servicio de CV con IA todavía no está disponible. Mientras tanto podés armar tu CV gratis desde tu perfil.', '<a class="btn btn-primary" href="/mi-perfil">Ir a mi perfil</a>'); return; }
    if (!u || u.role !== 'candidate') {
      gate(u ? 'Es para personas que buscan trabajo' : 'Ingresá para empezar',
        u ? 'Entrá con tu cuenta de persona para mejorar tu CV.' : 'Necesitás una cuenta de persona (es gratis) para guardar tu CV y tu análisis.',
        u ? '' : `<div class="gate-actions"><a class="btn btn-primary" href="/acceder?rol=empleado&next=${encodeURIComponent(location.pathname)}">Ingresar</a><a class="btn btn-outline" href="/acceder?rol=empleado&modo=registro&next=${encodeURIComponent(location.pathname)}">Crear cuenta</a></div>`);
      return;
    }
    const id = (location.pathname.match(/^\/cv-pro\/(cv[a-f0-9]{16})$/) || [])[1];
    if (!id) { await listAndStart(); return; }
    /* vuelta desde Mercado Pago */
    const q = new URLSearchParams(location.search);
    if (q.get('pago')) {
      const pid = q.get('payment_id') || q.get('collection_id') || '';
      history.replaceState(null, '', `/cv-pro/${id}`);
      if (q.get('pago') === 'error') toast('El pago no se completó. Podés intentarlo de nuevo.', 'err');
      else if (/^\d{1,20}$/.test(pid)) {
        try { const r = await api('/api/cvpro/payments/confirm', { method: 'POST', body: { paymentId: pid } }); toast(r.status === 'approved' ? '¡Pago aprobado! Tu CV está listo.' : 'Tu pago está en proceso: el CV se habilita solo cuando se apruebe.', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
      } else toast('Tu pago está en proceso: el CV se habilita solo cuando se apruebe.', 'ok');
    }
    try { const { order } = await api(`/api/cvpro/${id}`); renderOrder(order); }
    catch (err) { gate('No encontramos ese CV', err.message, '<a class="btn btn-primary" href="/cv-pro">Ver mis CV</a>'); }
  }
  window.WKCvPro = { cvHtml, fitSheet }; // para revisar los diseños
  window.addEventListener('popstate', () => location.reload());
  init().catch((e) => { console.error(e); toast(e.message || 'Ocurrió un error', 'err'); });
}());
