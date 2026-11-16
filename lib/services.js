'use strict';
/**
 * Servicios que WorkUco puede ofrecerles a las empresas (más adelante, con cobro aparte).
 * Por ahora sólo se mide el interés: la empresa marca "Me interesa" y acepta que la contacten.
 * Para sumar un servicio alcanza con agregarlo acá (el id se guarda en la base; no cambiarlo).
 */
const SERVICES = [
  { id: 'ia', label: 'Automatización con IA', description: 'Respuestas automáticas por WhatsApp, ordenar postulantes, resúmenes y reportes sin trabajo manual.' },
  { id: 'web', label: 'Página web', description: 'Tu propio sitio con tu dominio, rápido, lindo en el celular y fácil de encontrar en Google.' },
  { id: 'sistemas', label: 'Programas a medida', description: 'Stock, pedidos, turnos o facturación: un sistema hecho para cómo trabaja tu empresa.' },
];
const SERVICE_IDS = SERVICES.map((s) => s.id);
const EMPLOYEES = ['1 a 5', '6 a 20', '21 a 50', 'Más de 50'];
const NOTE_MAX = 600;

/** Devuelve sólo ids válidos, sin repetir, en el orden en que llegaron. */
function cleanServices(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => SERVICE_IDS.includes(id)))];
}

/** El interés guardado de una empresa (fila de la base) en la forma que ve el panel. */
function interestOf(c) {
  let services = [];
  try { services = cleanServices(JSON.parse((c && c.services_interest) || '[]')); } catch (_) { services = []; }
  return {
    services,
    note: (c && c.services_note) || '',
    marketingOk: !!(c && c.marketing_ok),
    at: (c && c.services_at) || 0,
  };
}

module.exports = { SERVICES, SERVICE_IDS, EMPLOYEES, NOTE_MAX, cleanServices, interestOf };
