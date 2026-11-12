# WorkUco — Portal de empleo del Valle de Uco

Plataforma web para buscar y publicar empleos en **San Carlos, Tunuyán y Tupungato**.
Aplicación real y funcional: sin dependencias, sin build, con base de datos propia.

- **Stack**: Node.js 24 (`node:sqlite`) + frontend vanilla (HTML/CSS/JS).
- **Puerto**: 4250.
- **Diseño** (v3, "el Valle de noche"): bandas verde noche `#0b1612`, base crema `#f5f1e6`, lima `#c8f560`
  para la acción, malbec `#7a1f4d` para changas, verde de marca `#0a8263`. Títulos en Bricolage Grotesque,
  texto en Inter. La home es el Valle de noche: cordillera en capas con San Carlos, Tunuyán y Tupungato
  marcados con sus búsquedas abiertas reales. Responsive (mobile primero) y respeta `prefers-reduced-motion`.
- **Dos lados**: quien busca trabajo (**empleado**) y quien contrata (**empleador**), cada uno
  con su propio recorrido y su propio panel.

## Arrancar

```
Iniciar WorkUco.bat        (o: node server.js)
```

Abre `http://localhost:4250`. Desde el celular en la misma WiFi: `http://IP-DE-LA-PC:4250`.

### Accesos de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Empresa demo | `bodega@demo.workuco` | `demo12345` |
| Persona demo | `martina@demo.workuco` | `demo12345` |
| Administración | `admin@workuco.com.ar` | `workuco2026` (o `WORKUCO_ADMIN_PASS`) |

Cualquier empresa demo sirve para probar el panel: `finca@`, `cafe@`, `posada@`, `obras@`,
`estudio@`, `tienda@demo.workuco` (misma contraseña). Son empresas y personas **ficticias**.

Con `WORKUCO_DEMO=1` la base se siembra sola si está vacía: 18 ofertas (16 aprobadas, de las cuales 4
son changas, y 2 pendientes) con sueldo y habilidades, 7 empresas con fotos, 8 personas (7 disponibles
para la base de talento, 3 con perfil público), postulaciones en todas las etapas, invitaciones y avisos.

> Si ya tenías una base local de v2, la migración agrega las columnas y tablas nuevas sin borrar nada,
> pero los datos demo viejos no tienen changas ni sueldos estructurados. Para ver la demo v3 completa,
> arrancá con una carpeta de datos vacía (`WORKUCO_DATA=otra-carpeta`) o borrá `data/` a mano.

## Páginas

| Ruta | Qué hace |
|---|---|
| `/` | Home: interruptor busco / contrato, buscador, mapa del Valle con búsquedas por pueblo, recomendadas, changas, empresas |
| `/buscar` | Búsqueda con filtros por palabra, localidad, categoría, tipo, modalidad, sueldo publicado y changas; orden por fecha, sueldo o compatibilidad; botón de alerta |
| `/changas` | Trabajos por día o temporada: pago por jornada, inicio, duración y cupos |
| `/flyers` | Modo flyers: avisos de a uno a pantalla completa, deslizando como TikTok: compartir (izquierda), guardar (derecha), barra para deslizar y postularse, compatibilidad arriba a la derecha y filtro de lugar |
| `/reclamar/:código` | Link privado para que una empresa reclame o borre la ficha que armamos con sus avisos |
| `/cv/:id` | CV WorkUco imprimible (A4) armado desde el perfil; "Descargar PDF" con la impresión del navegador |
| `/p/:slug` | Perfil público opcional de la persona, sin teléfono ni mail |
| `/oferta/:id` | Detalle con carrusel de fotos de la empresa, resumen, beneficios y postulación |
| `/empresas` | Directorio de empresas del Valle |
| `/empresa/:id` | Ficha pública: carrusel, descripción, datos y búsquedas abiertas |
| `/acceder` | Entrada con **selector de rol** (busco trabajo / quiero contratar) |
| `/mi-perfil` | Perfil de la persona: foto, titular, CV, habilidades, disponibilidad, guardadas y postulaciones |
| `/publicar` | Alta de oferta en **4 pasos** (wizard con tarjetas y chips) |
| `/panel` | Panel de empresa: resumen, ofertas, postulantes (Kanban), mi empresa, IA |
| `/admin` | Panel de administración |
| `/acerca`, `/contacto`, `/faq`, `/terminos`, `/privacidad` | Páginas institucionales |

