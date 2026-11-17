/**
 * Mercado Pago (Checkout Pro), sin dependencias.
 * La clave (Access Token de producción, "APP_USR-…") la carga el dueño en el servidor: WORKUCO_MP_TOKEN.
 * Seguridad: un aviso de pago (webhook) nunca se cree tal cual; siempre se consulta el pago a Mercado Pago
 * con nuestra clave y se controla referencia, estado, moneda y monto.
 */
'use strict';

const TOKEN = String(process.env.WORKUCO_MP_TOKEN || '').trim();
const API = String(process.env.WORKUCO_MP_API || 'https://api.mercadopago.com').replace(/\/+$/, '');

const connected = () => !!TOKEN;

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

/** Crea la "preferencia" (el link de pago). Devuelve { id, url }. */
async function createPreference({ reference, title, amount, publicUrl }) {
  const pref = await call('POST', '/checkout/preferences', {
    items: [{ id: reference, title, quantity: 1, unit_price: amount, currency_id: 'ARS' }],
    external_reference: reference,
    notification_url: `${publicUrl}/api/mp/webhook`,
    back_urls: {
      success: `${publicUrl}/panel?pago=ok`,
      pending: `${publicUrl}/panel?pago=pendiente`,
      failure: `${publicUrl}/panel?pago=error`,
    },
    auto_return: 'approved',
    statement_descriptor: 'WORKUCO',
  }, reference);
  return { id: pref.id, url: pref.init_point };
}

/** Consulta un pago por su número. */
async function getPayment(id) {
  if (!/^\d{1,20}$/.test(String(id))) throw Object.assign(new Error('Número de pago inválido'), { status: 400 });
  return call('GET', `/v1/payments/${id}`);
}

module.exports = { connected, createPreference, getPayment };
