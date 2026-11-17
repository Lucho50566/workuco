/**
 * Mercado Pago (Checkout Pro), sin dependencias.
 * La clave (Access Token de producción, "APP_USR-…") la carga el dueño en el servidor: WORKUCO_MP_TOKEN.
 * Seguridad: un aviso de pago (webhook) nunca se cree tal cual; siempre se consulta el pago a Mercado Pago
 * con nuestra clave y se controla referencia, estado, moneda y monto. Además, con WORKUCO_MP_WEBHOOK_SECRET
 * (la "clave secreta" de Webhooks en el panel de Mercado Pago) se verifica la firma x-signature de cada aviso.
 */
'use strict';

const crypto = require('crypto');

const TOKEN = String(process.env.WORKUCO_MP_TOKEN || '').trim();
const API = String(process.env.WORKUCO_MP_API || 'https://api.mercadopago.com').replace(/\/+$/, '');
const WEBHOOK_SECRET = String(process.env.WORKUCO_MP_WEBHOOK_SECRET || '').trim();

const connected = () => !!TOKEN;
const hasWebhookSecret = () => !!WEBHOOK_SECRET;

/** Mercado Pago sólo acepta la vuelta automática (auto_return) con un sitio público https (no localhost). */
function isPublicHttps(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(u.hostname) && !u.hostname.endsWith('.localhost');
  } catch (_) { return false; }
}

/**
 * Firma de los avisos: x-signature = "ts=<ts>,v1=<hmac>", con
 * hmac = HMAC-SHA256(secreto, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;") en hexadecimal.
 * Sin secreto configurado devuelve true (el pago igual se consulta a Mercado Pago antes de aplicarlo).
 */
function verifySignature(headers, dataId) {
  if (!WEBHOOK_SECRET) return true;
  const sig = String(headers['x-signature'] || '');
  const requestId = String(headers['x-request-id'] || '');
  const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=').map((x) => x.trim())).filter((kv) => kv.length === 2));
  const { ts, v1 } = parts;
  if (!ts || !v1 || !requestId || !dataId) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : String(dataId);
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

async function call(method, path, body, idempotencyKey) {
  if (!TOKEN) throw new Error('Mercado Pago no está configurado');
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok) {
      const e = new Error(`Mercado Pago respondió ${res.status}${data.message ? `: ${data.message}` : ''}`);
      e.status = res.status;
      throw e;
    }
    return data;
  } finally { clearTimeout(t); }
}

/** Crea la "preferencia" (el link de pago). returnPath: a dónde vuelve la persona. Devuelve { id, url }. */
async function createPreference({ reference, title, amount, publicUrl, returnPath = '/panel' }) {
  const back = `${publicUrl}${returnPath}`;
  const pref = await call('POST', '/checkout/preferences', {
    items: [{ id: reference, title, quantity: 1, unit_price: amount, currency_id: 'ARS' }],
    external_reference: reference,
    notification_url: `${publicUrl}/api/mp/webhook`,
    back_urls: {
      success: `${back}?pago=ok`,
      pending: `${back}?pago=pendiente`,
      failure: `${back}?pago=error`,
    },
    /* la vuelta automática sólo con un sitio público (https://workuco.com.ar): con localhost o 127.0.0.1
       Mercado Pago rechaza la preferencia, así que ahí se omite */
    ...(isPublicHttps(publicUrl) ? { auto_return: 'approved' } : {}),
    statement_descriptor: 'WORKUCO',
  }, reference);
  return { id: pref.id, url: pref.init_point };
}

/** Consulta un pago por su número. */
async function getPayment(id) {
  if (!/^\d{1,20}$/.test(String(id))) throw Object.assign(new Error('Número de pago inválido'), { status: 400 });
  return call('GET', `/v1/payments/${id}`);
}

module.exports = { connected, hasWebhookSecret, isPublicHttps, verifySignature, createPreference, getPayment };
