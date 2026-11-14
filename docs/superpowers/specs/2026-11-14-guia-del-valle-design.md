# Guía del Valle y preferencias de la cuenta de persona — Diseño

Fecha: 2026-11-14 · Rama: `v4-importados` · Proyecto: WorkUco (`C:\Users\ezequ\.openclaw\workspace\workuco`)

## Por qué

WorkUco tiene que ser **sostenible**: cobrar de algún lado. El plan del dueño es dar todo gratis los primeros
meses para sumar comercios y gente, y si funciona empezar a cobrar por **destacar** fichas y otras cosas que
aparezcan. La guía sirve a las dos metas: que la gente del Valle entre seguido aunque no busque trabajo
(oficios, comida, salidas) y tener un producto que los comercios quieran pagar.

Además, la cuenta de persona tiene que funcionar bien y dejar configurar sus preferencias para que la gente
se sienta cómoda.

## Objetivos

1. Una sección **Guía del Valle** con cuatro secciones y un mismo formato de ficha:
   - **Oficios**: electricista, gasista, albañil, plomero, pintor, carpintero, herrero, techista,
     refrigeración, cerrajero, jardinero, fletes, otro.
   - **Servicios**: lavadero, mecánico, gomería, lavadero de autos, peluquería/barbería, estética,
     veterinaria, informática/celulares, costura, otro.
   - **Salidas**: boliche, bar, ciber/gamer, eventos/salón, deportes/canchas, otro.
   - **Comida**: restaurante, rotisería, pizzería, parrilla, delivery, panadería, heladería, café, otro.
   (Las listas viven en una constante; agregar un rubro es editar la lista.)
2. **Ficha**: nombre, sección, rubro, localidades donde atiende (una o varias de San Carlos, Tunuyán,
   Tupungato), dirección (opcional: un gasista que va a domicilio no tiene), descripción, hasta 6 fotos,
   horario por día con **"Abierto ahora"**, y contacto: WhatsApp, llamar, cómo llegar (link a Google Maps
   con la dirección), Instagram, sitio web. Marca opcional "Va a domicilio" para oficios.
3. **Quién publica** (enfoque A, elegido por el dueño): una ficha es una pieza propia que pertenece a una
   **persona**, a una **empresa** o, si la cargó el admin, a **nadie todavía** (sin reclamar).
   - Persona: sección nueva "Mis servicios" en `/mi-perfil` (puede seguir buscando trabajo con la misma cuenta).
   - Empresa: sección nueva "Mi ficha en la guía" en `/panel`.
   - Una cuenta puede tener **varias fichas** (hasta 5).
   - Admin: pestaña "Guía" en `/admin` para cargar fichas con información pública y mandarle al dueño el
     link para **reclamarla o borrarla**, reutilizando el sistema de reclamo de los avisos importados
     (token de reclamo, lista de bloqueo por teléfono y nombre, botón de WhatsApp con el mensaje armado).
4. **Moderación**: la primera publicación de una ficha queda pendiente hasta que el admin la aprueba (igual
   que los avisos). Después, los cambios de horario, fotos y texto se publican al instante (para que actualizar
   el horario no tarde un día) y el admin los ve en "Cambios recientes", desde donde puede ocultar una ficha.
5. **Preparado para cobrar, sin cobrar todavía**:
   - Marca **"Destacado"** con fecha de vencimiento opcional, que pone el admin (hoy gratis). Las destacadas
     salen primero y llevan la etiqueta visible "Destacado" (la publicidad tiene que reconocerse como tal).
   - **Estadísticas para el dueño**: vistas de la ficha y toques en WhatsApp/llamar de la última semana y del
     mes ("Esta semana te contactaron 12 veces"). Es el argumento de venta para cobrar después. Sólo se guardan
     contadores, no quién tocó.
   - Sin pagos, sin planes visibles, sin precios en la página.
