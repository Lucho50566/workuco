/**
 * Pruebas de los certificados de trabajo: reglas, base y API.
 *   node tools/test-certificados.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

function reglas() {
  console.log('— Reglas —');
  const { newCode, normCode, formatCode, validateIssue, periodLabel } = require('../lib/certificates');
  check('código de 8 letras sin ambiguas', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(newCode()));
  check('normaliza minúsculas y guion', normCode('k7m2-9qxa') === 'K7M29QXA');
  check('rechaza letras ambiguas', normCode('O0I1L000') === '');
  check('rechaza largo incorrecto', normCode('K7M29QX') === '' && normCode('') === '' && normCode(null) === '');
  check('formato con guion', formatCode('K7M29QXA') === 'K7M2-9QXA');
  const ctx = { appliedDate: '2026-03-10', today: '2026-11-25', defaultPosition: 'Tractorista' };
  const v = validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30' }, ctx);
  check('válido, con el puesto del aviso', !v.errors && v.value.position === 'Tractorista' && v.value.comment === '');
  check('fecha inexistente', !!(validateIssue({ startDate: '2026-02-30', endDate: '2026-04-30' }, ctx).errors || {}).startDate);
  check('falta una fecha', !!(validateIssue({ startDate: '2026-03-15' }, ctx).errors || {}).endDate);
  check('desde > hasta', !!(validateIssue({ startDate: '2026-05-01', endDate: '2026-04-30' }, ctx).errors || {}).endDate);
  check('hasta futura', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-12-01' }, ctx).errors || {}).endDate);
  check('desde antes de postularse (-1 día ok)', !validateIssue({ startDate: '2026-03-09', endDate: '2026-03-20' }, ctx).errors
    && !!(validateIssue({ startDate: '2026-03-08', endDate: '2026-03-20' }, ctx).errors || {}).startDate);
  check('comentario con teléfono', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'llamalo al 2622555123' }, ctx).errors || {}).comment);
  check('comentario de 281', !!(validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'a'.repeat(281) }, ctx).errors || {}).comment);
  check('comentario de 280 ok', !validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'a'.repeat(280) }, ctx).errors);
  check('puesto de 81', !!(validateIssue({ position: 'a'.repeat(81), startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).errors || {}).position);
  check('puesto editado', validateIssue({ position: '  Encargado de riego ', startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).value.position === 'Encargado de riego');
  check('período legible', periodLabel('2026-03-03', '2026-04-30') === 'del 3 de marzo de 2026 al 30 de abril de 2026');
}

async function main() {
  try {
    reglas();
  } catch (e) {
    fail++; console.error('ERROR:', e);
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

module.exports = { fs, os, path, spawn };
main();