## Funcionalidades

### Nuevo en v3

**Quien busca trabajo**
- **Compatibilidad** con cada oferta (0 a 100) y el porqué: habilidades, localidad, rubro, disponibilidad y
  sueldo. Cálculo propio (`lib/match.js`), sin IA. Ordená por "Más compatibles conmigo".
- **Recomendadas para vos** en la home y en *Mi perfil → Para vos*.
- **Alertas de búsqueda** (hasta 10): cuando se aprueba una oferta que coincide, llega una notificación.
- **Campanita** de notificaciones: cambios de etapa (incluido el descarte), invitaciones y alertas.
- **"Estoy disponible"**, rubros de interés y sueldo pretendido: te suman a la base de talento.
- **CV WorkUco** automático e imprimible, y **perfil público** con botón para compartir por WhatsApp.
- **Sueldo estructurado** (desde/hasta, por mes/día/hora): filtro "con sueldo publicado" y orden por sueldo.
- **Changas**: sección propia con inicio, duración, cupos y pago por jornada.

**Empresas**
- **Base de talento** (*Panel → Talento*): gente disponible del Valle, ordenada por compatibilidad con tu
  búsqueda, sin datos de contacto. **Invitá a postularse** (20 invitaciones por día).
- **8 plantillas del Valle** en el wizard: cosecha, bodega, mozo, cocina, ventas, administración, obra, turismo.
- Wizard con **changa** (inicio y duración), **habilidades buscadas** y **sueldo estructurado**.
- Ficha del postulante con **compatibilidad**, **CV WorkUco** y **mensajes rápidos de WhatsApp** (citar a
  entrevista, pedir datos, avisar que no sigue).
- **Insignia de respuesta**: qué % de postulaciones responde la empresa y en cuántos días (desde 3
  postulaciones). La ven las personas en la oferta y en la ficha de la empresa.

### Nuevo en v4: avisos importados de canales de WhatsApp

Para arrancar con contenido real, el admin carga avisos que circulan en canales de la zona y la
empresa decide si los quiere administrar o borrar.

1. **Admin → Importar**: pegá los mensajes del canal (hasta 20.000 caracteres) o subí hasta 6
   capturas/flyers. La IA separa cada aviso y arma un borrador; vos revisás, corregís y publicás.
   Sin IA configurada, "Cargar uno a mano".
2. Cada aviso queda a nombre de una **ficha "sin reclamar"** (la misma ficha si se repite el
   teléfono o el nombre), con la etiqueta "Tomado de <canal>", y **vence a los 30 días**.
   La gente puede postularse igual: las postulaciones esperan a la empresa.
3. En la tabla de fichas importadas, **"Avisar por WhatsApp"** abre tu WhatsApp con el mensaje ya
   escrito y un link privado `/reclamar/<código>`.
4. En ese link la empresa elige: **es nuestra** (crea su cuenta y pasa a manejar ficha, avisos y
   postulantes), **corregir datos** (reclama y edita) o **borrarla** (se elimina al instante, se
   avisa a quienes se postularon y su teléfono y nombre quedan en una lista de "no importar").

Configuración (variables de entorno del servidor):

| Variable | Para qué |
|---|---|
| `WORKUCO_IMPORT_AI_PROVIDER` | `gemini` (recomendado, lee imágenes), `openai`, `anthropic` o `custom` |
| `WORKUCO_IMPORT_AI_KEY` | API key del admin (separada de las keys de cada empresa) |
| `WORKUCO_IMPORT_AI_MODEL` / `WORKUCO_IMPORT_AI_BASE` | Opcionales (por defecto `gemini-2.5-flash`) |
| `WORKUCO_CONTACT_WA` | WhatsApp de WorkUco para el botón "¿Es tu empresa? Escribinos" |

Privacidad: el código de reclamo y el texto original del canal sólo los ve el admin; nunca se
publican datos de personas que buscan trabajo sacados de los canales.

### Flyers

- Cada aviso puede tener **hasta 5 flyers** (JPG, PNG o WebP; se achican en el navegador). El
  primero es el principal. Con al menos un flyer, la descripción mínima baja de 60 a 20 caracteres
  (algo de texto hace falta para la búsqueda, las alertas y la compatibilidad).
