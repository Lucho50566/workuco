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

/* Motivos en la voz de quien lee: la persona (vos) o la empresa (tercera persona). */
const VOICE = {
  candidate: {
    oneSkill: 'Tenés la habilidad que piden',
    skills: (h, n) => `Tenés ${h} de las ${n} habilidades`,
    textOne: 'Una de tus habilidades aparece en el aviso',
    text: (h) => `${h} de tus habilidades aparecen en el aviso`,
    remote: 'Es remoto: podés hacerlo desde donde vivís',
    local: (l) => `Es en ${l}, donde vivís`,
    category: (c) => `Te interesa ${c}`,
    availability: 'Tu disponibilidad encaja',
    salary: 'El sueldo llega a lo que buscás',
  },
  company: {
    oneSkill: 'Tiene la habilidad que pedís',
    skills: (h, n) => `Tiene ${h} de las ${n} habilidades`,
    textOne: 'Una de sus habilidades aparece en el aviso',
    text: (h) => `${h} de sus habilidades aparecen en el aviso`,
    remote: 'Es remoto: puede hacerlo desde donde vive',
    local: (l) => `Vive en ${l}`,
    category: (c) => `Le interesa ${c}`,
    availability: 'Su disponibilidad encaja',
    salary: null, // el sueldo pretendido es privado de la persona
  },
};

function matchScore(candidate, job, { audience = 'candidate' } = {}) {
  const v = VOICE[audience] || VOICE.candidate;
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
      reasons.push(jSkills.length === 1 ? v.oneSkill : v.skills(hit.length, jSkills.length));
    }
  } else {
    const text = norm(`${j.title || ''} ${j.requirements || ''} ${j.description || ''}`);
    const hits = [...have].filter((s) => s.length > 2 && text.includes(s)).length;
    score += WEIGHTS.skills * Math.min(1, hits / 3);
    if (hits) reasons.push(hits === 1 ? v.textOne : v.text(hits));
  }

  /* localidad */
  if (norm(j.modality) === 'remoto') {
    score += WEIGHTS.locality; reasons.push(v.remote);
  } else if (norm(c.locality) && norm(c.locality) === norm(j.locality)) {
    score += WEIGHTS.locality; reasons.push(v.local(j.locality));
  }

  /* rubro */
  const cat = norm(j.category);
  if (cat) {
    const cats = list(c.categories).map(norm);
    const byText = !cats.length && norm(`${c.headline || ''} ${c.experience || ''}`).includes(cat);
    if (cats.includes(cat) || byText) { score += WEIGHTS.category; reasons.push(v.category(j.category)); }
  }

  /* disponibilidad */
  if (availabilityOk(c.availability, j.type)) {
    score += WEIGHTS.availability;
    if (norm(c.availability) && norm(j.type)) reasons.push(v.availability);
  }

  /* sueldo */
  const want = Number(c.salaryMin) || 0;
  const pays = Number(j.salaryMax) || Number(j.salaryMin) || 0;
  if (!want || !pays || pays >= want) {
    score += WEIGHTS.salary;
    if (want && pays && v.salary) reasons.push(v.salary);
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, missing };
}

module.exports = { matchScore, norm, WEIGHTS };
