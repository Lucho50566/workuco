/**
 * Datos de demostración de Workuco.
 * Empresas y personas ficticias (emails @demo.workuco) para probar la plataforma.
 */
'use strict';
const crypto = require('crypto');

const hash = (pass) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pass, salt, 64).toString('hex')}`;
};
const DEMO_PASS = 'demo12345';

const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (n) => iso(now + n * DAY);

function build() {
  const companies = [
    {
      id: 'cdemo01bodega', name: 'Bodega Alto Uco', email: 'bodega@demo.workuco', phone: '+54 2622 45-1180',
      website: 'https://bodegaaltouco.example', verified: 1, plan: 'pro',
      description: 'Bodega boutique de San Carlos. Producimos vinos de altura en pequeños lotes y recibimos visitantes durante todo el año.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo02finca', name: 'Finca Los Nogales', email: 'finca@demo.workuco', phone: '+54 2622 47-9032',
      website: '', verified: 1, plan: 'free',
      description: 'Finca familiar de Tunuyán dedicada a la producción de ciruelas, duraznos y nogales.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo03cafe', name: 'Café de la Plaza', email: 'cafe@demo.workuco', phone: '+54 2622 42-3311',
      website: '', verified: 0, plan: 'free',
      description: 'Cafetería y pastelería artesanal en el centro de Tupungato.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo04posada', name: 'Posada Valle Verde', email: 'posada@demo.workuco', phone: '+54 2622 49-2277',
      website: 'https://posadavalleverde.example', verified: 1, plan: 'free',
      description: 'Posada de montaña con 12 habitaciones, desayuno casero y excursiones guiadas.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo05constructora', name: 'Constructora Andina Sur', email: 'obras@demo.workuco', phone: '+54 2622 41-6650',
      website: '', verified: 0, plan: 'free',
      description: 'Empresa de construcción y refacciones con obras en todo el Valle de Uco.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo06estudio', name: 'Estudio Contable del Valle', email: 'estudio@demo.workuco', phone: '+54 2622 43-8890',
      website: '', verified: 1, plan: 'free',
      description: 'Estudio contable e impositivo que atiende a pymes y productores de la zona.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo07tienda', name: 'Tienda Natural Uco', email: 'tienda@demo.workuco', phone: '+54 2622 46-5544',
      website: '', verified: 0, plan: 'free',
      description: 'Almacén de productos naturales, dietéticos y regionales en Tunuyán.',
      password: hash(DEMO_PASS),
    },
  ];

  const c = (i) => companies[i].id;

  const base = {
    responsibilities: '• Cumplir el horario acordado y las normas de seguridad.\n• Mantener el orden y la limpieza de tu puesto de trabajo.\n• Comunicar novedades y problemas al responsable del área.',
    requirements: '• Secundario completo.\n• Predisposición para el trabajo en equipo.\n• Referencias personales o laborales.',
    experience: 'No excluyente. Se valora experiencia previa en tareas similares.',
    schedule: 'Lunes a viernes, 8 a 17 h.',
    salary: 'A convenir según experiencia',
    contactPhone: '',
    status: 'approved',
  };

  const raw = [
    {
      id: 'jdemo001', companyId: c(0), title: 'Operario de bodega y fraccionamiento', locality: 'San Carlos',
      category: 'Agricultura', type: 'Tiempo completo', modality: 'Presencial', featured: 1,
      description: 'Buscamos una persona para sumarse al equipo de producción de nuestra bodega en San Carlos. El puesto combina tareas de bodega durante la vendimia y fraccionamiento durante el resto del año.\n\nTrabajamos con pequeños lotes de vinos de altura, por lo que valoramos la atención al detalle y el cuidado en cada etapa del proceso.',
      responsibilities: '• Recepción y selección de uva durante la cosecha.\n• Limpieza de tanques, barricas y líneas de fraccionamiento.\n• Fraccionado y etiquetado de botellas.\n• Control de stock de insumos e informes diarios al encargado.',
      requirements: '• Experiencia en bodega o producción (deseable).\n• Disponibilidad para trabajar durante la vendimia, incluidos algunos sábados.\n• Carnet de manipulación de alimentos (o disposición a tramitarlo).',
      experience: '1 año en tareas de bodega o producción.',
      schedule: 'Lunes a viernes de 8 a 16 h. Horas extra en vendimia.',
      salary: '$ 900.000 a $ 1.100.000 brutos',
      contactEmail: 'rrhh@demo.workuco', closesAt: addDays(24), publishedAt: now - 2 * DAY, featured: 1,
    },
    {
      id: 'jdemo002', companyId: c(1), title: 'Tractorista para finca de frutales', locality: 'Tunuyán',
      category: 'Agricultura', type: 'Temporal', modality: 'Presencial', featured: 1,
      description: 'Finca Los Nogales incorpora un tractorista para la temporada de labores culturales y cosecha de frutales en Tunuyán.\n\nEl trabajo se desarrolla al aire libre, en un equipo de 8 personas, con maquinaria propia de la finca.',
      responsibilities: '• Manejo de tractor para laboreo, pulverización y traslado de bins.\n• Mantenimiento básico de la maquinaria asignada.\n• Registro diario de las tareas realizadas.\n• Apoyo en tareas de cosecha cuando se requiera.',
      requirements: '• Experiencia comprobable manejando tractor.\n• Conocimiento de mantenimiento preventivo.\n• Licencia de conducir vigente.',
      experience: '2 años en manejo de maquinaria agrícola.',
      schedule: 'Lunes a sábado de 7 a 16 h.',
      salary: '$ 8.500 por jornada',
      contactEmail: 'campo@demo.workuco', closesAt: addDays(15), publishedAt: now - 5 * DAY, featured: 1,
    },
    {
      id: 'jdemo003', companyId: c(2), title: 'Barista / atención al público', locality: 'Tupungato',
      category: 'Gastronomía', type: 'Medio tiempo', modality: 'Presencial', featured: 0,
      description: 'Café de la Plaza busca barista para el turno tarde. Preparamos café de especialidad y pastelería propia; el trato con el cliente es la parte más importante del puesto.\n\nBuscamos a alguien con ganas de aprender y quedarse a largo plazo.',
      responsibilities: '• Preparación de café y bebidas.\n• Atención en mostrador y cobro.\n• Mantener limpia la barra y la máquina de café.\n• Reposición de vitrina y control de stock.',
      requirements: '• Experiencia en atención al público (deseable).\n• Disponibilidad los fines de semana.\n• Buena presencia y trato amable.',
      experience: '6 meses en gastronomía o atención al público.',
      schedule: 'Martes a domingo de 15 a 21 h.',
      salary: '$ 450.000 + propinas',
      contactEmail: 'cafe@demo.workuco', closesAt: addDays(30), publishedAt: now - 1 * DAY,
    },
    {
      id: 'jdemo004', companyId: c(3), title: 'Recepción de posada (temporada alta)', locality: 'Tupungato',
      category: 'Turismo', type: 'Temporal', modality: 'Presencial', featured: 0,
      description: 'Posada Valle Verde necesita cubrir la recepción durante la temporada alta de turismo. La posada tiene 12 habitaciones y recibe visitantes nacionales y extranjeros.\n\nSe trabaja en turnos rotativos con una persona de apoyo en cada turno.',
      responsibilities: '• Check-in y check-out de huéspedes.\n• Atención de consultas presenciales, telefónicas y por mensajería.\n• Coordinación de excursiones y traslados.\n• Control de caja y cierre de turno.',
      requirements: '• Nivel intermedio de inglés (excluyente).\n• Experiencia en hotelería o turismo.\n• Disponibilidad para trabajar fines de semana y feriados.',
      experience: '1 año en atención al público o hotelería.',
      schedule: 'Turnos rotativos de 8 horas, 5 días por semana.',
      salary: '$ 1.050.000 + alojamiento',
      contactEmail: 'reservas@demo.workuco', closesAt: addDays(20), publishedAt: now - 7 * DAY,
    },
    {
      id: 'jdemo005', companyId: c(4), title: 'Oficial albañil para obra en San Carlos', locality: 'San Carlos',
      category: 'Construcción', type: 'Tiempo completo', modality: 'Presencial', featured: 0,
      description: 'Constructora Andina Sur incorpora oficial albañil para una obra nueva de vivienda unifamiliar en San Carlos.\n\nLa obra tiene una duración estimada de 8 meses, con posibilidad de continuar en el próximo proyecto.',
      responsibilities: '• Ejecución de mampostería, revoques y contrapisos.\n• Interpretación de planos y indicaciones del capataz.\n• Cuidado de herramientas y materiales.\n• Cumplimiento de normas de seguridad e higiene.',
      requirements: '• Experiencia como oficial albañil.\n• Manejo de herramientas manuales y eléctricas.\n• Trabajo en equipo y puntualidad.',
      experience: '3 años en obras de construcción.',
      schedule: 'Lunes a viernes de 8 a 17 h, sábados hasta el mediodía.',
      salary: '$ 1.300.000 a $ 1.500.000 según experiencia',
      contactEmail: 'obras@demo.workuco', closesAt: addDays(18), publishedAt: now - 3 * DAY,
    },
    {
      id: 'jdemo006', companyId: c(5), title: 'Asistente contable junior', locality: 'Tunuyán',
      category: 'Administración', type: 'Tiempo completo', modality: 'Híbrido', featured: 1,
      description: 'Estudio Contable del Valle busca asistente contable junior para sumarse al equipo de Tunuyán. Trabajamos con pymes, productores agrícolas y comercios de la zona.\n\nEl puesto es híbrido: 3 días en oficina y 2 días remotos, con acompañamiento para aprender nuestros circuitos.',
      responsibilities: '• Carga de comprobantes y conciliaciones bancarias.\n• Preparación de liquidaciones de sueldos.\n• Atención de consultas de clientes por correo y teléfono.\n• Archivo y organización de documentación.',
      requirements: '• Estudiante avanzado o graduado de Contador Público / Administración.\n• Manejo de Excel intermedio.\n• Conocimientos de IVA y Ganancias (deseable).',
      experience: 'Sin experiencia previa; se valora práctica profesional.',
      schedule: 'Lunes a viernes de 9 a 17 h, esquema híbrido.',
      salary: '$ 850.000 a $ 1.000.000',
      contactEmail: 'rrhh@demo.workuco', closesAt: addDays(25), publishedAt: now - 4 * DAY, featured: 1,
    },
    {
      id: 'jdemo007', companyId: c(6), title: 'Vendedor/a de tienda natural', locality: 'Tunuyán',
      category: 'Comercio', type: 'Medio tiempo', modality: 'Presencial', featured: 0,
      description: 'Tienda Natural Uco abre búsqueda para su local de Tunuyán. Buscamos una persona que disfrute asesorar a los clientes y aprender sobre productos naturales y regionales.',
      responsibilities: '• Atención y asesoramiento al cliente.\n• Reposición de góndolas y control de vencimientos.\n• Cobro en caja y cierre de turno.\n• Pedidos a proveedores locales.',
      requirements: '• Buena comunicación.\n• Interés en alimentación natural.\n• Disponibilidad para trabajar los sábados.',
      experience: 'No excluyente.',
      schedule: 'Lunes a sábado de 16 a 21 h.',
      salary: '$ 420.000',
      contactEmail: 'tienda@demo.workuco', closesAt: addDays(12), publishedAt: now - 6 * DAY,
    },
    {
      id: 'jdemo008', companyId: c(0), title: 'Guía de turismo enológico (bilingüe)', locality: 'San Carlos',
      category: 'Turismo', type: 'Temporal', modality: 'Presencial', featured: 0,
      description: 'Bodega Alto Uco busca guía bilingüe para las visitas guiadas de temporada. Los recorridos incluyen viñedo, sala de elaboración y degustación de 4 vinos.\n\nSe valora el conocimiento del Valle de Uco y la capacidad de contar la historia del vino de altura.',
      responsibilities: '• Recorridos guiados en español e inglés.\n• Apoyo en la organización de eventos y degustaciones.\n• Atención de grupos de hasta 20 personas.\n• Colaboración con el área de ventas de bodega.',
      requirements: '• Inglés avanzado (excluyente).\n• Conocimiento de vinos (deseable).\n• Disponibilidad los fines de semana.',
      experience: '1 año en turismo o atención al público.',
      schedule: 'Jueves a domingo, turnos de 6 horas.',
      salary: '$ 6.000 por recorrido + propinas',
      contactEmail: 'visitas@demo.workuco', closesAt: addDays(21), publishedAt: now - 8 * DAY,
    },
    {
      id: 'jdemo009', companyId: c(4), title: 'Mantenimiento edilicio (part-time)', locality: 'Tupungato',
      category: 'Mantenimiento', type: 'Medio tiempo', modality: 'Presencial', featured: 0,
      description: 'Buscamos una persona de mantenimiento para un edificio de oficinas en Tupungato. Son tareas programadas y urgencias puntuales.',
      responsibilities: '• Reparaciones menores de electricidad, plomería y pintura.\n• Control de luces, puertas y sistemas de riego.\n• Coordinación con proveedores externos.',
      requirements: '• Experiencia en mantenimiento general.\n• Manejo de herramientas básicas.\n• Disponibilidad para urgencias.',
      experience: '2 años en mantenimiento edilicio.',
      schedule: 'Lunes, miércoles y viernes de 8 a 13 h.',
      salary: '$ 520.000',
      contactEmail: 'obras@demo.workuco', closesAt: addDays(16), publishedAt: now - 9 * DAY,
    },
    {
      id: 'jdemo010', companyId: c(3), title: 'Cocinero/a para posada', locality: 'Tupungato',
      category: 'Gastronomía', type: 'Tiempo completo', modality: 'Presencial', featured: 0,
      description: 'Posada Valle Verde busca cocinero/a para desayunos, almuerzos de huéspedes y eventos pequeños. La cocina es propia, con menú de temporada y productos de la zona.',
      responsibilities: '• Preparación de desayuno buffet y almuerzos.\n• Planificación de menús semanales.\n• Control de stock y pedidos.\n• Cumplimiento de normas de higiene.',
      requirements: '• Experiencia en cocina de restaurante u hotel.\n• Carnet de manipulador de alimentos.\n• Creatividad y trabajo en equipo.',
      experience: '2 años en cocina.',
      schedule: 'Martes a domingo de 7 a 15 h.',
      salary: '$ 1.150.000 + alojamiento',
      contactEmail: 'reservas@demo.workuco', closesAt: addDays(28), publishedAt: now - 10 * DAY,
    },
    {
      id: 'jdemo011', companyId: c(5), title: 'Soporte administrativo para estudio contable', locality: 'San Carlos',
      category: 'Administración', type: 'Pasantía', modality: 'Híbrido', featured: 0,
      description: 'Pasantía de 6 meses para estudiantes de administración o contabilidad. El objetivo es formar a la persona en las tareas diarias del estudio, con posibilidad de continuar como asistente.',
      responsibilities: '• Digitalización y archivo de documentación.\n• Carga de datos en el sistema.\n• Atención telefónica básica.',
      requirements: '• Estudiante de Administración o Contabilidad.\n• Manejo de Excel básico.\n• Disponibilidad de 20 horas semanales.',
      experience: 'Sin experiencia.',
      schedule: 'Lunes a viernes por la mañana, 4 horas.',
      salary: 'Beca de $ 350.000',
      contactEmail: 'estudio@demo.workuco', closesAt: addDays(14), publishedAt: now - 11 * DAY,
    },
    {
      id: 'jdemo012', companyId: c(6), title: 'Atención al cliente y redes (remoto)', locality: 'Tunuyán',
      category: 'Comercio', type: 'Freelance', modality: 'Remoto', featured: 0,
      description: 'Tienda Natural Uco busca una persona para responder consultas por WhatsApp y redes sociales, y publicar novedades de productos. Trabajo 100 % remoto con reuniones semanales.',
      responsibilities: '• Responder consultas de clientes por WhatsApp e Instagram.\n• Publicar productos y promociones.\n• Coordinar entregas con el local.',
      requirements: '• Buena redacción.\n• Manejo de Instagram y WhatsApp Business.\n• Conexión a internet estable.',
      experience: '1 año en redes sociales o atención al cliente.',
      schedule: '20 horas semanales, horario flexible.',
      salary: '$ 400.000',
      contactEmail: 'tienda@demo.workuco', closesAt: addDays(19), publishedAt: now - 12 * DAY,
    },
    /* Pendientes de aprobación (para probar el panel admin) */
    {
      id: 'jdemo013', companyId: c(2), title: 'Ayudante de cocina', locality: 'Tupungato',
      category: 'Gastronomía', type: 'Medio tiempo', modality: 'Presencial', featured: 0, status: 'pending',
      description: 'Café de la Plaza busca ayudante de cocina para preparación de pastelería y sándwiches. Es un puesto de aprendizaje dentro de un equipo chico.',
      responsibilities: '• Preparación de pastelería simple y sándwiches.\n• Limpieza de cocina y utensilios.\n• Apoyo al cocinero en tareas diarias.',
      requirements: '• Carnet de manipulador de alimentos.\n• Puntualidad y ganas de aprender.',
      experience: 'Sin experiencia previa.',
      schedule: 'Martes a sábado de 9 a 14 h.',
      salary: '$ 380.000',
      contactEmail: 'cafe@demo.workuco', closesAt: addDays(20), publishedAt: null,
    },
    {
      id: 'jdemo014', companyId: c(4), title: 'Administrativo/a de obra', locality: 'San Carlos',
      category: 'Administración', type: 'Tiempo completo', modality: 'Presencial', featured: 0, status: 'pending',
      description: 'Constructora Andina Sur necesita administrativo de obra para control de materiales, partes diarios y documentación de personal.',
      responsibilities: '• Registro de partes diarios de obra.\n• Control de recepción de materiales.\n• Altas de personal y documentación.\n• Coordinación con administración central.',
      requirements: '• Experiencia administrativa en obras.\n• Excel intermedio.\n• Buen trato con el personal y proveedores.',
      experience: '1 año en administración.',
      schedule: 'Lunes a viernes de 8 a 17 h.',
      salary: '$ 950.000',
      contactEmail: 'obras@demo.workuco', closesAt: addDays(22), publishedAt: null,
    },
  ];

  const jobs = raw.map((j) => ({
    ...base, ...j,
    createdAt: j.publishedAt || now - 2 * DAY,
  }));

  const applications = [
    { id: 'ademo01', jobId: 'jdemo001', name: 'Martina Salinas', email: 'martina@demo.workuco', phone: '+54 2622 512345', message: 'Tengo 3 años de experiencia en bodega y disponibilidad inmediata para la vendimia.', status: 'nueva', createdAt: now - 1 * DAY },
    { id: 'ademo02', jobId: 'jdemo001', name: 'Diego Ferreyra', email: 'diego@demo.workuco', phone: '+54 2622 578901', message: 'Trabajé 5 temporadas en fraccionamiento y tengo carnet de manipulador.', status: 'contactada', createdAt: now - 2 * DAY },
    { id: 'ademo03', jobId: 'jdemo002', name: 'Ramón Quiroga', email: 'ramon@demo.workuco', phone: '+54 2622 533221', message: 'Manejo tractor desde hace 10 años en fincas de Tunuyán.', status: 'nueva', createdAt: now - 3 * DAY },
    { id: 'ademo04', jobId: 'jdemo006', name: 'Lucía Benítez', email: 'lucia@demo.workuco', phone: '+54 2622 501122', message: 'Soy estudiante avanzada de Contador y me interesa el esquema híbrido.', status: 'contactada', createdAt: now - 1 * DAY },
    { id: 'ademo05', jobId: 'jdemo006', name: 'Santiago Paz', email: 'santiago@demo.workuco', phone: '+54 2622 549876', message: 'Tengo experiencia en conciliaciones bancarias y Excel avanzado.', status: 'nueva', createdAt: now - 4 * DAY },
    { id: 'ademo06', jobId: 'jdemo003', name: 'Camila Rojas', email: 'camila@demo.workuco', phone: '+54 2622 567788', message: 'Trabajé dos años como barista en Mendoza capital y volví al Valle.', status: 'nueva', createdAt: now - 2 * DAY },
    { id: 'ademo07', jobId: 'jdemo004', name: 'Tomás Aguirre', email: 'tomas@demo.workuco', phone: '+54 2622 522334', message: 'Tengo inglés avanzado y experiencia en recepción de hoteles.', status: 'descartada', createdAt: now - 5 * DAY },
    { id: 'ademo08', jobId: 'jdemo008', name: 'Valentina Ortiz', email: 'valentina@demo.workuco', phone: '+54 2622 590011', message: 'Soy guía de turismo recibida y hablo inglés y portugués.', status: 'nueva', createdAt: now - 1 * DAY },
  ];

  return { companies, jobs, applications };
}

module.exports = { build, DEMO_PASS };
