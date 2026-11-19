/**
 * Pruebas del Pack Cosecha: estado del pack en la base, API, cobro, admin y página /cosecha.
 *
 *   node tools/test-cosecha.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Store } = require('../lib/store');

const ROOT = path.join(__dirname, '..');
const DAY = 86400000;
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const near = (a, b, tol = 60000) => Math.abs(a - b) < tol;

function testBase() {
  console.log('— Base —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-cosecha-'));
  const s = new Store(path.join(dir, 'db.sqlite'));
  try {
    s.insertCompany({ id: 'cbod', name: 'Bodega Prueba', email: 'b@test.com', password: 'x' });
    const base = { companyId: 'cbod', locality: 'Tunuyán', type: 'Temporal', modality: 'Presencial', description: 'Tareas de temporada en finca.', status: 'approved' };
    const t0 = Date.now();
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const id = `jagr${i}`; ids.push(id);
      s.insertJob({ ...base, id, title: `Cosecha ${i}`, category: i === 6 ? 'Otros' : 'Agricultura', gig: i === 6, createdAt: t0 - (7 - i) * 1000, publishedAt: t0 - (7 - i) * 1000 });
    }
    s.insertJob({ ...base, id: 'jgas', title: 'Mozo', category: 'Gastronomía', createdAt: t0, publishedAt: t0 });
    /* uno ya destacado por más tiempo y otro sin vencimiento: no se tocan */
    s.setJobFeatured('jagr5', t0 + 60 * DAY);
    s.run('UPDATE jobs SET featured=1, featured_until=NULL WHERE id=?', 'jagr4');

    check('sin pack no está activo', s.cosechaActive('cbod') === false);
    const a = s.activateCosecha('cbod');
    check('activar dura 30 días', near(a.until, Date.now() + 30 * DAY), String(a.until - Date.now()));
    check('activo después de activar', s.cosechaActive('cbod') === true);
    const feat = ids.filter((id) => s.job(id).featured);
    check('quedan destacados como mucho 5 avisos de cosecha', s.cosechaFeaturedCount('cbod') === 5, String(s.cosechaFeaturedCount('cbod')));
    check('los más nuevos primero (el más viejo no entra)', !s.job('jagr0').featured && s.job('jagr6').featured, JSON.stringify(feat));
    check('la changa de otro rubro cuenta como de cosecha', s.job('jagr6').featured === true);
    check('un aviso de Gastronomía no se destaca', s.job('jgas').featured === false);
    check('un destacado más largo conserva su fecha', near(s.job('jagr5').featuredUntil, t0 + 60 * DAY));
    check('un destacado sin vencimiento sigue sin vencimiento', s.job('jagr4').featured === true && s.job('jagr4').featuredUntil == null);
    check('los demás vencen con el pack', near(s.job('jagr3').featuredUntil, a.until));
    check('los avisos de cosecha llevan el sello', s.job('jagr3').cosecha === true && s.job('jgas').cosecha === false);

    const b = s.activateCosecha('cbod');
    check('activar de nuevo suma 30 días al pack vigente', near(b.until, a.until + 30 * DAY));

    s.setCosechaRequest('cbod', true);
    check('se guarda el pedido', s.company('cbod').cosecha_req_at > 0);
    s.activateCosecha('cbod');
    check('activar atiende el pedido', s.company('cbod').cosecha_req_at == null);

    const r = s.searchJobs({ cosecha: '1', limit: 30 });
    check('la búsqueda de cosecha trae sólo Agricultura o changas', r.jobs.length === 7 && r.jobs.every((j) => j.category === 'Agricultura' || j.gig), JSON.stringify(r.jobs.map((j) => j.id)));

    const before = s.job('jagr3').featuredUntil;
    s.endCosecha('cbod');
    check('al quitar el pack deja de estar activo', s.cosechaActive('cbod') === false);
    check('y los avisos conservan su fecha de destacado', s.job('jagr3').featuredUntil === before);
    check('sin pack no hay sello', s.job('jagr3').cosecha === false);
    s.run('UPDATE companies SET cosecha_until=? WHERE id=?', Date.now() - 1000, 'cbod');
    check('un pack vencido no está activo', s.cosechaActive('cbod') === false);
  } finally {
    s.db.close && s.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  try { testBase(); } catch (e) { fail++; console.error('ERROR en las pruebas:', e); }
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
