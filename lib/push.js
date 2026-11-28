'use strict';
/* Notificaciones en el celular (Web Push), sin dependencias.
   - Claves VAPID propias del servidor (RFC 8292): se crean una vez y se guardan en <data>/vapid.json
     (o vienen de WORKUCO_VAPID_PUBLIC / WORKUCO_VAPID_PRIVATE). Nunca van al repositorio.
   - El contenido viaja cifrado de punta a punta (RFC 8291, aes128gcm): el servicio de push del
     navegador (Google, Apple, Mozilla, Microsoft) no puede leerlo.
   - Sólo se manda a servicios de push conocidos: el servidor nunca hace pedidos a una dirección cualquiera. */
const crypto = require('crypto');
const fs = require('fs');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

/* servicios de push de los navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge/Windows) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
function validEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
      && PUSH_HOSTS.some((re) => re.test(u.hostname)) && String(endpoint).length <= 1000;
  } catch (_) { return false; }
}
/* lo que manda el navegador al suscribirse: { endpoint, keys: { p256dh, auth } } */
function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = String(sub.endpoint || '');
  const p256dh = String((sub.keys && sub.keys.p256dh) || '');
  const auth = String((sub.keys && sub.keys.auth) || '');
  if (!validEndpoint(endpoint)) return null;
  const pk = fromB64u(p256dh); const au = fromB64u(auth);
  if (pk.length !== 65 || pk[0] !== 4 || au.length !== 16) return null;
  return { endpoint, p256dh: b64u(pk), auth: b64u(au) };
}

function newVapid() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(pub.x), fromB64u(pub.y)])), privateJwk: jwk };
}
/* claves del servidor: de las variables de entorno, del archivo, o nuevas (y se guardan) */
function loadVapid({ file, publicKey, privateKey } = {}) {
  if (publicKey && privateKey) {
    const pub = fromB64u(publicKey);
    return { publicKey: b64u(pub), privateJwk: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(fromB64u(privateKey)) } };
  }
  if (file) {
    try { const k = JSON.parse(fs.readFileSync(file, 'utf8')); if (k.publicKey && k.privateJwk) return k; } catch (_) {}
    const k = newVapid();
    try { fs.writeFileSync(file, JSON.stringify(k), { mode: 0o600 }); } catch (e) { console.warn('No se pudieron guardar las claves de push:', e.message); }
    return k;
  }
  return newVapid();
}

/* firma VAPID (JWT ES256) para el servicio de push del endpoint */
function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: vapid.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
/* RFC 8291: cifra el contenido para una suscripción (un solo registro aes128gcm) */
function encrypt(payload, sub, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  const local = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) local.generateKeys();
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = último registro
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

function createPusher({ vapid, subject, fetchImpl = globalThis.fetch, fakeFile = '' } = {}) {
  /* manda un aviso a una suscripción. Resuelve { ok, gone } — gone: la suscripción ya no existe (borrarla) */
  async function send(sub, message, { ttl = 86400, urgency = 'normal' } = {}) {
    const payload = JSON.stringify(message).slice(0, 3000);
    if (fakeFile) { fs.appendFileSync(fakeFile, `${JSON.stringify({ endpoint: sub.endpoint, message, at: Date.now() })}\n`); return { ok: true, gone: false }; }
    if (!validEndpoint(sub.endpoint)) return { ok: false, gone: true };
    try {
      const res = await fetchImpl(sub.endpoint, {
        method: 'POST',
        headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: vapidHeader(sub.endpoint, vapid, subject) },
        body: encrypt(payload, sub),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
      if (!res.ok) { console.warn(`Push falló (${res.status}) en ${new URL(sub.endpoint).hostname}`); return { ok: false, gone: false }; }
      return { ok: true, gone: false };
    } catch (e) {
      console.warn(`Push falló: ${e.message}`);
      return { ok: false, gone: false };
    }
  }
  return { publicKey: vapid.publicKey, send };
}

module.exports = { createPusher, loadVapid, cleanSubscription, validEndpoint, encrypt, vapidHeader, b64u, fromB64u };