- Con la IA de la empresa configurada, **"Completar el aviso con el flyer principal"** llena puesto,
  descripción, requisitos, sueldo, fechas y contacto.
- Los flyers se ven **siempre completos** (sin recortes) sobre su propia versión desenfocada: en la
  tarjeta (con "+N" si hay más), en el carrusel del detalle y en el modo flyers.
- **Modo flyers** (`/flyers`): primero los avisos con flyer, después el resto con un flyer generado
  por WorkUco. Se pasa de aviso deslizando hacia arriba (o con ↑/↓ y la rueda en la computadora),
  y entre flyers del mismo aviso deslizando de costado. Carga de a 10.
  Abajo, una barra que se arrastra hasta el final lleva al aviso completo para postularse (un toque
  solo muestra el gesto; con teclado, Enter entra directo). Manteniendo apretado el flyer se esconde
  todo y queda sólo la imagen. Con sesión de persona, arriba a la derecha va la compatibilidad:
  la primera vez dice "compatible con tu perfil", a los 4 s queda sólo el porcentaje y tocándola se abre.
- API: `flyers: [dataUrl…]` al publicar; al editar, `keepFlyers: [url…]` (los que quedan, en orden)
  + `flyers` nuevos; `removeFlyer: true` los saca todos. `GET /api/jobs?sort=flyer`.

### Desde v2

**Quien busca trabajo**
- Perfil con **foto**, **CV en PDF**, titular, resumen, habilidades, experiencia, formación y
  disponibilidad. Barra de **% de perfil completo** que dice qué falta.
- Postularse **en un toque**: el perfil viaja con la postulación, sin volver a escribir nada.
- **Guardar ofertas** (corazón) y verlas después en *Mi perfil → Guardadas*.
- **Mis postulaciones** con la etapa real en la que está cada una.
- Compartir una oferta con el botón nativo del teléfono.

**Empresas**
- Registro/login con contraseña cifrada (scrypt + salt) y sesión en cookie HttpOnly.
- Publicar en **4 pasos** con preview en vivo: sin formularios eternos.
- **Galería de fotos** (hasta 8, se achican en el navegador): alimenta el **carrusel** de la
  ficha de empresa y de cada aviso, y la portada de las tarjetas en el listado.
- **Panel de postulantes tipo Kanban** por etapas (nuevo → revisión → entrevista → finalista →
  contratado / descartado), arrastrando tarjetas o con un toque en mobile.
- Ficha del postulante con perfil completo, nota interna, **estrellas de puntaje**, etiquetas,
  historial y contacto por WhatsApp/mail.
- **IA opcional**: cada empresa conecta **su propia API key** (OpenAI o cualquier API
  compatible, Google Gemini, Anthropic o una URL propia) y la IA **lee el CV, lo resume, marca
  puntos fuertes y dudas** y le pone un puntaje. Se puede activar el análisis automático.
  La key se guarda por empresa y nunca se devuelve al navegador.
- Resumen con KPIs, embudo de postulantes, "para hacer hoy" y últimos postulantes.
- Duplicar ofertas, ver visitas por aviso, exportar postulantes a **CSV**.

**Administración**
- KPIs: publicadas, pendientes, postulaciones, empresas, visitas.
- Aprobar, rechazar con motivo, destacar, editar y eliminar ofertas.
- Ver todas las postulaciones y sus CVs; verificar empresas y asignar plan.

## Estructura

