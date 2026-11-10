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

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
