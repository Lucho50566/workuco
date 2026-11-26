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

function base() {
  console.log('— Base —');
  const { Store } = require('../lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-cert-'));
  const s = new Store(path.join(dir, 'db.sqlite'));
  try {
    s.insertCandidate({ id: 'u1', name: 'Ana', email: 'ana@x.test', phone: '2622000001', password: 'x' });
    const base = { applicationId: 'a1', candidateId: 'u1', companyId: 'co1', jobId: 'j1', personName: 'Ana', companyName: 'Finca', position: 'Tractorista', locality: 'Tunuyán', startDate: '2026-03-15', endDate: '2026-04-30' };
    const c1 = s.insertCertificate({ ...base, comment: 'Muy responsable' });
    check('se crea vigente con comentario pendiente', c1.status === 'valid' && c1.commentStatus === 'pending' && c1.onProfile === false && /^[A-Z2-9]{8}$/.test(c1.code));
    check('por código y por id', s.certificateByCode(c1.code).id === c1.id && s.certificate(c1.id).code === c1.code);
    const c2 = s.insertCertificate({ ...base, applicationId: 'a2', comment: '' });
    check('sin comentario queda none', c2.commentStatus === 'none');
    check('códigos distintos', c1.code !== c2.code);
    check('por postulación', s.certificatesForApplication('a1').length === 1 && s.certificatesForApplication('a1')[0].id === c1.id);
    check('de la persona y de la empresa', s.certificatesOfCandidate('u1').length === 2 && s.certificatesOfCompany('co1').length === 2);
    check('no figura en público hasta prenderlo', s.publicCertificatesOf('u1').length === 0);
    s.setCertificateOnProfile(c1.id, true);
    check('figura en público', s.publicCertificatesOf('u1').length === 1);
    check('comentario aceptado', s.setCertificateComment(c1.id, 'shown').commentStatus === 'shown');
    check('admin busca por empresa o código', s.adminCertificates({ q: 'finca' }).length === 2 && s.adminCertificates({ q: c2.code }).length === 1);
    const r = s.revokeCertificate(c1.id, 'admin', 'denuncia');
    check('anula una vez', r.status === 'revoked' && r.revokedBy === 'admin' && r.revokeReason === 'denuncia' && !!r.revokedAt && s.revokeCertificate(c1.id, 'company', 'x') === null);
    check('anulado no figura en público', s.publicCertificatesOf('u1').length === 0);
    s.deleteCandidateCascade('u1');
    check('la baja borra sus certificados', s.certificatesOfCandidate('u1').length === 0 && !s.certificateByCode(c2.code));
  } finally {
    try { s.db.close(); } catch (_) { /* nada */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    reglas();
    base();
  } catch (e) {
    fail++; console.error('ERROR:', e);
  }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

module.exports = { fs, os, path, spawn };
main();
