/**
 * Pruebas de la lógica de la Guía del Valle (lib/places.js): rubros, horario,
 * "abierto ahora", Instagram, WhatsApp y validación de fichas.
 *   node tools/test-places-lib.js
 */
'use strict';
const L = require('../lib/places');

let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
const at = (iso) => Date.parse(iso); // fechas en UTC; Argentina = UTC-3

console.log('— Rubros —');
check('cuatro secciones en orden', Object.keys(L.SECTIONS).join() === 'oficios,servicios,salidas,comida');
check('oficios incluye gasista y termina en Otro', L.SECTIONS.oficios.categories.includes('Gasista') && L.SECTIONS.oficios.categories.at(-1) === 'Otro');
check('comida incluye pizzería', L.SECTIONS.comida.categories.includes('Pizzería'));

console.log('— Horario y "abierto ahora" —');
const bar = L.normalizeHours({ mode: 'horario', days: { sab: [['23:00', '06:00']], dom: [['23:00', '06:00']] } });
check('sábado 23:30 AR abierto', L.openStatus(bar, at('2026-11-15T02:30:00Z')).state === 'open');
check('domingo 02:00 AR abierto por el tramo del sábado', L.openStatus(bar, at('2026-11-15T05:00:00Z')).state === 'open');
check('lunes 02:00 AR abierto por el tramo del domingo', L.openStatus(bar, at('2026-11-16T05:00:00Z')).state === 'open');
check('lunes 07:00 AR cerrado', L.openStatus(bar, at('2026-11-16T10:00:00Z')).state === 'closed');
const shop = L.normalizeHours({ mode: 'horario', days: { lun: [['09:00', '13:00'], ['17:00', '21:00']] } });
const s = L.openStatus(shop, at('2026-11-16T13:00:00Z')); // lunes 10:00 AR
check('abierto con cierre 13:00', s.state === 'open' && s.until === '13:00', JSON.stringify(s));
const c = L.openStatus(shop, at('2026-11-16T17:00:00Z')); // lunes 14:00 AR
check('cerrado, abre 17:00', c.state === 'closed' && c.opens === '17:00', JSON.stringify(c));
check('24 horas', L.openStatus(L.normalizeHours({ mode: '24h' })).state === 'always');
check('con turno', L.openStatus(L.normalizeHours({ mode: 'turno' })).state === 'appointment');
check('sin horario', L.openStatus(null).state === 'unknown');
check('hora inválida se descarta', L.normalizeHours({ mode: 'horario', days: { lun: [['25:00', '13:00']], mar: [['09:00', '13:00']] } }).days.lun.length === 0);
check('más de dos tramos se recorta', L.normalizeHours({ mode: 'horario', days: { lun: [['08:00', '09:00'], ['10:00', '11:00'], ['12:00', '13:00']] } }).days.lun.length === 2);
check('horario vacío es null', L.normalizeHours({ mode: 'horario', days: {} }) === null);

console.log('— Instagram y WhatsApp —');
check('instagram @x', L.normInstagram('@pizzeria.uco') === 'pizzeria.uco');
check('instagram URL', L.normInstagram('https://www.instagram.com/pizzeria_uco/?hl=es') === 'pizzeria_uco');
check('instagram basura', L.normInstagram('<script>') === '');
check('WhatsApp de celular local', L.waLink('+54 9 2622 15-555123') === 'https://wa.me/5492622555123');
check('WhatsApp con 0', L.waLink('02622 555123') === 'https://wa.me/5492622555123');
check('WhatsApp vacío', L.waLink('123') === '');

console.log('— Validación —');
const base = { name: 'Gas Don Tito', section: 'oficios', category: 'Gasista', localities: ['Tunuyán'], description: 'Instalaciones y reparaciones de gas, matriculado.', whatsapp: '2622 555123' };
check('ficha válida', L.validatePlace(base).ok, JSON.stringify(L.validatePlace(base).errors));
check('rubro de otra sección no', !L.validatePlace({ ...base, category: 'Boliche' }).ok);
check('sección inexistente no', !!L.validatePlace({ ...base, section: 'otra' }).errors.section);
check('sin contacto no', !!L.validatePlace({ ...base, whatsapp: '', phone: '' }).errors.whatsapp);
check('con sólo teléfono sí', L.validatePlace({ ...base, whatsapp: '', phone: '2622 444555' }).ok);
check('sin localidad no', !!L.validatePlace({ ...base, localities: [] }).errors.localities);
check('localidad inventada se descarta', L.validatePlace({ ...base, localities: ['Tunuyán', 'Mendoza'] }).data.localities.join() === 'Tunuyán');
check('nombre corto no', !!L.validatePlace({ ...base, name: 'G' }).errors.name);
check('descripción corta no', !!L.validatePlace({ ...base, description: 'Gas' }).errors.description);
check('sitio javascript: no', L.validatePlace({ ...base, website: 'javascript:alert(1)' }).data.website === '');
check('sitio https sí', L.validatePlace({ ...base, website: 'https://gasdontito.com.ar' }).data.website === 'https://gasdontito.com.ar');
check('a domicilio sólo en oficios', L.validatePlace({ ...base, section: 'comida', category: 'Pizzería', homeService: true }).data.homeService === false);
check('a domicilio en oficios', L.validatePlace({ ...base, homeService: true }).data.homeService === true);
check('instagram se normaliza al validar', L.validatePlace({ ...base, instagram: '@gas.tito' }).data.instagram === 'gas.tito');

console.log(`\n${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
