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
      locality: 'San Carlos', logoFile: '/demo/logo-bodega.svg',
      gallery: ['/demo/cover-bodega.svg', '/demo/cover-finca.svg'],
      description: 'Bodega boutique de San Carlos. Producimos vinos de altura en pequeños lotes y recibimos visitantes durante todo el año.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo02finca', name: 'Finca Los Nogales', email: 'finca@demo.workuco', phone: '+54 2622 47-9032',
      website: '', verified: 1, plan: 'free',
      locality: 'Tunuyán', logoFile: '/demo/logo-finca.svg',
      gallery: ['/demo/cover-finca.svg', '/demo/cover-obra.svg'],
      description: 'Finca familiar de Tunuyán dedicada a la producción de ciruelas, duraznos y nogales.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo03cafe', name: 'Café de la Plaza', email: 'cafe@demo.workuco', phone: '+54 2622 42-3311',
      website: '', verified: 0, plan: 'free',
      locality: 'Tupungato', logoFile: '/demo/logo-cafe.svg',
      gallery: ['/demo/cover-cafe.svg', '/demo/cover-tienda.svg'],
      description: 'Cafetería y pastelería artesanal en el centro de Tupungato.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo04posada', name: 'Posada Valle Verde', email: 'posada@demo.workuco', phone: '+54 2622 49-2277',
      website: 'https://posadavalleverde.example', verified: 1, plan: 'free',
      locality: 'Tupungato', logoFile: '/demo/logo-posada.svg',
      gallery: ['/demo/cover-posada.svg', '/demo/cover-cafe.svg'],
      description: 'Posada de montaña con 12 habitaciones, desayuno casero y excursiones guiadas.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo05constructora', name: 'Constructora Andina Sur', email: 'obras@demo.workuco', phone: '+54 2622 41-6650',
      website: '', verified: 0, plan: 'free',
      locality: 'San Carlos', logoFile: '/demo/logo-obra.svg',
      gallery: ['/demo/cover-obra.svg', '/demo/cover-finca.svg'],
      description: 'Empresa de construcción y refacciones con obras en todo el Valle de Uco.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo06estudio', name: 'Estudio Contable del Valle', email: 'estudio@demo.workuco', phone: '+54 2622 43-8890',
      website: '', verified: 1, plan: 'free',
      locality: 'Tunuyán', logoFile: '/demo/logo-estudio.svg',
      gallery: [],
      description: 'Estudio contable e impositivo que atiende a pymes y productores de la zona.',
      password: hash(DEMO_PASS),
    },
    {
      id: 'cdemo07tienda', name: 'Tienda Natural Uco', email: 'tienda@demo.workuco', phone: '+54 2622 46-5544',
      website: '', verified: 0, plan: 'free',
      locality: 'Tunuyán', logoFile: '/demo/logo-tienda.svg',
      gallery: ['/demo/cover-tienda.svg', '/demo/cover-cafe.svg'],
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
    benefits: ['Comida incluida', 'Capacitación', 'Obra social'],
    contactPhone: '',
    status: 'approved',
  };

  const raw = [
    {
      salaryMin: 900000, salaryMax: 1100000, skills: ['Fraccionamiento', 'Etiquetado', 'Control de stock', 'BPM'],
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
      salaryMin: 38000, salaryPeriod: 'día', skills: ['Tractor', 'Pulverizadora', 'Mantenimiento'],
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
      salaryMin: 450000, skills: ['Barista', 'Atención al público', 'Manejo de caja'],
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
      salaryMin: 1050000, skills: ['Recepción', 'Inglés', 'Reservas', 'Atención al huésped'],
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
      salaryMin: 1300000, salaryMax: 1500000, skills: ['Albañilería', 'Revoque', 'Lectura de planos'],
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
      salaryMin: 850000, salaryMax: 1000000, skills: ['Excel', 'Conciliaciones', 'IVA', 'Liquidación de sueldos'],
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
      salaryMin: 420000, skills: ['Ventas', 'Atención al público', 'Manejo de caja'],
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
      skills: ['Guía de turismo', 'Inglés', 'Enología básica'],
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
      salaryMin: 520000, skills: ['Electricidad', 'Plomería', 'Pintura'],
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
      salaryMin: 1150000, skills: ['Cocina', 'Manipulación de alimentos', 'Control de stock'],
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
      skills: ['Excel', 'Carga de datos'],
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
      salaryMin: 400000, skills: ['Redes sociales', 'Atención al cliente', 'Redacción'],
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
    /* Changas y trabajos por temporada */
    {
      id: 'jdemo015', companyId: c(0), title: 'Cosechadores de uva para vendimia', locality: 'San Carlos',
      category: 'Agricultura', type: 'Temporal', modality: 'Presencial', featured: 0,
      gig: 1, startDate: addDays(6), duration: '3 semanas', positions: 12,
      salaryMin: 32000, salaryPeriod: 'día', skills: ['Cosecha', 'Trabajo en equipo'],
      description: 'Arranca la vendimia y armamos cuadrilla para cosechar malbec en la finca de la bodega. Pago por jornada todos los viernes, traslado desde la plaza de San Carlos y almuerzo incluido.',
      responsibilities: '• Cosecha manual en cajas de 18 kg.\n• Cuidar la planta y el racimo.\n• Seguir las indicaciones del encargado de cuadrilla.',
      requirements: '• Ganas de trabajar y buen estado físico.\n• Puntualidad: salimos 6:30.\n• No hace falta experiencia.',
      experience: 'No hace falta.', schedule: 'Lunes a sábado de 7 a 14 h.',
      benefits: ['Transporte', 'Comida incluida'],
      contactEmail: 'rrhh@demo.workuco', closesAt: addDays(10), publishedAt: now - 1 * DAY,
    },
    {
      id: 'jdemo016', companyId: c(1), title: 'Podadores para frutales', locality: 'Tunuyán',
      category: 'Agricultura', type: 'Temporal', modality: 'Presencial', featured: 0,
      gig: 1, startDate: addDays(12), duration: '10 días', positions: 6,
      salaryMin: 35000, salaryPeriod: 'día', skills: ['Poda', 'Trabajo en equipo'],
      description: 'Finca Los Nogales necesita podadores para ciruelos y durazneros. Se trabaja con tijera y serrucho propios de la finca, en cuadrillas de tres personas con un encargado.',
      responsibilities: '• Poda de formación y de fructificación.\n• Retiro de ramas del interfilar.\n• Cuidado de las herramientas.',
      requirements: '• Experiencia en poda de frutales (excluyente).\n• Movilidad propia hasta la finca.',
      experience: 'Al menos una temporada de poda.', schedule: 'Lunes a viernes de 8 a 16 h.',
      benefits: ['Comida incluida'],
      contactEmail: 'campo@demo.workuco', closesAt: addDays(14), publishedAt: now - 2 * DAY,
    },
    {
      id: 'jdemo017', companyId: c(3), title: 'Mozos y mozas para casamiento', locality: 'Tupungato',
      category: 'Gastronomía', type: 'Temporal', modality: 'Presencial', featured: 0,
      gig: 1, startDate: addDays(9), duration: '1 noche', positions: 8,
      salaryMin: 45000, salaryPeriod: 'día', skills: ['Atención al público', 'Manejo de bandeja'],
      description: 'La posada recibe un casamiento de 120 personas y sumamos mozos y mozas para la noche. Se paga al terminar el evento, con cena y traslado de vuelta incluidos.',
      responsibilities: '• Armado del salón desde las 18 h.\n• Servicio de recepción, cena y mesa dulce.\n• Desarme al finalizar.',
      requirements: '• Experiencia en eventos o salón.\n• Camisa blanca y pantalón negro.\n• Mayores de 18 años.',
      experience: 'Haber trabajado en al menos un evento.', schedule: 'Sábado de 18 a 4 h.',
      benefits: ['Comida incluida', 'Transporte'],
      contactEmail: 'reservas@demo.workuco', closesAt: addDays(8), publishedAt: now - 1 * DAY,
    },
    {
      id: 'jdemo018', companyId: c(4), title: 'Ayudantes para llenado de losa', locality: 'San Carlos',
      category: 'Construcción', type: 'Temporal', modality: 'Presencial', featured: 0,
      gig: 1, startDate: addDays(4), duration: '2 días', positions: 4,
      salaryMin: 5500, salaryPeriod: 'hora', skills: ['Albañilería', 'Resistencia física'],
      description: 'Necesitamos ayudantes para el llenado de una losa en obra de San Carlos. Son dos jornadas intensas de trabajo en equipo, con pago por hora al cierre del segundo día.',
      responsibilities: '• Acarreo de materiales.\n• Apoyo en el llenado y vibrado.\n• Limpieza de herramientas al terminar.',
      requirements: '• Buen estado físico.\n• Calzado de seguridad (el casco lo damos nosotros).',
      experience: 'Se valora haber trabajado en obra.', schedule: 'Jueves y viernes de 7 a 17 h.',
      benefits: ['Comida incluida'],
      contactEmail: 'obras@demo.workuco', closesAt: addDays(3), publishedAt: now - 1 * DAY,
    },
    /* Pendientes de aprobación (para probar el panel admin) */
    {
      salaryMin: 380000, skills: ['Cocina', 'Manipulación de alimentos'],
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
      salaryMin: 950000, skills: ['Excel', 'Facturación'],
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

  const candidates = [
    {
      openToWork: 1, isPublic: 1, categories: ['Agricultura'], salaryMin: 800000,
      id: 'udemo01', name: 'Martina Salinas', email: 'martina@demo.workuco', phone: '+54 2622 512345',
      password: hash(DEMO_PASS), locality: 'San Carlos', headline: 'Operaria de bodega y fraccionamiento',
      about: 'Crecí entre viñedos en San Carlos. Trabajé cuatro vendimias en bodegas boutique y me especialicé en fraccionamiento y control de stock.',
      skills: ['Fraccionamiento', 'Control de stock', 'BPM', 'Trabajo en equipo'],
      experience: '4 temporadas en Bodega La Consulta (fraccionamiento y etiquetado).',
      education: 'Secundario completo · Curso de manipulador de alimentos',
      availability: 'Tiempo completo, incluidos sábados en vendimia', linkedin: '',
    },
    {
      openToWork: 1, isPublic: 1, categories: ['Agricultura'],
      id: 'udemo02', name: 'Diego Ferreyra', email: 'diego@demo.workuco', phone: '+54 2622 578901',
      password: hash(DEMO_PASS), locality: 'San Carlos', headline: 'Operario de bodega · 5 vendimias',
      about: 'Experiencia en recepción de uva, limpieza de tanques y línea de fraccionamiento. Disponibilidad inmediata.',
      skills: ['Recepción de uva', 'Limpieza CIP', 'Etiquetado', 'Montacargas'],
      experience: '5 temporadas en bodegas de San Carlos y Tunuyán.',
      education: 'Secundario completo', availability: 'Temporal, turnos rotativos', linkedin: '',
    },
    {
      openToWork: 1, categories: ['Agricultura', 'Mantenimiento'], salaryMin: 700000,
      id: 'udemo03', name: 'Ramón Quiroga', email: 'ramon@demo.workuco', phone: '+54 2622 533221',
      password: hash(DEMO_PASS), locality: 'Tunuyán', headline: 'Tractorista y maquinaria agrícola',
      about: 'Diez años manejando tractor en fincas de frutales. Hago mantenimiento preventivo y trabajo con pulverizadora.',
      skills: ['Tractor', 'Pulverizadora', 'Mantenimiento', 'Licencia B1'],
      experience: '10 años en Finca La Esperanza, Tunuyán.',
      education: 'Primario completo · Curso de maquinaria agrícola', availability: 'Tiempo completo', linkedin: '',
    },
    {
      openToWork: 1, isPublic: 1, categories: ['Administración'], salaryMin: 800000,
      id: 'udemo04', name: 'Lucía Benítez', email: 'lucia@demo.workuco', phone: '+54 2622 501122',
      password: hash(DEMO_PASS), locality: 'Tunuyán', headline: 'Estudiante avanzada de Contador Público',
      about: 'Me falta una materia para recibirme. Hice prácticas en un estudio y manejo Excel avanzado.',
      skills: ['Excel avanzado', 'Conciliaciones', 'IVA', 'Liquidación de sueldos'],
      experience: 'Prácticas profesionales de 6 meses en estudio contable.',
      education: 'Contador Público (en curso, 4.º año)', availability: 'Tiempo completo o híbrido', linkedin: '',
    },
    {
      openToWork: 0, categories: ['Administración'],
      id: 'udemo05', name: 'Santiago Paz', email: 'santiago@demo.workuco', phone: '+54 2622 549876',
      password: hash(DEMO_PASS), locality: 'San Carlos', headline: 'Administrativo contable',
      about: 'Trabajé en administración de una empresa de servicios. Busco un equipo estable para crecer.',
      skills: ['Conciliaciones bancarias', 'Excel', 'Facturación', 'Atención al cliente'],
      experience: '2 años como administrativo en Servicios Andinos.',
      education: 'Técnico en Administración', availability: 'Tiempo completo', linkedin: '',
    },
    {
      openToWork: 1, categories: ['Gastronomía', 'Comercio'],
      id: 'udemo06', name: 'Camila Rojas', email: 'camila@demo.workuco', phone: '+54 2622 567788',
      password: hash(DEMO_PASS), locality: 'Tupungato', headline: 'Barista y atención al público',
      about: 'Dos años como barista en Mendoza capital. Volví al Valle y busco un café de especialidad.',
      skills: ['Barista', 'Latte art', 'Atención al público', 'Manejo de caja'],
      experience: '2 años en Café Central, Mendoza.', education: 'Secundario completo', availability: 'Medio tiempo, fines de semana', linkedin: '',
    },
    {
      openToWork: 1, categories: ['Turismo'],
      id: 'udemo07', name: 'Tomás Aguirre', email: 'tomas@demo.workuco', phone: '+54 2622 522334',
      password: hash(DEMO_PASS), locality: 'Tupungato', headline: 'Recepción de hotelería bilingüe',
      about: 'Inglés avanzado y experiencia en recepción de hoteles boutique.',
      skills: ['Inglés avanzado', 'Recepción', 'Reservas', 'Atención al huésped'],
      experience: '3 años en hotel boutique de Tupungato.', education: 'Terciario en Turismo', availability: 'Temporada alta', linkedin: '',
    },
    {
      openToWork: 1, categories: ['Turismo'],
      id: 'udemo08', name: 'Valentina Ortiz', email: 'valentina@demo.workuco', phone: '+54 2622 590011',
      password: hash(DEMO_PASS), locality: 'San Carlos', headline: 'Guía de turismo bilingüe',
      about: 'Guía recibida, inglés y portugués. Me gusta contar la historia del vino de altura.',
      skills: ['Guía de turismo', 'Inglés', 'Portugués', 'Enología básica'],
      experience: '2 temporadas en turismo enológico en el Valle de Uco.', education: 'Tecnicatura en Turismo', availability: 'Fines de semana', linkedin: '',
    },
  ];

  const applications = [
    { id: 'ademo01', jobId: 'jdemo001', candidateId: 'udemo01', name: 'Martina Salinas', email: 'martina@demo.workuco', phone: '+54 2622 512345', message: 'Tengo 3 años de experiencia en bodega y disponibilidad inmediata para la vendimia.', status: 'nueva', stage: 'nuevo', rating: 4, createdAt: now - 1 * DAY,
      ai: { score: 86, summary: 'Perfil muy alineado: cuatro vendimias en bodega boutique, experiencia directa en fraccionamiento y control de stock. Vive en San Carlos y tiene disponibilidad para la cosecha.', strengths: ['Experiencia concreta en fraccionamiento', 'Conocimiento de BPM y manipulador de alimentos', 'Disponibilidad inmediata en vendimia'], gaps: ['No detalla experiencia con montacargas'], skills: ['Fraccionamiento', 'Control de stock', 'BPM', 'Etiquetado'], seniority: 'semi senior', recommendation: 'avanzar' } },
    { id: 'ademo02', jobId: 'jdemo001', candidateId: 'udemo02', name: 'Diego Ferreyra', email: 'diego@demo.workuco', phone: '+54 2622 578901', message: 'Trabajé 5 temporadas en fraccionamiento y tengo carnet de manipulador.', status: 'contactada', stage: 'entrevista', rating: 5, createdAt: now - 2 * DAY,
      ai: { score: 92, summary: 'Cinco vendimias, experiencia en recepción de uva y línea de fraccionamiento. Es el perfil más experimentado de la búsqueda.', strengths: ['5 temporadas comprobables', 'Manejo de montacargas', 'Disponibilidad para turnos rotativos'], gaps: [], skills: ['Recepción de uva', 'Limpieza CIP', 'Etiquetado', 'Montacargas'], seniority: 'senior', recommendation: 'avanzar' } },
    { id: 'ademo03', jobId: 'jdemo002', candidateId: 'udemo03', name: 'Ramón Quiroga', email: 'ramon@demo.workuco', phone: '+54 2622 533221', message: 'Manejo tractor desde hace 10 años en fincas de Tunuyán.', status: 'nueva', stage: 'nuevo', createdAt: now - 3 * DAY },
    { id: 'ademo04', jobId: 'jdemo006', candidateId: 'udemo04', name: 'Lucía Benítez', email: 'lucia@demo.workuco', phone: '+54 2622 501122', message: 'Soy estudiante avanzada de Contador y me interesa el esquema híbrido.', status: 'contactada', stage: 'revisado', rating: 4, createdAt: now - 1 * DAY },
    { id: 'ademo05', jobId: 'jdemo006', candidateId: 'udemo05', name: 'Santiago Paz', email: 'santiago@demo.workuco', phone: '+54 2622 549876', message: 'Tengo experiencia en conciliaciones bancarias y Excel avanzado.', status: 'nueva', stage: 'nuevo', createdAt: now - 4 * DAY },
    { id: 'ademo06', jobId: 'jdemo003', candidateId: 'udemo06', name: 'Camila Rojas', email: 'camila@demo.workuco', phone: '+54 2622 567788', message: 'Trabajé dos años como barista en Mendoza capital y volví al Valle.', status: 'nueva', stage: 'nuevo', rating: 5, createdAt: now - 2 * DAY },
    { id: 'ademo07', jobId: 'jdemo004', candidateId: 'udemo07', name: 'Tomás Aguirre', email: 'tomas@demo.workuco', phone: '+54 2622 522334', message: 'Tengo inglés avanzado y experiencia en recepción de hoteles.', status: 'descartada', stage: 'descartado', createdAt: now - 5 * DAY },
    { id: 'ademo08', jobId: 'jdemo008', candidateId: 'udemo08', name: 'Valentina Ortiz', email: 'valentina@demo.workuco', phone: '+54 2622 590011', message: 'Soy guía de turismo recibida y hablo inglés y portugués.', status: 'nueva', stage: 'nuevo', createdAt: now - 1 * DAY },
    { id: 'ademo09', jobId: 'jdemo001', name: 'Jorge Méndez', email: 'jorge.mendez@demo.workuco', phone: '+54 2622 511100', message: 'Trabajé dos vendimias en Tupungato.', status: 'contactada', stage: 'revisado', createdAt: now - 6 * DAY, respondedAt: now - 5 * DAY },
    { id: 'ademo10', jobId: 'jdemo008', name: 'Paula Sosa', email: 'paula.sosa@demo.workuco', phone: '+54 2622 511101', message: 'Soy estudiante de turismo y hablo inglés.', status: 'descartada', stage: 'descartado', createdAt: now - 7 * DAY, respondedAt: now - 5 * DAY },
    { id: 'ademo11', jobId: 'jdemo001', name: 'Iván Castro', email: 'ivan.castro@demo.workuco', phone: '+54 2622 511102', message: 'Disponible para empezar ya.', status: 'nueva', stage: 'nuevo', createdAt: now - 6 * DAY },
    { id: 'ademo12', jobId: 'jdemo002', name: 'Néstor Vega', email: 'nestor.vega@demo.workuco', phone: '+54 2622 511103', message: 'Manejo tractor y pulverizadora.', status: 'contactada', stage: 'entrevista', createdAt: now - 8 * DAY, respondedAt: now - 7 * DAY },
    { id: 'ademo13', jobId: 'jdemo002', name: 'Elsa Rivas', email: 'elsa.rivas@demo.workuco', phone: '+54 2622 511104', message: 'Tengo experiencia en finca.', status: 'contactada', stage: 'revisado', createdAt: now - 9 * DAY, respondedAt: now - 7 * DAY },
  ];

  const invitations = [
    { id: 'idemo01', companyId: c(0), jobId: 'jdemo001', candidateId: 'udemo08', message: 'Vimos tu perfil y creemos que podés sumar en la bodega.', createdAt: now - 2 * DAY },
    { id: 'idemo02', companyId: c(1), jobId: 'jdemo016', candidateId: 'udemo01', message: 'Estamos armando cuadrilla de poda, ¿te sumás?', createdAt: now - 2 * DAY },
  ];

  const notifications = [
    { type: 'candidate', to: 'udemo01', kind: 'invitacion', title: 'Finca Los Nogales te invitó a postularte', body: 'Puesto: Podadores para frutales', link: '/oferta/jdemo016', createdAt: now - 2 * DAY },
    { type: 'candidate', to: 'udemo02', kind: 'etapa', title: '¡Te quieren entrevistar!', body: 'Bodega Alto Uco quiere conocerte por el puesto de Operario de bodega y fraccionamiento.', link: '/mi-perfil?tab=postulaciones', createdAt: now - 1 * DAY },
    { type: 'company', to: c(0), kind: 'postulacion', title: 'Nueva postulación: Martina Salinas', body: 'Operario de bodega y fraccionamiento', link: '/panel#postulantes', createdAt: now - 1 * DAY },
  ];

  return { companies, candidates, jobs, applications, invitations, notifications };
}

module.exports = { build, DEMO_PASS };
