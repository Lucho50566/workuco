/**
 * Pruebas del importador de avisos (lib/importer.js).
 *   node tools/test-importer.js
 */
'use strict';
const assert = require('node:assert/strict');
const { normPhone, normName, buildImportPrompt, normalizeDrafts } = require('../lib/importer');

let ok = 0; let fail = 0;
function test(name, fn) {
  try { fn(); ok++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

const meta = {
  localities: ['San Carlos', 'Tunuyán', 'Tupungato'],
  categories: ['Administración', 'Agricultura', 'Gastronomía', 'Comercio', 'Turismo', 'Construcción', 'Tecnología', 'Mantenimiento', 'Otros'],
  types: ['Tiempo completo', 'Medio tiempo', 'Temporal', 'Pasantía', 'Freelance'],
  modalities: ['Presencial', 'Híbrido', 'Remoto'],
};
const aviso = (over = {}) => ({
  title: 'Mozo para restaurante', companyName: 'Resto El Álamo', locality: 'Tunuyán', category: 'Gastronomía',
  type: 'Medio tiempo', modality: 'Presencial',
  description: 'Buscamos mozo o moza con experiencia para el turno noche en nuestro restaurante del centro de Tunuyán.',
  contactPhone: '2622 555123', ...over,
});

test('normPhone unifica formatos argentinos', () => {
  const want = '2622555123';
  assert.equal(normPhone('+54 9 2622 15-555123'), want);
  assert.equal(normPhone('2622-555123'), want);
  assert.equal(normPhone('02622 555123'), want);
  assert.equal(normPhone('123'), '');
  assert.equal(normPhone(''), '');
});

test('normPhone con características de 2, 3 y 4 dígitos y el 15 móvil', () => {
  assert.equal(normPhone('011 15 1234 5678'), '1112345678');
  assert.equal(normPhone('+54 9 11 1234 5678'), '1112345678');
  assert.equal(normPhone('261 15 6123456'), '2616123456');
  assert.equal(normPhone('+54 9 261 6123456'), '2616123456');
  assert.equal(normPhone('+54 9 2622 15 555123'), '2622555123');
  assert.equal(normPhone('0261 4 123456'), '2614123456');
});

test('normName ignora acentos, mayúsculas, espacios y razón social', () => {
  assert.equal(normName('Bodega Alto Uco S.A.'), 'bodega alto uco');
  assert.equal(normName('bodega  alto uco'), 'bodega alto uco');
  assert.equal(normName('Café Ñandú SRL'), 'cafe nandu');
});

test('el prompt incluye las listas válidas y la regla de no inventar', () => {
  const { system } = buildImportPrompt(meta);
  for (const w of ['Tunuyán', 'Gastronomía', 'Tiempo completo', 'no inventes']) assert.ok(system.includes(w), w);
});

test('separa varios avisos', () => {
  const { drafts } = normalizeDrafts({ avisos: [aviso(), aviso({ title: 'Cocinero' })] }, meta);
  assert.equal(drafts.length, 2);
});

test('acepta texto JSON y arreglo suelto', () => {
  assert.equal(normalizeDrafts(JSON.stringify({ avisos: [aviso()] }), meta).drafts.length, 1);
  assert.equal(normalizeDrafts([aviso()], meta).drafts.length, 1);
});

test('normaliza localidad sin acentos y avisa si no es del Valle', () => {
  const { drafts } = normalizeDrafts({ avisos: [aviso({ locality: 'tunuyan' }), aviso({ locality: 'Mendoza' })] }, meta);
  assert.equal(drafts[0].locality, 'Tunuyán');
  assert.equal(drafts[1].locality, '');
  assert.ok(drafts[1].warnings.includes('Sin localidad'));
});

test('valores por defecto para categoría, tipo y modalidad', () => {
  const [d] = normalizeDrafts({ avisos: [aviso({ category: 'Bomberos', type: '', modality: '' })] }, meta).drafts;
  assert.equal(d.category, 'Otros');
  assert.equal(d.type, 'Tiempo completo');
  assert.equal(d.modality, 'Presencial');
});

test('sueldo: texto con puntos, período sinónimo y máximo incoherente', () => {
  const [d] = normalizeDrafts({ avisos: [aviso({ salaryMin: '900.000', salaryMax: 500000, salaryPeriod: 'diario' })] }, meta).drafts;
  assert.equal(d.salaryMin, 900000);
  assert.equal(d.salaryMax, 0);
  assert.equal(d.salaryPeriod, 'día');
});

test('sin teléfono ni email avisa "Sin contacto"', () => {
  const [d] = normalizeDrafts({ avisos: [aviso({ contactPhone: '', contactEmail: '' })] }, meta).drafts;
  assert.ok(d.warnings.includes('Sin contacto'));
});

test('teléfono queda normalizado para mostrar y comparar', () => {
  const [d] = normalizeDrafts({ avisos: [aviso({ contactPhone: '+54 9 2622 15-555123' })] }, meta).drafts;
  assert.equal(d.contactPhoneNorm, '2622555123');
  assert.ok(d.contactPhone.length > 0);
});

test('descripción corta usa el texto original', () => {
  const src = 'SE BUSCA MOZO turno noche en Tunuyán, presentarse con CV en San Martín 123. Interesados escribir al 2622 555123.';
  const [d] = normalizeDrafts({ avisos: [aviso({ description: 'Mozo' })] }, meta, src).drafts;
  assert.equal(d.description, src);
  assert.ok(d.warnings.includes('Descripción tomada del texto original'));
});

test('respuesta basura no produce avisos', () => {
  const r = normalizeDrafts('esto no es json', meta);
  assert.deepEqual(r.drafts, []);
  assert.ok(r.warnings.includes('La IA no encontró avisos'));
  assert.deepEqual(normalizeDrafts({ avisos: [] }, meta).drafts, []);
});

test('habilidades acotadas a 8 y fechas inválidas descartadas', () => {
  const [d] = normalizeDrafts({ avisos: [aviso({ skills: Array.from({ length: 12 }, (_, i) => `h${i}`), startDate: 'mañana', gig: 'sí' })] }, meta).drafts;
  assert.equal(d.skills.length, 8);
  assert.equal(d.startDate, '');
  assert.equal(d.gig, true);
});

test('imageIndex: válido se respeta, inválido queda en -1', () => {
  const { drafts } = normalizeDrafts({ avisos: [aviso({ imageIndex: 1 }), aviso({ imageIndex: 7 }), aviso({ imageIndex: 'x' }), aviso()] }, meta, '', 2);
  assert.deepEqual(drafts.map((d) => d.imageIndex), [1, -1, -1, -1]);
});

test('una sola imagen y un solo aviso: el aviso usa esa imagen', () => {
  const { drafts } = normalizeDrafts({ avisos: [aviso()] }, meta, '', 1);
  assert.equal(drafts[0].imageIndex, 0);
});

test('el prompt pide imageIndex', () => {
  assert.ok(buildImportPrompt(meta).system.includes('imageIndex'));
});

/* ---------- verificación: dos IA y control contra el texto original ---------- */
const { crossCheck, groundDrafts } = require('../lib/importer');
const d1 = () => normalizeDrafts({ avisos: [aviso({ title: 'Cosechadores de manzana', companyName: 'Finca Las Pircas', salaryMin: 30000, salaryPeriod: 'día', contactPhone: '2622 444777', locality: 'Tunuyán', gig: true })] }, meta, '', 0).drafts;

test('si las dos IA coinciden, el borrador queda verificado', () => {
  const r = crossCheck(d1(), d1());
  assert.equal(r.drafts[0].checked, 'ok');
  assert.deepEqual(r.drafts[0].warnings.filter((w) => /otra IA/.test(w)), []);
});

test('si leen distinto el sueldo, el teléfono o la localidad, avisa qué revisar', () => {
  const otro = normalizeDrafts({ avisos: [aviso({ title: 'Cosechadores de manzana', companyName: 'Finca Las Pircas', salaryMin: 3000, salaryPeriod: 'hora', contactPhone: '2622 444778', locality: 'San Carlos', gig: true })] }, meta, '', 0).drafts;
  const r = crossCheck(d1(), otro);
  const w = r.drafts[0].warnings.join(' | ');
  assert.equal(r.drafts[0].checked, 'review');
  assert.ok(/sueldo/i.test(w) && /3\.000/.test(w), w);
  assert.ok(/tel[eé]fono/i.test(w), w);
  assert.ok(/localidad/i.test(w) && /San Carlos/.test(w), w);
});

test('empareja por puesto aunque vengan en otro orden', () => {
  const a = normalizeDrafts({ avisos: [aviso({ title: 'Mozo para resto' }), aviso({ title: 'Cosechadores de manzana', salaryMin: 30000 })] }, meta, '', 0).drafts;
  const b = normalizeDrafts({ avisos: [aviso({ title: 'Cosechadores manzana', salaryMin: 30000 }), aviso({ title: 'Mozo resto' })] }, meta, '', 0).drafts;
  const r = crossCheck(a, b);
  assert.deepEqual(r.drafts.map((d) => d.checked), ['ok', 'ok']);
});

test('si una IA encuentra más avisos que la otra, lo avisa', () => {
  const b = normalizeDrafts({ avisos: [aviso({ title: 'Cosechadores de manzana', salaryMin: 30000, salaryPeriod: 'día', contactPhone: '2622 444777', locality: 'Tunuyán', companyName: 'Finca Las Pircas', gig: true }), aviso({ title: 'Peón rural' })] }, meta, '', 0).drafts;
  const r = crossCheck(d1(), b);
  assert.ok(r.warnings.some((w) => /2 avisos/.test(w)), JSON.stringify(r.warnings));
});

test('control contra el texto: el sueldo y el teléfono tienen que estar escritos en el mensaje', () => {
  const texto = 'Finca Las Pircas busca cosechadores de manzana, $30.000 por día. Tunuyán. Llamar al 2622 15-444777';
  const bien = groundDrafts(d1(), texto)[0];
  assert.ok(!bien.warnings.some((w) => /no figura/.test(w)), bien.warnings.join(' | '));
  const inventado = normalizeDrafts({ avisos: [aviso({ salaryMin: 45000, contactPhone: '2622 999999' })] }, meta, texto, 0).drafts;
  const mal = groundDrafts(inventado, texto)[0].warnings.join(' | ');
  assert.ok(/sueldo no figura/i.test(mal) && /tel[eé]fono no figura/i.test(mal), mal);
});

test('el control contra el texto no se aplica a lo que sale de una imagen', () => {
  const deImagen = normalizeDrafts({ avisos: [aviso({ salaryMin: 45000, imageIndex: 0 })] }, meta, 'texto sin números', 1).drafts;
  assert.ok(!groundDrafts(deImagen, 'texto sin números')[0].warnings.some((w) => /no figura/.test(w)));
});

/* ---------- llamado a Claude: los modelos actuales rechazan temperature ---------- */
(async () => {
  const ai = require('../lib/ai');
  let body = null;
  const real = global.fetch;
  global.fetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"avisos":[]}' }] }) }; };
  try {
    const out = await ai.callProvider({ provider: 'anthropic', apiKey: 'k', model: '', baseUrl: '' }, { system: 's', user: 'u', maxTokens: 100 });
    test('Claude: modelo por defecto actual y sin temperature', () => {
      assert.equal(body.model, 'claude-opus-5-5');
      assert.ok(!('temperature' in body), JSON.stringify(body));
    });
    test('Claude: lee sólo los bloques de texto (ignora el razonamiento)', () => assert.deepEqual(out, { avisos: [] }));
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'refusal', content: [] }) });
    let err = null;
    try { await ai.callProvider({ provider: 'anthropic', apiKey: 'k' }, { system: 's', user: 'u' }); } catch (e) { err = e; }
    test('Claude: si se niega, da un error claro', () => assert.ok(err && /rechaz|neg/i.test(err.message), err && err.message));
    test('la verificación se configura con WORKUCO_IMPORT_AI2_*', () => {
      const c = ai.importVerifierConfig({ WORKUCO_IMPORT_AI2_PROVIDER: 'gemini', WORKUCO_IMPORT_AI2_KEY: 'x' });
      assert.equal(c.provider, 'gemini'); assert.equal(c.model, 'gemini-2.5-flash');
      assert.equal(ai.importVerifierConfig({}), null);
    });
  } catch (e) { fail++; console.log('FAIL  llamado a Claude', e.message); }
  global.fetch = real;
  console.log(`\n${ok} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
