# Workuco v3 — diseño

Fecha: 2026-11-10 · Rama: `v3-mejoras`

## Objetivo

Workuco ya funciona de punta a punta (búsqueda, postulación, perfil, wizard de publicación,
Kanban, IA opcional, admin). La v3 busca dos cosas:

1. Que la página **llame la atención y dé ganas de usarla**: rediseño visual audaz.
2. Que **resuelva dolores reales** de los dos lados:
   - Quien busca trabajo no sabe qué ofertas le convienen, no tiene CV, y no sabe si le van a contestar.
   - Quien contrata solo puede esperar a que alguien se postule, y escribe cada aviso desde cero.

## Restricciones

- Sin dependencias: Node 24 (`node:sqlite`) + HTML/CSS/JS vanilla. Sin build.
- Se mantiene la marca: logo y verde. Las fuentes se cargan desde Google Fonts.
- Sin envío de emails: toda notificación es dentro del sitio.
- Las 82 pruebas actuales de `tools/test-api.js` siguen pasando.
- Migración suave: columnas con `ensureColumn`, tablas con `CREATE TABLE IF NOT EXISTS`.
- No se hace push a GitHub sin que el dueño lo pida (un push despliega en Render).

## 1. Dirección visual: "el Valle de noche"

Tokens (en `:root` de `public/styles.css`):

| Token | Valor | Uso |
|---|---|---|
| `--night` | `#0b1612` | fondo de hero, bandas oscuras, footer |
| `--night-2` | `#12241d` | superficies sobre fondo oscuro |
| `--cream` | `#f5f1e6` | fondo general claro |
| `--lime` | `#c8f560` | acento principal sobre oscuro, CTA |
| `--green` | `#0a8263` | marca; acento sobre claro |
| `--malbec` | `#7a1f4d` | secundario: destacados, changas |
| `--ink` | `#0f1a15` | texto sobre claro |

- Titulares: **Bricolage Grotesque** 700/800, tamaño `clamp(44px, 8vw, 104px)` en el hero.
  Texto: Inter.
- Botón primario: lima con texto oscuro sobre fondos oscuros; verde con texto blanco sobre claros.
- Radio de tarjetas 22px; sombras marcadas en hover con desplazamiento de 4px.

Home (`public/index.html` + `initHome`):

- Hero oscuro a pantalla casi completa con silueta de la cordillera en 3 capas SVG (parallax
  leve al mover el mouse/scroll), titular con palabra rotativa (bodega, cocina, finca, obra,
  oficina), buscador y 3 tarjetas de oferta reales flotando.
- Interruptor **Busco trabajo / Quiero contratar**: cambia titular, subtítulo, CTA y los
  bloques de "cómo funciona". La elección se recuerda en `localStorage`.
- Contadores animados con datos reales de `/api/meta` (ofertas, empresas, personas).
- Cinta en movimiento con los rubros (link a `/buscar?category=`).
- Bloques: Recomendadas para vos (si hay sesión de persona) · Destacadas · Changas ·
  Cómo funciona (bento) · Empresas · CTA final.

Resto: tarjetas de oferta con portada, sueldo visible y % de compatibilidad; apariciones al
hacer scroll (`IntersectionObserver`). Paneles (empresa, perfil, admin) adoptan paleta y
tipografía pero conservan su estructura. Todo movimiento se desactiva con
`prefers-reduced-motion: reduce`. Se verifica en 320, 390, 768 y 1366 px.

## 2. Compatibilidad, alertas y notificaciones

### `lib/match.js`

`matchScore(candidate, job) -> { score: 0..100, reasons: string[], missing: string[] }`.
Función pura, sin acceso a la base. Pesos:

| Señal | Puntos |
|---|---|
| Habilidades: proporción de `job.skills` presentes en `candidate.skills` (o, si el aviso no tiene habilidades, habilidades del candidato que aparecen en título/requisitos/descripción) | 45 |
| Localidad igual (o modalidad Remoto) | 20 |
| Rubro del aviso dentro de `candidate.categories` (o el titular/experiencia menciona el rubro) | 15 |
| Disponibilidad compatible con el tipo de empleo | 10 |
| Sueldo: `job.salaryMax >= candidate.salaryMin`, o alguno sin dato | 10 |

La comparación de textos normaliza a minúsculas sin acentos. `reasons` son frases cortas en
español ("Vivís en la misma localidad", "Tenés 3 de las 4 habilidades"); `missing` lista las
habilidades pedidas que faltan. Si el perfil no tiene habilidades ni localidad devuelve
`score: null` (no se muestra nada).

Uso:
- `GET /api/jobs` y `GET /api/jobs/:id`: con sesión de persona, cada oferta lleva `match`.
- `GET /api/jobs?sort=match`: ordena por compatibilidad (solo con sesión de persona).
- `GET /api/candidate/recommended`: hasta 6 ofertas con mayor compatibilidad a las que no se postuló.
- Lado empresa: cada postulante y cada persona de la base de talento lleva `match` contra la oferta.

### Notificaciones

Tabla `notifications(id, recipient_type 'candidate'|'company', recipient_id, kind, title, body, link, read, created_at)`.

Se crean cuando:
- cambia la etapa de una postulación → a la persona (incluye el descarte, con texto amable);
- una empresa invita a una persona → a la persona;
- se aprueba una oferta que coincide con una alerta → a la persona;
- llega una postulación → a la empresa;
- el admin aprueba o rechaza una oferta → a la empresa.

API: `GET /api/notifications` (últimas 30 + `unread`), `POST /api/notifications/read`
(todas, o `{id}`). UI: campanita en el encabezado con contador y desplegable; se consulta al
cargar cada página.

