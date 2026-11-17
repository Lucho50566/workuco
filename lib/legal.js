'use strict';
/* Cumplimiento legal (Argentina): datos del responsable, versión de los términos y
   detección de pedidos discriminatorios en avisos (Ley 23.592; LCT 20.744 arts. 17 y 81).
   La detección no bloquea: avisa a la empresa al publicar y al equipo al revisar. */

const TERMS_VERSION = '2026-11-17';

/* Datos del responsable del sitio y de la base de datos (Ley 25.326 art. 6; Res. 104/2005).
   Se completan con variables de entorno en producción. */
function legalInfo(env = process.env) {
  return {
    name: env.WORKUCO_LEGAL_NAME || '',
    cuit: env.WORKUCO_LEGAL_CUIT || '',
    address: env.WORKUCO_LEGAL_ADDRESS || '',
    email: env.WORKUCO_LEGAL_EMAIL || 'hola@workuco.com.ar',
    dbRegistry: env.WORKUCO_DB_REGISTRY || '',
    termsVersion: TERMS_VERSION,
  };
}

/* [expresión, explicación]. Se comparte con el navegador vía /api/meta. */
const DISCRIMINATION_RULES = [
  ['\\b(buena|excelente|muy buena)\\s+presencia\\b', '"Buena presencia" se considera discriminatorio: describí la tarea (por ejemplo, "atención al público").'],
  /* edad: "edad 20 a 30", "entre 25 y 35 años", "hasta 35 años", "menores de 30" (18 y 16 son límites legales, no cuentan) */
  ['\\bedad\\b[^.\\n]{0,24}?\\d{2}|\\bentre\\s+\\d{2}\\s+y\\s+\\d{2}\\s+años|\\b(hasta|máximo|maximo|no mayor(es)? de|menor(es)? de)\\s+(?!1[68]\\b)\\d{2}\\s+años|\\bmenor(es)? de\\s+(?!1[68]\\b)\\d{2}\\b', 'Pedir una edad determinada es discriminatorio. Si por ley el puesto exige ser mayor de 18, aclaralo así.'],
  ['\\b(sólo|solo|solamente|exclusivamente|únicamente|unicamente)\\s+(hombres|mujeres|varones|masculino|femenino|chicas|chicos)\\b', 'Restringir por sexo o género es discriminatorio: el puesto es para cualquier persona.'],
  ['\\bsexo\\s*:?\\s*(masculino|femenino)\\b', 'Restringir por sexo es discriminatorio.'],
  ['\\b(estado civil|solter[oa]s?|casad[oa]s?|sin hijos)\\b', 'El estado civil o tener hijos no puede ser requisito.'],
  ['\\b(nacionalidad argentina|sólo argentinos|solo argentinos)\\b', 'Exigir una nacionalidad suele ser discriminatorio (alcanza con estar habilitado para trabajar en el país).'],
  ['\\b(contextura|delgad[oa]s?|altura mínima|altura minima|foto de cuerpo entero)\\b', 'El aspecto físico no puede ser requisito salvo que la tarea lo exija de verdad.'],
  ['\\b(religi[oó]n|cat[oó]lic[oa]s?|evang[eé]lic[oa]s?)\\b', 'La religión no puede ser requisito.'],
];

function discriminationHints(...texts) {
  const text = texts.filter(Boolean).join('\n');
  const out = [];
  for (const [src, msg] of DISCRIMINATION_RULES) {
    const m = text.match(new RegExp(src, 'iu'));
    if (m && !out.some((o) => o.message === msg)) out.push({ match: m[0], message: msg });
  }
  return out;
}

module.exports = { TERMS_VERSION, legalInfo, DISCRIMINATION_RULES, discriminationHints };
