/**
 * Baja manual pedida por mail (Ley 25.326 art. 16: hasta 5 días hábiles).
 * Antes de correrlo, verificá que el pedido llegó desde el mail registrado.
 *
 *   node tools/borrar-cuenta.js persona@mail.com           # muestra qué se borraría
 *   node tools/borrar-cuenta.js persona@mail.com --borrar  # borra
 *
 * Usa la misma base que el servidor (WORKUCO_DATA o ./data). Sirve para personas y empresas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { Store } = require('../lib/store');

const [email, flag] = process.argv.slice(2);
if (!email) { console.error('Uso: node tools/borrar-cuenta.js <email> [--borrar]'); process.exit(2); }
const DATA = process.env.WORKUCO_DATA ? path.resolve(process.env.WORKUCO_DATA) : path.join(__dirname, '..', 'data');
const UP = path.join(DATA, 'uploads');
const store = new Store(path.join(DATA, 'workuco.sqlite'));

const cand = store.candidateByEmail(email);
const comp = store.companyByEmail(email);
if (!cand && !comp) { console.log(`No hay ninguna cuenta con ${email}.`); process.exit(0); }
const what = cand ? `persona "${cand.name}" (${cand.id})` : `empresa "${comp.name}" (${comp.id})`;
if (flag !== '--borrar') { console.log(`Se borraría la ${what}. Repetí con --borrar para confirmar.`); process.exit(0); }

const files = cand ? store.deleteCandidateCascade(cand.id) || [] : (() => { const f = store.companyFiles(comp.id); store.deleteCompanyCascade(comp.id); return f; })();
for (const f of files) { try { fs.unlinkSync(path.join(UP, path.basename(f))); } catch (_) { /* ya no estaba */ } }
console.log(`Listo: se borró la ${what} y ${files.length} archivo(s). Respondé el mail confirmando la baja.`);
