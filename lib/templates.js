/**
 * WorkUco — plantillas de aviso por rubro.
 * Sirven de punto de partida en el wizard de publicación: la empresa las edita a gusto.
 */
'use strict';

const TEMPLATES = [
  {
    id: 'cosecha', label: 'Cosecha / vendimia', category: 'Agricultura', type: 'Temporal', gig: true,
    title: 'Cosechadores para temporada',
    description: 'Buscamos personas para la cosecha de esta temporada. El trabajo es al aire libre, en cuadrilla, con pago por jornada y traslado desde el punto de encuentro.',
    responsibilities: '• Cosecha manual cuidando la fruta y la planta.\n• Carga de tachos o bins.\n• Respetar las indicaciones del encargado de cuadrilla.',
    requirements: '• Ganas de trabajar y buen estado físico.\n• Puntualidad.\n• No hace falta experiencia: enseñamos el primer día.',
    skills: ['Cosecha', 'Trabajo en equipo', 'Resistencia física'],
    benefits: ['Transporte', 'Comida incluida'],
  },
  {
    id: 'bodega', label: 'Operario de bodega', category: 'Agricultura', type: 'Tiempo completo', gig: false,
    title: 'Operario/a de bodega',
    description: 'Sumamos una persona al equipo de producción de la bodega. Las tareas cambian según la época: recepción de uva en vendimia y fraccionamiento el resto del año.',
    responsibilities: '• Recepción y selección de uva.\n• Limpieza de tanques y líneas.\n• Fraccionado y etiquetado.\n• Control de stock de insumos.',
    requirements: '• Experiencia en bodega o producción (deseable).\n• Disponibilidad en vendimia, incluidos algunos sábados.\n• Carnet de manipulación de alimentos o disposición a tramitarlo.',
    skills: ['Fraccionamiento', 'Etiquetado', 'Control de stock', 'BPM'],
    benefits: ['Comida incluida', 'Capacitación', 'Obra social'],
  },
  {
    id: 'mozo', label: 'Mozo / moza', category: 'Gastronomía', type: 'Medio tiempo', gig: false,
    title: 'Mozo/a para salón',
    description: 'Buscamos mozo o moza para atender el salón. Lo más importante del puesto es el buen trato: que cada persona que entra se quiera quedar y volver.',
    responsibilities: '• Recibir y ubicar a los clientes.\n• Tomar pedidos y servir.\n• Cobrar y cerrar mesas.\n• Mantener el salón en orden.',
    requirements: '• Buen trato y predisposición.\n• Disponibilidad fines de semana y feriados.\n• Experiencia en gastronomía (deseable).',
    skills: ['Atención al público', 'Manejo de bandeja', 'Manejo de caja'],
    benefits: ['Comida incluida', 'Uniforme'],
  },
  {
    id: 'cocina', label: 'Cocina', category: 'Gastronomía', type: 'Tiempo completo', gig: false,
    title: 'Cocinero/a',
    description: 'Buscamos cocinero o cocinera para nuestra cocina. Trabajamos con productos de la zona y un menú que cambia con la temporada, en un equipo chico donde todos opinan.',
    responsibilities: '• Preparación y despacho de platos.\n• Mise en place y orden de la cocina.\n• Control de stock y pedidos.\n• Cumplir las normas de higiene.',
    requirements: '• Experiencia en cocina de restaurante u hotel.\n• Carnet de manipulador de alimentos.\n• Trabajo en equipo.',
    skills: ['Cocina', 'Mise en place', 'Manipulación de alimentos', 'Control de stock'],
    benefits: ['Comida incluida', 'Uniforme', 'Capacitación'],
  },
  {
    id: 'ventas', label: 'Ventas en comercio', category: 'Comercio', type: 'Medio tiempo', gig: false,
    title: 'Vendedor/a para local',
    description: 'Buscamos vendedor o vendedora para atender el local. Queremos a alguien que disfrute asesorar a los clientes y mantener el negocio prolijo y surtido.',
    responsibilities: '• Atención y asesoramiento al cliente.\n• Cobro en caja y cierre de turno.\n• Reposición y orden de la mercadería.',
    requirements: '• Buena comunicación.\n• Manejo básico de caja.\n• Disponibilidad los sábados.',
    skills: ['Ventas', 'Atención al público', 'Manejo de caja', 'Reposición'],
    benefits: ['Bonos por objetivos', 'Capacitación'],
  },
  {
    id: 'administracion', label: 'Administración', category: 'Administración', type: 'Tiempo completo', gig: false,
    title: 'Administrativo/a',
    description: 'Buscamos una persona para el área administrativa. Va a llevar el día a día de la oficina: facturación, proveedores, bancos y atención de consultas.',
    responsibilities: '• Facturación y carga de comprobantes.\n• Seguimiento de pagos y cobranzas.\n• Conciliaciones bancarias.\n• Archivo y atención telefónica.',
    requirements: '• Secundario completo; estudios afines (deseable).\n• Manejo de Excel.\n• Orden y prolijidad.',
    skills: ['Excel', 'Facturación', 'Conciliaciones bancarias', 'Atención al cliente'],
    benefits: ['Obra social', 'Capacitación', 'Crecimiento interno'],
  },
  {
    id: 'obra', label: 'Obra / construcción', category: 'Construcción', type: 'Tiempo completo', gig: false,
    title: 'Oficial albañil',
    description: 'Incorporamos oficial albañil para obra en la zona. Buscamos una persona prolija, que sepa leer las indicaciones del capataz y cuide las herramientas y la seguridad.',
    responsibilities: '• Mampostería, revoques y contrapisos.\n• Interpretar planos e indicaciones.\n• Cuidar herramientas y materiales.\n• Cumplir las normas de seguridad.',
    requirements: '• Experiencia como oficial.\n• Manejo de herramientas manuales y eléctricas.\n• Puntualidad y trabajo en equipo.',
    skills: ['Albañilería', 'Revoque', 'Lectura de planos', 'Seguridad e higiene'],
    benefits: ['Uniforme', 'Obra social'],
  },
  {
    id: 'turismo', label: 'Turismo / recepción', category: 'Turismo', type: 'Temporal', gig: false,
    title: 'Recepcionista para temporada',
    description: 'Buscamos una persona para recibir a los visitantes durante la temporada alta. Es la primera cara que ven al llegar: buscamos calidez, orden y ganas de recomendar el Valle.',
    responsibilities: '• Recibir y despedir a los huéspedes.\n• Responder consultas en persona, por teléfono y por mensaje.\n• Coordinar reservas, excursiones y traslados.',
    requirements: '• Buen trato con el público.\n• Inglés intermedio (deseable).\n• Disponibilidad fines de semana y feriados.',
    skills: ['Atención al público', 'Inglés', 'Reservas', 'Recepción'],
    benefits: ['Comida incluida', 'Capacitación'],
  },
];

module.exports = { TEMPLATES };