6. **Cuenta de persona: preferencias**, en una pestaña nueva "Preferencias" de `/mi-perfil`:
   - **Localidades de interés** (varias), en lugar de una sola localidad para buscar. La localidad donde vive
     sigue siendo un dato del perfil.
   - **Jornada** (tiempo completo, medio tiempo, temporal…), **modalidad** (presencial, híbrido, remoto) y
     **"me interesan changas"**.
   - **Qué avisos recibir** (campanita y mail): novedades de mis postulaciones, invitaciones de empresas,
     alertas de búsquedas, novedades de la guía (para quien tiene fichas). Reemplaza el interruptor único de
     "Avisos por mail" de la tarjeta "Tus datos" por casillas por tipo; la campanita siempre recibe todo.
   - Las preferencias se usan: en "Para vos" y en la compatibilidad, como filtros por defecto al entrar a
     `/buscar` y al modo flyers (el usuario los puede sacar), y para no mandar mails de tipos apagados.
   - Revisión general de la cuenta de persona: que cada pestaña cargue, guarde y muestre errores bien en el
     celular; corregir lo que falle.
7. **Integración visual** con el sistema "Valle de noche" (`DESIGN.md`): una banda "Guía del Valle" en la
   portada con las cuatro secciones; ítem "Guía" en el menú principal (para no pasar de seis ítems, "Empresas"
   sale del menú y queda en el pie, en `/buscar` y dentro de la guía); fichas con el mismo lenguaje de las
   tarjetas de avisos.
8. **Google y WhatsApp**: `/guia/:slug` sale del servidor con vista previa (foto, nombre, rubro, localidad) y
   datos `LocalBusiness` para Google; las fichas aprobadas van al `sitemap.xml`. En modo demo nada se indexa.

## No objetivos (primera versión)

- **Reseñas y estrellas**: suman confianza pero traen moderación y riesgo legal; se suman cuando haya gente.
- Pagos, planes visibles, reservas, pedidos de comida, chat, mapa embebido (sólo link a Google Maps).
- Carga de fichas con IA desde una foto o un posteo (posible más adelante reutilizando el importador).

## Anti-objetivos

- Que la guía tape el empleo: los avisos siguen siendo lo principal de la portada y del menú.
- Fichas sin moderar o con spam; destacados que no se reconozcan como publicidad.
- Exponer datos personales sin necesidad (ver Legal).

## Restricciones

- Node 24 sin dependencias, `node:sqlite`, HTML/CSS/JS sin build. Migraciones suaves con `ensureColumn`.
- Seguridad igual que el resto: SQL parametrizado, escape de todo texto del usuario, imágenes validadas por
  firma (`saveImage`), límite de intentos, CSRF por `Origin`.
- Legal (Ley 25.326): las fichas de personas muestran sólo los datos que la persona eligió publicar. La baja de
  una cuenta borra sus fichas y sus fotos. La política de privacidad y los términos suman la guía: qué se
  publica, quién lo ve, cómo reclamar o borrar una ficha cargada por WorkUco. "Descargar mis datos" incluye
  las fichas.
- Celular primero (390 px), sin desbordes a 320 px. Pruebas automáticas como el resto (`tools/test-*.js`,
  prueba de interfaz en Chrome headless).

## Enfoques considerados

- **A. Ficha propia que pertenece a persona, empresa o a nadie (elegido).** Sirve igual al de oficio y al
  comercio, una cuenta puede tener varias fichas, reutiliza el reclamo de importados y deja el cobro por ficha
  bien armado. Es la que más trabajo lleva.
- B. Todo comercio como "empresa" con rubro de la guía: más rápido, pero obliga al de oficio a abrir una
  cuenta de empresa, mezcla empleadores con pizzerías y complica cobrar por ficha.
- C. Directorio que maneja sólo el admin, sin cuentas: lo más simple, pero no escala y nadie puede pagar
  por su cuenta.

