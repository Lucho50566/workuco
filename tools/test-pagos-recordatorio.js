'use strict';
/* Recordatorios de pagos (lib/bills.js): fechas, vencimientos y que cada aviso salga una sola vez. */
const assert = require('assert');
const b = require('../lib/bills');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
console.log('recordatorios de pagos');

ok('hoy es la fecha argentina (a las 23 h de Argentina sigue siendo el mismo día)', () => {
  assert.strictEqual(b.todayAR(Date.parse('2026-11-29T01:59:00Z')), '2026-11-28');
  assert.strictEqual(b.todayAR(Date.parse('2026-11-29T03:01:00Z')), '2026-11-29');
});
ok('mensual: suma un mes sin pasarse (31/01 → 28/02, 29/02 en bisiesto, diciembre → enero)', () => {
  assert.strictEqual(b.advance('2026-01-31', 'mes'), '2026-02-28');
  assert.strictEqual(b.advance('2028-01-31', 'mes'), '2028-02-29');
  assert.strictEqual(b.advance('2026-12-15', 'mes'), '2027-01-15');
  assert.strictEqual(b.advance('2026-11-10', 'mes'), '2026-12-10');
});
ok('anual: suma un año (29/02 → 28/02)', () => {
  assert.strictEqual(b.advance('2026-11-10', 'anio'), '2027-11-10');
  assert.strictEqual(b.advance('2028-02-29', 'anio'), '2029-02-28');
});
ok('valida fechas reales', () => {
  assert.ok(b.validDate('2026-12-05'));
  for (const s of ['2026-02-30', '05/12/2026', '', null, '2026-13-01']) assert.ok(!b.validDate(s), String(s));
});
ok('trae el servidor y el dominio por defecto, sin pisar lo cargado', () => {
  const l = b.normalize([{ id: 'cloud', name: 'Cloud Server de DonWeb', period: 'mes', next: '2026-12-05' }]);
  assert.deepStrictEqual(l.map((x) => x.id), ['cloud', 'dominio']);
  assert.strictEqual(l[0].next, '2026-12-05');
  assert.strictEqual(l[1].next, null);
});
ok('avisa 5 días antes, 2 días antes y el mismo día, una sola vez cada uno', () => {
  let list = b.normalize([{ id: 'cloud', name: 'Cloud Server de DonWeb', period: 'mes', next: '2026-12-05' }]);
  const run = (today) => { const r = b.due(list, today); list = r.list; return r.notices; };
  assert.strictEqual(run('2026-11-29').length, 0, '6 días antes: nada');
  const a = run('2026-11-30');
  assert.strictEqual(a.length, 1); assert.match(a[0].title, /En 5 días vence: Cloud Server/);
  assert.strictEqual(run('2026-11-30').length, 0, 'el mismo día no se repite');
  assert.strictEqual(run('2026-12-02').length, 0, '3 días antes: nada');
  assert.match(run('2026-12-03')[0].title, /En 2 días/);
  assert.match(run('2026-12-05')[0].title, /Hoy vence/);
  assert.match(run('2026-12-06')[0].title, /Pago vencido/);
  assert.strictEqual(run('2026-12-06').length, 0, 'vencido: uno por día');
  assert.match(run('2026-12-07')[0].title, /Pago vencido/);
});
ok('sin fecha cargada no avisa', () => assert.strictEqual(b.due(b.normalize([]), '2026-12-01').notices.length, 0));
ok('la vista dice cuántos días faltan', () => {
  const v = b.view(b.normalize([{ id: 'cloud', name: 'x', period: 'mes', next: '2026-12-05' }]), '2026-11-28');
  assert.strictEqual(v[0].days, 7);
  assert.strictEqual(v[1].days, null);
});
console.log(`recordatorios de pagos: ${n} pruebas OK`);