```
workuco/
  server.js          servidor HTTP + API JSON + sesiones + estáticos
  lib/store.js       capa SQLite (node:sqlite): schema, consultas, métricas
  lib/demo.js        datos de demostración (empresas y personas ficticias)
  lib/ai.js          proveedores de IA (OpenAI compatible, Gemini, Anthropic)
  lib/cvtext.js      extracción de texto de CV en PDF
  lib/match.js       compatibilidad perfil ↔ oferta (0 a 100 y motivos), función pura
  lib/templates.js   8 plantillas de aviso por rubro del Valle
  public/
    index.html · buscar.html · oferta.html · empresas.html · empresa.html
    acceso.html · mi-perfil.html · publicar.html · panel.html · admin.html · info.html
    changas.html · cv.html (+ cv.css) · perfil-publico.html
    app.js           lógica de las páginas públicas y del perfil
    panel.js         lógica del panel de empresa
    styles.css       estilos base y tokens
    valle.css        sistema visual v3 "el Valle de noche" (se carga después de styles.css)
    demo/            fotos y logos de las empresas de ejemplo
  tools/
    test-match.js    pruebas del motor de compatibilidad
    test-api.js      82 pruebas end-to-end de la API
    test-v3.js       86 pruebas de las funciones v3 (sueldo, changas, match, avisos, talento, CV)
    test-ui-v3.mjs   prueba en Chrome: publicar y editar una changa, y HTML escapado en invitaciones
    test-ai.js       pruebas del armado de prompts y parseo de respuestas
    test-ui.mjs      prueba de UI con dos navegadores
    check-layout.mjs chequeo de desbordes en 320/390/768/1366
    shots.mjs        capturas de todas las pantallas en shots/
  data/              workuco.sqlite + cv/ + fotos (no se versiona)
  render.yaml        deploy en Render (plan free)
  Dockerfile         imagen opcional
```

## API

Público: `GET /api/meta` (incluye conteos y plantillas), `GET /api/jobs` (q, locality, category, type,
modality, withSalary, gig, sort=recent|old|salary|match, page),
`GET /api/jobs/:id`, `POST /api/jobs/:id/apply`, `GET /api/companies`, `GET /api/companies/:id`,
`GET /api/me`, `GET /api/public/:slug` (perfil público, sin contacto).

Personas y empresas: `GET /api/notifications`, `POST /api/notifications/read`.

Persona: `GET/PATCH /api/candidate/profile`, `GET /api/candidate/applications`,
`GET/POST /api/candidate/saved[/:jobId]`, `GET /api/photo/c/:id`, `GET /api/cv/c/:id`,
`GET /api/candidate/recommended`, `GET/POST /api/candidate/alerts`, `DELETE /api/candidate/alerts/:id`,
`GET /api/candidate/invitations`, `GET /api/cv-data/:id` (CV WorkUco; también empresa con postulación y admin).

Empresa: `POST /api/auth/register|login|logout`, `GET/POST /api/company/jobs`,
`PUT/DELETE /api/company/jobs/:id`, `GET /api/company/applications`,
`PATCH /api/company/applications/:id`, `GET /api/company/applications.csv`,
`GET /api/company/cv/:id`, `PATCH /api/company/profile`, `POST/DELETE /api/company/gallery`,
`GET/PATCH /api/company/ai`, `POST /api/company/ai/test`, `POST /api/company/ai/describe`,
`GET /api/company/dashboard`, `GET /api/company/talent` (jobId, q, locality, category; sin contacto),
`POST /api/company/invitations` (20 por día, configurable con `WORKUCO_INVITE_LIMIT`).

Admin: `POST /api/admin/login`, `GET /api/admin/stats|jobs|applications|companies`,
`PATCH/DELETE /api/admin/jobs/:id`, `PATCH /api/admin/companies/:id`.

## Seguridad

- Consultas SQL parametrizadas y validación de todos los campos en el servidor.
- Contraseñas con scrypt (16 bytes de salt, 64 de hash) y comparación en tiempo constante.
- Sesiones persistidas con vencimiento (7 días) en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS.
- Límite de intentos de login (8 fallos → 10 minutos) por IP.
- Protección CSRF básica: los POST/PATCH con `Origin` externo se rechazan.
- CVs y fotos solo accesibles para la empresa dueña de la oferta/postulación y el administrador.
- Validación real de PDF (firma `%PDF-`), límite de 4 MB y de 8 fotos por empresa.
- La API key de IA se guarda por empresa, nunca se envía al navegador (solo enmascarada).
- Base de talento y perfil público nunca exponen teléfono ni mail: el contacto llega cuando la persona se postula.
- Todo texto de usuario nuevo (habilidades, alertas, mensajes de invitación, avisos) se escapa al mostrarse.
- Links de reclamo: 24 bytes aleatorios, de un solo uso, con límite de intentos (8 fallos → 10 minutos).
  Las fichas sin reclamar no pueden iniciar sesión.
- `/media/` sólo entrega imágenes (jpg, png, webp): los CV en PDF se bajan únicamente por `/api/cv/...` con permiso.

## Cumplimiento legal (Argentina)

Lo que ya hace el sitio:

