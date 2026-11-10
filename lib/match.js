/**
 * Workuco — compatibilidad entre un perfil y una oferta.
 * Función pura: no toca la base ni usa IA. Devuelve un puntaje 0..100 con el porqué.
 */
'use strict';

const WEIGHTS = { skills: 45, locality: 20, category: 15, availability: 10, salary: 10 };

const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter(Boolean);

/* Tipos de empleo que acepta cada disponibilidad declarada. */
const AVAILABILITY = [
  ['tiempo completo', ['tiempo completo', 'temporal', 'pasantia']],
  ['medio tiempo', ['medio tiempo', 'temporal', 'pasantia', 'freelance']],
  ['turnos rotativos', ['tiempo completo', 'medio tiempo', 'temporal']],
  ['fines de semana', ['medio tiempo', 'temporal', 'freelance']],
  ['disponibilidad inmediata', ['tiempo completo', 'medio tiempo', 'temporal', 'pasantia', 'freelance']],
];

function availabilityOk(availability, type) {
  const a = norm(availability);
  const t = norm(type);
  if (!a || !t) return true;
  const known = AVAILABILITY.filter(([key]) => a.includes(key));
  if (!known.length) return true; // texto libre: no penalizamos
  return known.some(([, types]) => types.includes(t));
}

function matchScore(candidate, job) {
  const c = candidate || {};
  const j = job || {};
  const cSkills = list(c.skills);
  const empty = { score: null, reasons: [], missing: [] };
  if (!cSkills.length && !norm(c.locality)) return empty;

  const reasons = [];
  let missing = [];
  let score = 0;

  /* habilidades */
  const have = new Set(cSkills.map(norm));
  const jSkills = list(j.skills);
  if (jSkills.length) {
    const hit = jSkills.filter((s) => have.has(norm(s)));
    missing = jSkills.filter((s) => !have.has(norm(s)));
    score += WEIGHTS.skills * (hit.length / jSkills.length);
    if (hit.length) {
      reasons.push(jSkills.length === 1 ? 'Tenés la habilidad que piden'
        : `Tenés ${hit.length} de las ${jSkills.length} habilidades`);
    }
  } else {
    const text = norm(`${j.title || ''} ${j.requirements || ''} ${j.description || ''}`);
    const hits = [...have].filter((s) => s.length > 2 && text.includes(s)).length;
    score += WEIGHTS.skills * Math.min(1, hits / 3);
    if (hits) reasons.push(hits === 1 ? 'Una de tus habilidades aparece en el aviso' : `${hits} de tus habilidades aparecen en el aviso`);
  }

  /* localidad */
  if (norm(j.modality) === 'remoto') {
    score += WEIGHTS.locality; reasons.push('Es remoto: podés hacerlo desde donde vivís');
  } else if (norm(c.locality) && norm(c.locality) === norm(j.locality)) {
    score += WEIGHTS.locality; reasons.push(`Es en ${j.locality}, donde vivís`);
  }

  /* rubro */
  const cat = norm(j.category);
  if (cat) {
    const cats = list(c.categories).map(norm);
    const byText = !cats.length && norm(`${c.headline || ''} ${c.experience || ''}`).includes(cat);
    if (cats.includes(cat) || byText) { score += WEIGHTS.category; reasons.push(`Te interesa ${j.category}`); }
  }

  /* disponibilidad */
  if (availabilityOk(c.availability, j.type)) {
    score += WEIGHTS.availability;
    if (norm(c.availability) && norm(j.type)) reasons.push('Tu disponibilidad encaja');
  }

  /* sueldo */
  const want = Number(c.salaryMin) || 0;
  const pays = Number(j.salaryMax) || Number(j.salaryMin) || 0;
  if (!want || !pays || pays >= want) {
    score += WEIGHTS.salary;
    if (want && pays) reasons.push('El sueldo llega a lo que buscás');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, missing };
}

module.exports = { matchScore, norm, WEIGHTS };
