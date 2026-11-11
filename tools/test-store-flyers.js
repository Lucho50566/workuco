/**
 * Migración de flyers: un aviso viejo con flyer_file y sin flyers tiene que
 * aparecer con ese flyer como el primero de la lista.
 *   node tools/test-store-flyers.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-flyers-'));
const file = path.join(dir, 'db.sqlite');
let ok = 0; let fail = 0;
const test = (name, fn) => { try { fn(); ok++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); } };

try {
  let s = new Store(file);
  s.insertCompany({ id: 'c1', name: 'Empresa', email: 'e@test.workuco', password: 'x' });
  s.insertJob({ id: 'j1', companyId: 'c1', title: 'Puesto viejo', locality: 'Tunuyán', category: 'Otros', type: 'Tiempo completo', modality: 'Presencial', description: 'x'.repeat(80) });
  s.run("UPDATE jobs SET flyers=NULL, flyer_file='viejo.png' WHERE id='j1'");
  s.db.close();
  s = new Store(file);
  const j = s.job('j1');
  test('un aviso viejo trae su flyer en la lista', () => {
    assert.deepEqual(j.flyers, ['/media/viejo.png']);
    assert.equal(j.flyer, '/media/viejo.png');
  });
  test('la migración lo deja guardado', () => {
    assert.equal(s.one("SELECT flyers FROM jobs WHERE id='j1'").flyers, '["viejo.png"]');
  });
  test('insertar con varios flyers', () => {
    s.insertJob({ id: 'j2', companyId: 'c1', title: 'Puesto nuevo', locality: 'Tunuyán', category: 'Otros', type: 'Tiempo completo', modality: 'Presencial', description: 'x'.repeat(80), flyerFiles: ['a.png', 'b.png'] });
    const n = s.job('j2');
    assert.deepEqual(n.flyers, ['/media/a.png', '/media/b.png']);
    assert.equal(n.flyerFile, 'a.png');
  });
  test('actualizar sin tocar flyers los conserva y con lista vacía los saca', () => {
    s.updateJob('j2', { title: 'Puesto nuevo editado' });
    assert.equal(s.job('j2').flyers.length, 2);
    s.updateJob('j2', { flyerFiles: [] });
    assert.deepEqual(s.job('j2').flyers, []);
    assert.equal(s.job('j2').flyer, null);
  });
  s.db.close();
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* Windows: la base puede seguir abierta */ }
}
console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
