/**
 * Pruebas de imágenes en lib/ai.js y de la config del importador.
 * Reemplaza fetch para ver qué se manda a cada proveedor; no usa la red.
 *   node tools/test-ai-images.js
 */
'use strict';
const assert = require('node:assert/strict');
const ai = require('../lib/ai');

let ok = 0; let fail = 0;
async function test(name, fn) {
  try { await fn(); ok++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

let sent = null;
const reply = { gemini: { candidates: [{ content: { parts: [{ text: '{"avisos":[]}' }] } }] },
  anthropic: { content: [{ type: 'text', text: '{"avisos":[]}' }] },
  openai: { choices: [{ message: { content: '{"avisos":[]}' } }] } };
function stub(kind) {
  global.fetch = async (url, opts) => { sent = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => reply[kind] }; };
}
const img = { mime: 'image/png', base64: 'iVBORw0KGgo=' };

(async () => {
  await test('Gemini manda la imagen como inline_data', async () => {
    stub('gemini');
    await ai.callProvider({ provider: 'gemini', apiKey: 'k' }, { system: 's', user: 'u', images: [img] });
    const parts = sent.body.contents[0].parts;
    assert.equal(parts[0].text, 'u');
    assert.deepEqual(parts[1], { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgo=' } });
  });

  await test('OpenAI manda la imagen como image_url data URI', async () => {
    stub('openai');
    await ai.callProvider({ provider: 'openai', apiKey: 'k' }, { system: 's', user: 'u', images: [img] });
    const content = sent.body.messages[1].content;
    assert.equal(content[0].type, 'text');
    assert.deepEqual(content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } });
  });

  await test('Anthropic manda la imagen como bloque image base64', async () => {
    stub('anthropic');
    await ai.callProvider({ provider: 'anthropic', apiKey: 'k' }, { system: 's', user: 'u', images: [img] });
    const content = sent.body.messages[0].content;
    assert.deepEqual(content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } });
    assert.equal(content[1].type, 'text');
  });

  await test('sin imágenes el pedido queda como antes', async () => {
    stub('openai');
    await ai.callProvider({ provider: 'openai', apiKey: 'k' }, { system: 's', user: 'u' });
    assert.equal(sent.body.messages[1].content, 'u');
    stub('anthropic');
    await ai.callProvider({ provider: 'anthropic', apiKey: 'k' }, { system: 's', user: 'u' });
    assert.equal(sent.body.messages[0].content, 'u');
  });

  await test('importConfig lee el entorno del admin', async () => {
    assert.equal(ai.importConfig({}), null);
    assert.equal(ai.importConfig({ WORKUCO_IMPORT_AI_PROVIDER: 'gemini' }), null);
    const cfg = ai.importConfig({ WORKUCO_IMPORT_AI_PROVIDER: 'gemini', WORKUCO_IMPORT_AI_KEY: 'k' });
    assert.equal(cfg.provider, 'gemini');
    assert.equal(cfg.model, 'gemini-3.5-flash-lite');
    assert.equal(ai.importConfig({ WORKUCO_IMPORT_AI_PROVIDER: 'raro', WORKUCO_IMPORT_AI_KEY: 'k' }), null);
  });

  console.log(`\n${ok} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
