/**
 * Pruebas de la base de la Guía del Valle (métodos de Store): fichas, búsqueda,
 * destacados, estadísticas, reclamo, bloqueo y borrado.
 *   node tools/test-places-store.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-places-'));
const s = new Store(path.join(dir, 'db.sqlite'));
let ok = 0; let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

try {
  const base = { section: 'comida', category: 'Pizzería', name: 'Pizzería Uco', description: 'Pizzas a la piedra todos los días.', localities: ['Tunuyán'], whatsapp: '2622 555123', status: 'approved', ownerType: 'company', ownerId: 'c1' };
  const p = s.insertPlace(base);
  check('crea la ficha con id y slug legible', !!p.id && p.slug === 'pizzeria-uco');
  check('localidades como lista', Array.isArray(p.localities) && p.localities[0] === 'Tunuyán');
  const h = s.insertPlace({ ...base, name: 'Con Horario', section: 'servicios', category: 'Lavadero', description: 'Lavado de ropa por kilo.', ownerId: 'c9', hours: { mode: '24h', days: {} } });
  check('el horario se lee como objeto', !!h.hours && h.hours.mode === '24h', JSON.stringify(h.hours));
  const p2 = s.insertPlace({ ...base });
  check('slug repetido lleva sufijo', p2.slug === 'pizzeria-uco-2');
  check('placeBySlug', s.placeBySlug('pizzeria-uco-2').id === p2.id);
  check('búsqueda por sección y localidad', s.searchPlaces({ section: 'comida', locality: 'Tunuyán' }).total === 2);
  check('otra localidad no aparece', s.searchPlaces({ section: 'comida', locality: 'Tupungato' }).total === 0);
  s.insertPlace({ ...base, name: 'Pendiente Total', status: 'pending' });
  check('pendiente no aparece', s.searchPlaces({ q: 'Pendiente' }).total === 0);
  check('busca por texto', s.searchPlaces({ q: 'piedra' }).total === 2);

  s.setPlaceFeatured(p2.id, Date.now() + 86400000);
  check('destacada vigente primero', s.searchPlaces({ section: 'comida' }).places[0].id === p2.id);
  check('marca featured', s.place(p2.id).featured === true);
  s.setPlaceFeatured(p2.id, Date.now() - 1);
  check('destacada vencida no figura como destacada', s.place(p2.id).featured === false);
  s.setPlaceFeatured(p2.id, 0);
  check('0 = destacada sin vencimiento', s.place(p2.id).featured === true);
  s.setPlaceFeatured(p2.id, null);
  check('null = quitar', s.place(p2.id).featured === false);

  s.bumpPlaceStat(p.id, 'views'); s.bumpPlaceStat(p.id, 'whatsapp'); s.bumpPlaceStat(p.id, 'calls');
  const st = s.placeStats(p.id);
  check('estadísticas de la semana', st.week.views === 1 && st.week.contacts === 2, JSON.stringify(st));
  check('estadísticas del mes', st.month.views === 1 && st.month.contacts === 2);

  check('fichas de un dueño', s.placesOf('company', 'c1').length === 3 && s.countPlacesOf('company', 'c1') === 3);

  const u = s.insertPlace({ ...base, name: 'Lavadero Sin Dueño', section: 'servicios', category: 'Lavadero', ownerType: null, ownerId: null, imported: 1, claimToken: 'a'.repeat(48) });
  check('sin dueño figura como no reclamada', u.claimed === false && u.imported === true);
  check('placeByClaimToken', s.placeByClaimToken('a'.repeat(48)).id === u.id);
  check('reclamo atómico', !!s.claimPlace(u.id, 'candidate', 'u1') && s.claimPlace(u.id, 'candidate', 'u2') === null);
  check('reclamada queda del dueño y sin token', s.place(u.id).ownerId === 'u1' && s.place(u.id).claimed === true && !s.placeByClaimToken('a'.repeat(48)));

  s.addPlaceBlock('2622555123', 'pizzeria uco', 'Pizzería Uco');
  check('bloqueo de la guía', s.placeBlocked('2622555123', '') && s.placeBlocked('', 'pizzeria uco'));
  check('no bloquea los importados de empleo', !s.blocked('2622555123', '') && !s.blocked('', 'pizzeria uco'));

  const withPhotos = s.insertPlace({ ...base, name: 'Con Fotos', photoFiles: ['place-a.jpg', 'place-b.jpg'] });
  check('fotos como URLs', withPhotos.photos[0] === '/media/place-a.jpg' && withPhotos.photoFiles.length === 2);
  s.bumpPlaceStat(withPhotos.id, 'views');
  const files = s.deletePlace(withPhotos.id);
  check('borrar devuelve las fotos', files.length === 2 && !s.place(withPhotos.id));
  check('borrar limpia estadísticas', s.placeStats(withPhotos.id).month.views === 0);

  const before = s.place(p.id).updatedAt;
  const upd = s.updatePlace(p.id, { description: 'Pizzas a la piedra y empanadas.' });
  check('actualizar cambia el texto y la fecha', upd.description.includes('empanadas') && upd.updatedAt >= before);
  s.setPlaceStatus(p.id, 'approved');
  /* que el cambio caiga al menos 1 ms después de la aprobación (si no, a veces coinciden y la prueba falla sola) */
  for (const t0 = Date.now(); Date.now() === t0;);
  s.updatePlace(p.id, { address: 'San Martín 100' });
  check('cambios recientes', s.recentPlaceChanges().some((r) => r.id === p.id));
  s.setPlaceStatus(p.id, 'rejected', 'Faltan fotos');
  check('estado y motivo', s.place(p.id).status === 'rejected' && s.place(p.id).rejectReason === 'Faltan fotos');
} catch (e) {
  fail++; console.error('ERROR:', e);
} finally {
  try { s.db.close(); } catch (_) { /* nada */ }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