### Alertas

Tabla `alerts(id, candidate_id, label, q, locality, category, type, modality, gig, created_at)`.
API: `GET/POST /api/candidate/alerts`, `DELETE /api/candidate/alerts/:id`. Máximo 10 por persona.
UI: botón "Avisarme de búsquedas como esta" en `/buscar`; lista en *Mi perfil → Alertas*.
Al pasar una oferta a `approved` se recorren las alertas y se notifica a las que coinciden.

## 3. CV automático y perfil público

- `GET /cv/:candidateId`: página con diseño de CV armada desde el perfil (foto, titular,
  resumen, habilidades, experiencia, formación, disponibilidad, contacto). Botón "Descargar
  PDF" = `window.print()` con hoja de estilos de impresión A4. Acceso: la propia persona, las
  empresas a las que se postuló, y el admin (misma regla que el CV en PDF).
- La ficha del postulante en el panel muestra "Ver CV Workuco" siempre, además del PDF subido
  si existe. El % de perfil completo ya no exige subir un PDF.
- Perfil público opcional: columnas `candidates.public_slug` y `candidates.is_public`.
  `GET /p/:slug` muestra nombre, foto, titular, resumen, habilidades, experiencia, formación
  y localidad. **Nunca** muestra teléfono ni email. Botón de compartir por WhatsApp desde
  *Mi perfil*.

## 4. Base de talento para empleadores

- Columnas nuevas en `candidates`: `open_to_work INTEGER DEFAULT 0`, `categories TEXT` (JSON),
  `salary_min INTEGER`. Se editan en *Mi perfil* ("Estoy disponible: las empresas pueden
  encontrarme e invitarme").
- `GET /api/company/talent?jobId=&q=&locality=&category=`: personas con `open_to_work=1`,
  sin teléfono ni email, con `match` contra `jobId` si se pasa, ordenadas por compatibilidad.
  Indica si ya fue invitada o ya se postuló.
- Tabla `invitations(id, company_id, job_id, candidate_id, message, status 'enviada'|'postulada'|'rechazada', created_at)`,
  única por `(job_id, candidate_id)`. `POST /api/company/invitations` crea la invitación y la
  notificación. Límite: 20 invitaciones por empresa por día.
- `GET /api/candidate/invitations`; al postularse a esa oferta la invitación pasa a `postulada`.
- UI: pestaña **Talento** en `/panel`; sección **Invitaciones** en *Mi perfil*.
- **Plantillas de aviso**: `lib/templates.js` con 8 plantillas (cosecha, operario de bodega,
  mozo/a, cocina, ventas en comercio, administración, obra, turismo) servidas en `/api/meta`.
  Paso 1 del wizard: "Empezar con una plantilla".
- **Mensajes rápidos de WhatsApp** en la ficha del postulante: "Citar a entrevista", "Pedir
  más datos", "Avisar que no continúa". Abren `wa.me` con el texto ya armado (nombre, puesto,
  empresa). No se envía nada desde el servidor.

## 5. Confianza y changas

- **Respuesta de la empresa**: columna `applications.responded_at`, que se completa la primera
  vez que la etapa deja de ser `nuevo`. Por empresa se calcula `responseRate` (% de
  postulaciones con más de 3 días que tuvieron respuesta) y `responseDays` (mediana). Se
  muestra como insignia en oferta y ficha de empresa solo si hay al menos 3 postulaciones.
- **Sueldo estructurado**: columnas `jobs.salary_min`, `jobs.salary_max`,
  `jobs.salary_period` (`mes`|`día`|`hora`). El campo de texto `salary` se conserva para
  avisos viejos. Filtros nuevos en `/api/jobs`: `withSalary=1`, `sort=salary`. El wizard
  muestra un aviso si se deja vacío.
- **Habilidades del aviso**: columna `jobs.skills` (JSON, hasta 8) con chips en el wizard.
- **Changas**: columnas `jobs.gig INTEGER DEFAULT 0`, `jobs.start_date TEXT`,
  `jobs.duration TEXT`. Filtro `gig=1` en `/api/jobs`. Página `/changas` y bloque en la home,
  con tarjetas que destacan pago por día, inicio, duración y cupos. Opción "Es una changa o
  trabajo por temporada" en el wizard.

## Datos demo

`lib/demo.js` se amplía: sueldos estructurados y habilidades en las ofertas, 4 changas, las
personas demo con `open_to_work`, rubros y algunas con perfil público, postulaciones con
`responded_at`, y un par de invitaciones y notificaciones.

## Manejo de errores

- Todo endpoint nuevo valida rol y pertenencia (una empresa solo invita a sus propias ofertas
  aprobadas; una persona solo ve sus alertas, invitaciones y notificaciones).
- Entradas saneadas con las utilidades existentes (`clean`, `arrOf`). Números de sueldo
  acotados a 0..99.999.999.
- Las notificaciones nunca hacen fallar la acción principal (se crean en `try/catch`).

## Pruebas

- `tools/test-match.js`: casos de `matchScore` (coincidencia total, sin datos, acentos,
  remoto, sueldo).
- `tools/test-api.js`: casos nuevos para match en listados, recomendadas, alertas,
  notificaciones, talento (no filtra contacto), invitaciones (límites y permisos), CV
  Workuco (permisos), perfil público (sin contacto), sueldo/changas, respuesta de empresa.
- Verificación en navegador de cada pantalla en escritorio y celular, con capturas.

## Fuera de alcance

Emails, pagos, chat interno, app nativa, modo claro/oscuro elegible por el usuario.