- **Ley 25.326 (datos personales):** casilla obligatoria al crear cuenta y al reclamar una ficha (se guarda
  `terms_at` y `terms_version`); aviso informativo al postularse; política de privacidad con finalidad,
  destinatarios, datos obligatorios y opcionales, transferencia internacional, conservación y derechos; leyenda
  de la AAIP en el pie de todas las páginas; **descargar mis datos** (`GET /api/account/export`) y **darme de
  baja** (`POST /api/account/delete`, pide la contraseña y borra todo en el momento) desde el perfil, el panel
  y `/baja`. Para pedidos de baja por mail: `node tools/borrar-cuenta.js <email> [--borrar]`.
- **Edad mínima (Ley 26.390):** al crear cuenta y al postularse se declara tener 16 años o más.
- **Avisos discriminatorios (Ley 23.592; LCT arts. 17 y 81):** `lib/legal.js` detecta edad, sexo, "buena
  presencia", estado civil, aspecto, religión o nacionalidad. No bloquea: avisa a la empresa en el último paso
  del asistente y marca el aviso en la revisión del admin.
- **Avisos importados:** se cita la fuente, la empresa puede reclamar o borrar, y mientras no reclame no se
  muestran su teléfono ni su mail (se postula por WorkUco).
- **Defensa del consumidor:** link "Botón de baja" en el pie de todas las páginas; el botón de arrepentimiento
  no aplica mientras el servicio sea gratis (habrá que sumarlo si se cobra algo).

Variables de entorno para producción (aparecen en el pie, los términos y la privacidad):

| Variable | Qué es |
|---|---|
| `WORKUCO_LEGAL_NAME` | Nombre o razón social del responsable |
| `WORKUCO_LEGAL_CUIT` | CUIT |
| `WORKUCO_LEGAL_ADDRESS` | Domicilio legal en Argentina |
| `WORKUCO_LEGAL_EMAIL` | Mail para pedidos de datos (por defecto `hola@workuco.com.ar`) |
| `WORKUCO_DB_REGISTRY` | Número de inscripción de la base en el Registro Nacional de Bases de Datos (AAIP) |

Lo que tiene que hacer el responsable (no se resuelve con código): inscribir las bases de datos en la AAIP
(trámite gratuito en TAD), completar las variables de arriba, tener activo el mail de contacto y contestar en
plazo (10 días corridos el acceso; 5 días hábiles corrección y baja), y pedir permiso a los canales y empresas
antes de importar sus avisos.

## Pruebas

```
npm test                     # importador, IA con imágenes, match, API, v3, v4 y legal (cada uno con su servidor temporal)
node tools/test-api.js       # 82 pruebas (servidor temporal + datos demo)
WK_BASE=http://localhost:4250 node tools/test-ui-v3.mjs   # con un servidor con demo fresca
WK_BASE=http://localhost:4250 node tools/test-ui-v4.mjs   # idem, con WORKUCO_IMPORT_AI_FAKE=1
node tools/test-ai.js        # prompts y parseo de la IA
node tools/check-layout.mjs http://localhost:4250/ 320 390 768 1366
node tools/shots.mjs http://localhost:4250          # capturas en shots/
```

## Deploy en Render

Repo: <https://github.com/Lucho50566/workuco> (público).
Deploy en un clic: <https://render.com/deploy?repo=https://github.com/Lucho50566/workuco>

`render.yaml` define Node 24, plan free, `WORKUCO_DEMO=1` y una contraseña de admin generada
por Render (se ve en **Environment**). El disco del plan free es efímero: al reiniciar se
pierden las cuentas y postulaciones reales y vuelven los datos demo.

## Preparado para monetizar

- `companies.plan` (`free` / `pro` / `premium`) y `jobs.featured` ya existen.
- El alta de ofertas pasa por un único punto (`POST /api/company/jobs`), donde se pueden aplicar
  límites por plan o cobros sin tocar el frontend.
- No hay pasarela de pago integrada todavía (a propósito).

## Limitaciones conocidas

- No envía emails: las postulaciones se ven en el panel de la empresa.
- El aviso de aprobación/rechazo se consulta en el panel (no hay notificación push).
- La IA depende de la key y la cuota de cada empresa; sin key, el panel funciona igual.
- En Render free el servicio se duerme a los 15 minutos sin visitas (~50 s para despertar).
