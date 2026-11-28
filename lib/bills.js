'use strict';
/* Recordatorios de pagos de WorkUco (servidor, dominio): fechas en hora argentina y avisos al celular del admin
   5 días antes, 2 días antes, el mismo día y, si quedó sin pagar, una vez por día hasta que se marque pagado. */

const DEFAULT_BILLS = [
  { id: 'cloud', name: 'Cloud Server de DonWeb', period: 'mes', next: null, where: 'DonWeb → Mi cuenta → Facturación' },
  { id: 'dominio', name: 'Dominio workuco.com.ar', period: 'anio', next: null, where: 'Donde se compró el dominio (DonWeb o nic.ar)' },
];
const STEPS = [5, 2, 0];

/* "hoy" en Argentina (UTC-3, sin horario de verano), como YYYY-MM-DD */
const todayAR = (ms = Date.now()) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const dayMs = (s) => Date.parse(`${s}T00:00:00Z`);
const daysUntil = (next, today) => Math.round((dayMs(next) - dayMs(today)) / 86400000);

/* el próximo vencimiento: un mes o un año después, sin pasarse de mes (31/01 → 28 o 29/02) */
function advance(next, period) {
  const [y, m, d] = next.split('-').map(Number);
  const ty = period === 'anio' ? y + 1 : m === 12 ? y + 1 : y;
  const tm = period === 'anio' ? m : m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/* lista guardada + los pagos por defecto que falten (sin pisar lo que el admin cargó) */
function normalize(saved) {
  const list = Array.isArray(saved) ? saved.filter((b) => b && b.id) : [];
  for (const d of DEFAULT_BILLS) if (!list.some((b) => b.id === d.id)) list.push({ ...d, sent: {} });
  return list.map((b) => ({ ...b, next: validDate(b.next) ? b.next : null, sent: b.sent && typeof b.sent === 'object' ? b.sent : {} }));
}

/* qué aviso toca hoy para un pago (o null): '5', '2', '0' o 'v<fecha>' (vencido, uno por día) */
function stepFor(b, today) {
  if (!b.next) return null;
  const d = daysUntil(b.next, today);
  if (d < 0) return `v${today}`;
  return STEPS.includes(d) ? String(d) : null;
}
function message(b, today) {
  const d = daysUntil(b.next, today);
  const fecha = b.next.split('-').reverse().join('/');
  if (d < 0) return { title: `Pago vencido: ${b.name}`, body: `Vencía el ${fecha}. Cuando lo pagues, tocá "Ya lo pagué" en el admin.` };
  if (d === 0) return { title: `Hoy vence: ${b.name}`, body: `Pagalo hoy (${fecha}). ${b.where || ''}`.trim() };
  return { title: `En ${d} días vence: ${b.name}`, body: `Vence el ${fecha}. ${b.where || ''}`.trim() };
}
/* revisa la lista: devuelve los avisos a mandar y la lista con lo mandado anotado (no se repite) */
function due(list, today) {
  const out = [];
  const next = list.map((b) => {
    const step = stepFor(b, today);
    const key = step ? `${b.next}:${step}` : '';
    if (!step || b.sent[key]) return b;
    out.push({ id: b.id, ...message(b, today) });
    return { ...b, sent: { ...b.sent, [key]: Date.now() } };
  });
  return { notices: out, list: next };
}
/* para mostrar en el admin */
function view(list, today) {
  return list.map((b) => ({ id: b.id, name: b.name, period: b.period, where: b.where || '', next: b.next,
    days: b.next ? daysUntil(b.next, today) : null }));
}

module.exports = { DEFAULT_BILLS, todayAR, validDate, daysUntil, advance, normalize, due, view, stepFor };
