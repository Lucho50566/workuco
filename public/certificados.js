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
    const raw = decodeURIComponent(location.pathname.split('/').pop() || '');
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

  window.WKCert = { initPage, qrSvg, codeLabel };
}());
