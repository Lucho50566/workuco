'use strict';
/* Pruebas del motor de notificaciones en el celular (lib/push.js): cifrado RFC 8291, firma VAPID y filtros. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const push = require('../lib/push');
const { b64u, fromB64u } = push;

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

/* el "navegador": sus claves y cómo descifra lo que le llega (lado receptor del RFC 8291) */
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const authSecret = crypto.randomBytes(16);
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: b64u(ua.getPublicKey()), auth: b64u(authSecret) };
function decrypt(body) {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPublic = body.subarray(21, 21 + idlen); const enc = body.subarray(21 + idlen);
  assert.strictEqual(body.readUInt32BE(16), 4096);
  const shared = ua.computeSecret(asPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(enc.subarray(enc.length - 16));
  const plain = Buffer.concat([d.update(enc.subarray(0, enc.length - 16)), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2, 'termina con el delimitador de último registro');
  return plain.subarray(0, plain.length - 1).toString();
}

(async () => {
  console.log('push (lib)');
  ok('cifra y el navegador lo descifra (con tildes y emojis)', () => {
    const msg = JSON.stringify({ title: 'Postulación nueva 🎉', body: 'Técnico mecatrónico · Tunuyán' });
    assert.strictEqual(decrypt(push.encrypt(msg, sub)), msg);
  });
  ok('coincide con el ejemplo oficial del RFC 8291 (sección 5)', () => {
    const e = crypto.createECDH('prime256v1'); e.setPrivateKey(fromB64u('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'));
    const out = push.encrypt('When I grow up, I want to be a watermelon',
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { salt: fromB64u('DGv6ra1nlYgDCS1FRnbzlw'), ecdh: e });
    assert.strictEqual(b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });
  ok('cada envío usa sal y claves nuevas', () => {
    const a = push.encrypt('x', sub); const b = push.encrypt('x', sub);
    assert.notDeepStrictEqual(a.subarray(0, 16), b.subarray(0, 16));
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-push-'));
  const file = path.join(dir, 'vapid.json');
  const vapid = push.loadVapid({ file });
  ok('las claves VAPID se guardan y se reusan', () => {
    assert.strictEqual(fromB64u(vapid.publicKey).length, 65);
    assert.strictEqual(push.loadVapid({ file }).publicKey, vapid.publicKey);
  });
  ok('las claves pueden venir de variables de entorno', () => {
    const k = push.loadVapid({ publicKey: vapid.publicKey, privateKey: vapid.privateJwk.d });
    assert.strictEqual(k.publicKey, vapid.publicKey);
  });
  ok('la firma VAPID es un JWT ES256 válido para el servicio de push', () => {
    const h = push.vapidHeader(sub.endpoint, vapid, 'mailto:contacto.workuco@gmail.com');
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
    assert.ok(m, h);
    const claims = JSON.parse(fromB64u(m[2]).toString());
    assert.strictEqual(claims.aud, 'https://fcm.googleapis.com');
    assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
    const pub = fromB64u(m[4]);
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(m[3])));
  });
  ok('sólo acepta servicios de push conocidos (nada de direcciones cualquiera)', () => {
    for (const e of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.ok(push.validEndpoint(e), e);
    for (const e of ['http://fcm.googleapis.com/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://127.0.0.1/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'javascript:alert(1)']) assert.ok(!push.validEndpoint(e), e);
  });
  ok('limpia la suscripción y rechaza claves mal formadas', () => {
    const good = push.cleanSubscription({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
    assert.deepStrictEqual(good, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    assert.strictEqual(push.cleanSubscription({ endpoint: sub.endpoint, keys: { p256dh: 'abc', auth: sub.auth } }), null);
    assert.strictEqual(push.cleanSubscription({ endpoint: 'https://evil.com/x', keys: { p256dh: sub.p256dh, auth: sub.auth } }), null);
    assert.strictEqual(push.cleanSubscription(null), null);
  });

  /* envío: con un fetch falso que hace de servicio de push */
  const calls = [];
  const fake = async (url, opt) => { calls.push({ url, opt }); return { status: url.endsWith('gone') ? 410 : 201, ok: !url.endsWith('gone') }; };
  const pusher = push.createPusher({ vapid, subject: 'mailto:contacto.workuco@gmail.com', fetchImpl: fake });
  const r1 = await pusher.send(sub, { title: 'Hola', body: 'Mundo', url: '/panel' });
  ok('manda con los encabezados del estándar y el navegador lo lee', () => {
    assert.deepStrictEqual(r1, { ok: true, gone: false });
    const { opt } = calls[0];
    assert.strictEqual(opt.headers['Content-Encoding'], 'aes128gcm');
    assert.ok(/^vapid t=/.test(opt.headers.Authorization));
    assert.strictEqual(opt.redirect, 'error');
    assert.deepStrictEqual(JSON.parse(decrypt(opt.body)), { title: 'Hola', body: 'Mundo', url: '/panel' });
  });
  const r2 = await pusher.send({ ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/gone' }, { title: 'x' });
  ok('si el celular se desuscribió (410), avisa para borrarla', () => assert.deepStrictEqual(r2, { ok: false, gone: true }));
  const r3 = await pusher.send({ ...sub, endpoint: 'https://evil.com/x' }, { title: 'x' });
  ok('nunca le pega a una dirección que no es de push', () => { assert.deepStrictEqual(r3, { ok: false, gone: true }); assert.strictEqual(calls.length, 2); });
  console.log(`push (lib): ${n} pruebas OK`);
})().catch((e) => { console.error(e); process.exit(1); });