## Decisiones del dueño

- Enfoque A. Cuatro secciones (Oficios, Servicios, Salidas, Comida) con el formato de ficha de arriba.
- Gratis al principio; "Destacado" preparado para cobrar más adelante.
- Sin reseñas en la primera versión.
- El admin puede cargar fichas con información pública y mandar el link de reclamo.
- Preferencias de la cuenta de persona como se describen arriba.

## Fichas cargadas por el admin (decisión del dueño)

- **Comercios** (Servicios, Salidas, Comida): se publican **con su contacto**, porque son datos que el propio
  comercio hizo públicos (Google Maps, Instagram) para que lo contacten. Llevan `noindex` y quedan fuera del
  `sitemap.xml` hasta que se reclaman, muestran la leyenda "Ficha armada por WorkUco con datos públicos.
  ¿Es tuya? Reclamala o pedí que la borremos" y tienen su link de reclamo y borrado.
- **Oficios de personas**: el admin sólo puede cargarlas si la persona ya lo autorizó. El formulario tiene
  una casilla obligatoria "La persona me autorizó a publicarla" y se guarda quién la marcó y cuándo.
  Sin esa casilla, una ficha de Oficios no se puede crear desde el admin.

## Decisiones tomadas en la revisión (llamadas del diseñador, corregibles)

1. **Reclamo de una ficha**: el link `/reclamar-ficha/:token` (separado del reclamo de empresas importadas)
   ofrece **ingresar con una cuenta existente** (persona o empresa) y sumarla, o **crear una cuenta nueva**
   eligiendo el tipo. Al reclamar se respeta el tope de 5 fichas por cuenta. También permite **borrarla**, lo
   que agrega su teléfono y nombre a la lista de bloqueo de la guía.
2. **Moderación de cambios**: cambiar **nombre, sección o rubro** vuelve la ficha a "pendiente". Horario, fotos,
   descripción, contacto, dirección y localidades se publican al instante y aparecen en "Cambios recientes" del
   admin, que puede ocultar la ficha.
3. **Lista de bloqueo propia de la guía**: borrar una ficha no bloquea los avisos de empleo de esa persona o
   empresa, ni al revés (mismo mecanismo que `import_blocklist`, con tipos distintos).
4. **"Novedades de la guía"**: ficha aprobada, ocultada o reclamada. El resumen de contactos de la semana se ve
   en la cuenta (no hay tarea programada ni mail semanal en esta versión). Las **empresas** también eligen qué
   avisos reciben por tipo (postulantes, sus avisos, la guía), igual que las personas.
5. **Preferencias**: las localidades de interés **se suman** a la localidad donde vive para la compatibilidad;
   en "Para vos" se excluyen los avisos de jornada o modalidad no elegidas (si no eligió ninguna, no se filtra);
   en `/buscar` y el modo flyers son filtros por defecto que el usuario puede sacar, y la API de búsqueda acepta
   **varias localidades**.

## Decisiones que quedan para quien construye

- Esquema exacto de tablas (sugerido: `places`, `place_photos` dentro de la fila como JSON, `place_stats`
  diario por ficha) y nombres de rutas (sugerido: `/guia`, `/guia/:slug`, `/api/places…`).
- Formato del horario (sugerido: por día de la semana, uno o dos tramos `HH:MM-HH:MM`, cierre después de
  medianoche permitido para boliches, "cerrado", "24 horas", "con turno"); el cálculo de "Abierto ahora" usa
  la hora de Argentina (UTC-3) en el servidor y en el navegador.
- Orden de la lista: destacadas vigentes, después abiertas ahora, después actualizadas más recientemente.
- Límites (fotos por ficha, fichas por cuenta) y anti-abuso de los contadores (un toque por IP y ficha
  cada tanto).
- Diseño fino de la ficha, de la banda de portada y de las pantallas de carga, dentro de `DESIGN.md`.
