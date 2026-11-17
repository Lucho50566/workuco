/**
 * Pruebas de la lógica pura del CV Pro (lib/cvpro.js): listas fijas, validación, anti-invención y vista previa.
 *   node tools/test-cvpro-lib.js
 */
'use strict';
const cvpro = require('../lib/cvpro');

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

console.log('— Listas fijas —');
check('6 diseños', cvpro.DESIGNS.join(',') === 'clasico,moderno,campo,servicio,creativo,primer-empleo');
check('6 colores con id y hex', cvpro.ACCENTS.length === 6 && cvpro.ACCENTS.every((a) => a.id && /^#[0-9a-f]{6}$/i.test(a.hex) && a.label));
check('15 controles de "lo que falta"', cvpro.CHECKS.length === 15 && cvpro.CHECKS.every((c) => c.id && c.label));
check('10 secciones', cvpro.SECTIONS.length === 10 && cvpro.SECTIONS.includes('experiencia'));

console.log('— Análisis —');
const an = cvpro.normalizeAnalysis({ score: 140, rubro: 'Gastronomía', checks: [{ id: 'resumen', status: 'x', note: 'Falta un resumen' }, { id: 'inventado', status: 'ok' }],
  suggestions: Array(12).fill('Sumá números'), extracted: { name: 'Ana', experience: [{ company: 'Café Central', role: 'Moza', tasks: ['Atención'] }] } });
check('puntaje topeado a 100', an.score === 100);
check('un control por cada uno de la lista, en orden', an.checks.length === 15 && an.checks.map((c) => c.id).join() === cvpro.CHECKS.map((c) => c.id).join());
check('estado inválido pasa a "falta"', an.checks.find((c) => c.id === 'resumen').status === 'falta');
check('los que no vinieron quedan como "falta"', an.checks.find((c) => c.id === 'idiomas').status === 'falta');
check('sugerencias topeadas a 8', an.suggestions.length === 8);
check('datos extraídos con forma fija', an.extracted.name === 'Ana' && Array.isArray(an.extracted.experience) && Array.isArray(an.extracted.education) && an.extracted.contact && typeof an.extracted.contact === 'object');
check('basura no rompe', cvpro.normalizeAnalysis(null).checks.length === 15 && cvpro.normalizeAnalysis('hola').score === 0);
check('puntaje negativo o texto queda en 0', cvpro.normalizeAnalysis({ score: -3 }).score === 0 && cvpro.normalizeAnalysis({ score: 'mucho' }).score === 0);

console.log('— CV generado: listas fijas y anti-invención —');
const corpus = cvpro.allowedCorpus('Trabajé en FINCA LOS NOGALES como podador', 'Escuela Técnica N° 4-118');
const cv = cvpro.normalizeCv({
  design: 'raro', accent: 'rosa', sections: ['resumen', 'resumen', 'hackeo', 'experiencia'],
  name: 'Juan Pérez', headline: 'x'.repeat(200), summary: 'Podador con experiencia.',
  experience: [
    { company: 'Bodega Inventada', role: 'CEO', bullets: ['Dirigí todo'] },
    { company: 'Finca Los Nogales', role: 'Podador', from: '2021', to: '2024', bullets: Array(9).fill('Poda de frutales') },
  ],
  education: [{ institution: 'Universidad Falsa', title: 'Doctorado' }, { institution: 'Escuela Tecnica N 4-118', title: 'Técnico' }],
  skills: ['Poda', 'Riego'], languages: [{ name: 'Español', level: 'Nativo' }],
}, corpus);
check('diseño desconocido → clasico', cv.design === 'clasico');
check('color desconocido → verde', cv.accent === 'verde');
check('secciones sin repetidos ni desconocidas', cv.sections.join() === 'resumen,experiencia', cv.sections.join());
check('titular topeado a 90', cv.headline.length <= 90);
check('descarta la empresa inventada y deja la real (sin tildes ni mayúsculas)', cv.experience.length === 1 && cv.experience[0].company === 'Finca Los Nogales');
check('máximo 4 tareas por experiencia', cv.experience[0].bullets.length === 4);
const many = cvpro.normalizeCv({ experience: Array.from({ length: 8 }, (_, i) => ({ company: `Empresa ${i}`, role: '', bullets: Array(6).fill('tarea') })),
  courses: Array(9).fill('c'), achievements: Array(9).fill('l'), skills: Array(20).fill('s'), summary: 'r'.repeat(900) },
  cvpro.allowedCorpus(Array.from({ length: 8 }, (_, i) => `Empresa ${i}`).join(' ')));
const totalB = many.experience.reduce((n, e) => n + e.bullets.length, 0);
check('topes para que entre en una hoja: 5 trabajos, 10 tareas en total, 3 cursos, 3 logros, 10 habilidades, resumen 420',
  many.experience.length === 5 && totalB === 10 && many.courses.length === 3 && many.achievements.length === 3 && many.skills.length === 10 && many.summary.length <= 420, JSON.stringify({ e: many.experience.length, totalB }));
check('las tareas se recortan primero en los trabajos más viejos', many.experience[0].bullets.length === 4 && many.experience[4].bullets.length < 4);
check('descarta el estudio inventado y deja el real', cv.education.length === 1 && /4-118/.test(cv.education[0].institution));
check('secciones vacías → orden por defecto', cvpro.normalizeCv({ sections: [] }, corpus).sections.length > 0);
check('basura no rompe', cvpro.normalizeCv(null, corpus).design === 'clasico');

console.log('— Vista previa recortada —');
const full = cvpro.normalizeCv({
  design: 'moderno', accent: 'malbec', name: 'Ana', summary: 'Resumen',
  experience: [1, 2, 3].map((n) => ({ company: `Empresa ${n}`, role: `Cargo ${n}`, bullets: [`uno-${n}`, `dos-${n}`, `tres-${n}`, `cuatro-${n}`] })),
  education: [1, 2, 3].map((n) => ({ institution: `Escuela ${n}`, title: `Título ${n}` })),
  skills: ['a', 'b', 'c', 'd'],
}, cvpro.allowedCorpus('Empresa 1 Empresa 2 Empresa 3 Cargo 1 Cargo 2 Cargo 3 Escuela 1 Escuela 2 Escuela 3'));
const pv = cvpro.previewCv(full);
const txt = JSON.stringify(pv);
check('la primera experiencia va completa', pv.experience[0].bullets.join() === 'uno-1,dos-1,tres-1,cuatro-1');
check('de las demás sólo la primera tarea', !txt.includes('tres-2') && !txt.includes('dos-3') && txt.includes('uno-2'));
check('estudios y habilidades: sólo los 2 primeros y marcados', pv.education.length === 2 && pv.skills.length === 2 && pv.locked === true && !txt.includes('Escuela 3'));
check('no modifica el CV original', full.experience[1].bullets.length === 4);

console.log('— IA simulada —');
const fa = cvpro.normalizeAnalysis(cvpro.fakeAnalysis('Juan Pérez\nFinca Los Nogales - Podador 2021-2024\njuan@mail.com'));
check('el análisis simulado sale de los datos', fa.checks.length === 15 && fa.extracted.experience.length >= 1);
const fc = cvpro.normalizeCv(cvpro.fakeCv(fa.extracted), cvpro.allowedCorpus('Juan Pérez Finca Los Nogales Podador'));
check('el CV simulado pasa la validación sin perder la experiencia', fc.experience.length >= 1 && cvpro.DESIGNS.includes(fc.design));

console.log('— Instrucciones a la IA —');
const ap = cvpro.analyzePrompt({ text: 'mi cv', profile: { name: 'Ana' } });
const gp = cvpro.generatePrompt({ extracted: fa.extracted, inputs: { idiomas: 'Inglés básico' }, request: 'orientalo a gastronomía' });
check('piden sólo JSON y prohíben inventar', /JSON/.test(ap.system) && /invent/i.test(ap.system) && /JSON/.test(gp.system) && /invent/i.test(gp.system));
check('el pedido de generación lista diseños, colores y secciones permitidos', cvpro.DESIGNS.every((d) => gp.system.includes(d)) && cvpro.ACCENTS.every((a) => gp.system.includes(a.id)));
check('incluyen lo que dio la persona', ap.user.includes('mi cv') && gp.user.includes('Inglés básico') && gp.user.includes('gastronomía'));

console.log(`\n${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
