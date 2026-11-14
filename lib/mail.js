'use strict';
/* Envío de mails con Resend (https://resend.com/docs/api-reference/emails/send-email), sin dependencias.
   - RESEND_API_KEY: la clave de la API. Sin clave, los mails no se mandan (sólo se anotan en la consola).
   - WORKUCO_MAIL_FROM: remitente verificado, p. ej. "WorkUco <avisos@workuco.com.ar>".
   - WORKUCO_MAIL_FAKE=1: no sale nada a internet; cada mail se agrega a <data>/outbox.jsonl (pruebas). */
const fs = require('fs');

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Mail simple y legible en cualquier cliente: tablas, estilos en línea y versión de texto. */
function emailHtml({ title, body = '', cta = null, footer = '' }) {
  const paragraphs = String(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1c2822">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = cta ? `<p style="margin:22px 0 6px"><a href="${esc(cta.url)}" style="display:inline-block;background:#c8f560;color:#0b1612;font-weight:700;font-size:16px;text-decoration:none;padding:13px 22px;border-radius:999px">${esc(cta.label)}</a></p>
    <p style="margin:0 0 4px;font-size:12.5px;color:#56615a">Si el botón no funciona, copiá este link: <span style="word-break:break-all">${esc(cta.url)}</span></p>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f1e6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e6;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border-radius:16px;overflow:hidden">
    <tr><td style="background:#0b1612;padding:18px 24px;font-size:22px;font-weight:800;color:#f5f1e6;letter-spacing:-.5px">Work<span style="color:#c8f560">Uco</span></td></tr>
    <tr><td style="padding:26px 24px 22px">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0b1612">${esc(title)}</h1>
      ${paragraphs}${button}
    </td></tr>
    <tr><td style="padding:16px 24px 22px;border-top:1px solid #e3dbc9;font-size:12px;line-height:1.5;color:#56615a">${footer}</td></tr>
  </table>
</td></tr></table></body></html>`;
}

function emailText({ title, body = '', cta = null, footerText = '' }) {
  return [title, '', body, cta ? `\n${cta.label}: ${cta.url}` : '', footerText ? `\n--\n${footerText}` : ''].join('\n').trim();
}

function createMailer({ apiKey = '', from = '', replyTo = '', fakeFile = '', fetchImpl = globalThis.fetch } = {}) {
  const mode = fakeFile ? 'fake' : apiKey ? 'resend' : 'off';
  async function send({ to, subject, html, text }) {
    if (!to || !subject) return { ok: false, error: 'faltan datos' };
    if (mode === 'fake') {
      fs.appendFileSync(fakeFile, `${JSON.stringify({ to, from, subject, html, text, at: Date.now() })}\n`);
      return { ok: true, id: 'fake' };
    }
    if (mode === 'off') {
      console.log(`[mail desactivado] para ${to}: ${subject}`);
      return { ok: false, error: 'sin RESEND_API_KEY' };
    }
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { console.warn(`Mail a ${to} falló (${res.status}): ${data.message || data.error || ''}`); return { ok: false, error: data.message || String(res.status) }; }
      return { ok: true, id: data.id };
    } catch (e) {
      console.warn(`Mail a ${to} falló: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }
  return { mode, send };
}

module.exports = { createMailer, emailHtml, emailText, esc };
