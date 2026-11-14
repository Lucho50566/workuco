/**
 * Pruebas del motor de compatibilidad (lib/match.js).
 *   node tools/test-match.js
 */
'use strict';
const assert = require('node:assert/strict');
const { matchScore, norm } = require('../lib/match');

let ok = 0; let fail = 0;
function test(name, fn) {
  try { fn(); ok++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

const job = (over = {}) => ({
  title: 'Operario de bodega', description: 'Trabajo en bodega boutique.', requirements: '',
  skills: ['Fraccionamiento', 'Control de stock', 'BPM', 'Trabajo en equipo'],
  locality: 'San Carlos', modality: 'Presencial', category: 'Agricultura', type: 'Tiempo completo',
  salaryMin: 900000, salaryMax: 1100000, ...over,
});
const cand = (over = {}) => ({
  skills: ['Fraccionamiento', 'Control de stock', 'BPM', 'Trabajo en equipo'],
  locality: 'San Carlos', headline: 'Operaria de bodega', experience: '', availability: 'Tiempo completo',
  categories: ['Agricultura'], salaryMin: 800000, ...over,
});

test('norm quita acentos y mayúsculas', () => {
  assert.equal(norm('  Atención al PÚBLICO '), 'atencion al publico');
});

test('coincidencia total da 100', () => {
  const m = matchScore(cand(), job());
  assert.equal(m.score, 100);
  assert.deepEqual(m.missing, []);
});

test('perfil sin habilidades ni localidad da score null', () => {
  const m = matchScore(cand({ skills: [], locality: '' }), job());
  assert.equal(m.score, null);
  assert.deepEqual(m.reasons, []);
});

test('perfil undefined o campos faltantes no rompe', () => {
  assert.equal(matchScore({}, job()).score, null);
  assert.equal(matchScore(null, job()).score, null);
  assert.equal(typeof matchScore(cand(), {}).score, 'number');
});

test('acentos y mayúsculas cuentan como coincidencia', () => {
  const m = matchScore(
    cand({ skills: ['atencion al publico'] }),
    job({ skills: ['Atención al público'] }),
  );
  assert.equal(m.score, 100);
});

test('aviso remoto suma localidad aunque sea otra', () => {
  const lejos = matchScore(cand({ locality: 'Tupungato' }), job());
  const remoto = matchScore(cand({ locality: 'Tupungato' }), job({ modality: 'Remoto' }));
  assert.equal(remoto.score - lejos.score, 20);
});

test('aviso sin habilidades: usa el texto de requisitos', () => {
  const sin = matchScore(cand({ skills: ['Excel'] }), job({ skills: [], requirements: 'Secundario completo' }));
  const con = matchScore(cand({ skills: ['Excel'] }), job({ skills: [], requirements: 'Manejo de EXCEL avanzado' }));
  assert.ok(con.score > sin.score, `${con.score} debería ser mayor que ${sin.score}`);
});

test('sueldo por debajo de lo pretendido no suma', () => {
  const bien = matchScore(cand({ salaryMin: 800000 }), job());
  const bajo = matchScore(cand({ salaryMin: 2000000 }), job());
  const sinDato = matchScore(cand({ salaryMin: null }), job());
  assert.equal(bien.score - bajo.score, 10);
  assert.equal(sinDato.score, bien.score);
});

test('missing lista las habilidades que faltan con el texto del aviso', () => {
  const m = matchScore(cand({ skills: ['fraccionamiento', 'bpm', 'trabajo en equipo'] }), job());
  assert.deepEqual(m.missing, ['Control de stock']);
});

test('reasons explica las habilidades', () => {
  const m = matchScore(cand({ skills: ['fraccionamiento', 'bpm', 'trabajo en equipo'] }), job());
  assert.ok(m.reasons.includes('Tenés 3 de las 4 habilidades'), JSON.stringify(m.reasons));
});

test('para la empresa los motivos van en tercera persona', () => {
  const m = matchScore(cand({ skills: ['fraccionamiento', 'bpm', 'trabajo en equipo'] }), job(), { audience: 'company' });
  assert.ok(m.reasons.includes('Tiene 3 de las 4 habilidades'), JSON.stringify(m.reasons));
  assert.ok(m.reasons.includes('Vive en San Carlos'), JSON.stringify(m.reasons));
  assert.ok(!m.reasons.some((r) => /Tenés|vivís|Tu disponibilidad|Te interesa|buscás/.test(r)), JSON.stringify(m.reasons));
});

test('rubro sin categories: lo toma del titular', () => {
  const con = matchScore(cand({ categories: [], headline: 'Peón de agricultura' }), job());
  const sin = matchScore(cand({ categories: [], headline: 'Cajera' }), job());
  assert.equal(con.score - sin.score, 15);
});

test('el puntaje siempre es entero entre 0 y 100', () => {
  const m = matchScore(cand({ skills: ['x'], locality: 'Tunuyán', categories: ['Comercio'], availability: 'Fines de semana', salaryMin: 9e6 }), job());
  assert.ok(Number.isInteger(m.score) && m.score >= 0 && m.score <= 100);
});

test('las localidades de interés suman como la de residencia', () => {
  const sin = matchScore(cand({ skills: ['fraccionamiento'] }), job({ locality: 'Tunuyán' }));
  const con = matchScore(cand({ skills: ['fraccionamiento'], localities: ['Tunuyán'] }), job({ locality: 'Tunuyán' }));
  assert.equal(con.score - sin.score, 20);
  assert.ok(con.reasons.includes('Es en Tunuyán, donde querés trabajar'), JSON.stringify(con.reasons));
});

test('la empresa ve la localidad de interés en tercera persona', () => {
  const m = matchScore(cand({ skills: ['fraccionamiento'], localities: ['Tunuyán'] }), job({ locality: 'Tunuyán' }), { audience: 'company' });
  assert.ok(m.reasons.includes('Quiere trabajar en Tunuyán'), JSON.stringify(m.reasons));
});

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
