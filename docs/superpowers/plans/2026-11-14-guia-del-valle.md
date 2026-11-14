# Guía del Valle y preferencias de la cuenta de persona — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a WorkUco la Guía del Valle (fichas de Oficios, Servicios, Salidas y Comida que publican personas, empresas o el admin) y las preferencias configurables de la cuenta de persona y de empresa.

**Architecture:** La lógica pura de la guía (rubros, validación, horario y "abierto ahora") va en `lib/places.js`; la persistencia, en métodos nuevos de `Store` (`lib/store.js`); las rutas, en una sección propia de `server.js`; la interfaz, en un archivo nuevo `public/guia.js` que usa los helpers de `window.WK`. Las preferencias extienden lo existente (`/api/account/prefs`, `matchScore`, `searchJobs`, `mailNotice`).

**Tech Stack:** Node 24 sin dependencias, `node:sqlite`, HTML/CSS/JS sin build, pruebas con scripts `tools/test-*.js` (servidor temporal) y Chrome headless (`tools/test-ui-*.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-14-guia-del-valle-design.md`

## Global Constraints

- Sin dependencias nuevas; migraciones con `ensureColumn` / `CREATE TABLE IF NOT EXISTS`.
- SQL parametrizado; todo texto de usuario se escapa al mostrarse (`esc`); imágenes sólo por `saveImage` (jpg/png/webp, firma real, ≤5 MB).
- Secciones y rubros exactos del spec (Oficios, Servicios, Salidas, Comida con sus listas); localidades: San Carlos, Tunuyán, Tupungato.
- Hasta 6 fotos por ficha y 5 fichas por cuenta.
- Primera publicación pendiente de aprobación; cambiar nombre, sección o rubro vuelve a "pendiente"; el resto se publica al instante y figura en "Cambios recientes".
- Fichas del admin: comercios con contacto, `noindex` y fuera del sitemap hasta reclamarse, con la leyenda "Ficha armada por WorkUco con datos públicos. ¿Es tuya? Reclamala o pedí que la borremos"; Oficios sólo con la casilla obligatoria "La persona me autorizó a publicarla" (se guarda quién y cuándo).
- "Destacado" visible como etiqueta, con vencimiento opcional; sin pagos ni precios en la página.
- "Abierto ahora" con hora de Argentina (UTC-3).
- Sin reseñas, pagos, reservas, pedidos ni mapa embebido.
- En modo demo nada se indexa. Celular primero (390 px), sin desbordes a 320 px.
- Copia y textos en español rioplatense, como el resto del sitio. Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Horario que pasa la medianoche (boliche 23:00–06:00), incluido domingo→lunes: a las 02:00 del lunes figura abierto. → Task 1.
2. Instagram cargado como `@usuario`, URL completa o basura; sitio web `javascript:`: se normaliza o se rechaza. → Task 1.
3. Teléfonos en formatos locales (`+54 9 2622 15-555123`, `02622 555123`): el link de WhatsApp sale `https://wa.me/549` + 10 dígitos. → Task 1.
4. Reclamar una ficha con una cuenta que ya tiene 5: 409 con mensaje claro y la ficha sigue sin reclamar. → Task 3.
5. Dar de baja una cuenta con fichas: se borran las fichas y sus fotos, y `/guia/:slug` da 404. → Task 7.

---

### Task 1: Lógica de la guía (`lib/places.js`)

**Files:**
- Create: `lib/places.js`
- Test: `tools/test-places-lib.js`

**Interfaces:**
- Produces:
  - `SECTIONS: { oficios: {label, categories: string[]}, servicios: …, salidas: …, comida: … }` (rubros del spec, en ese orden).
  - `DAYS = ['dom','lun','mar','mie','jue','vie','sab']` (índice = `getUTCDay()` de la hora AR).
  - `normalizeHours(raw) -> { mode: 'horario'|'24h'|'turno', days: { dom: [['HH:MM','HH:MM'], …] … } } | null` (hasta 2 tramos por día; `null` si no hay datos).
  - `openStatus(hours, nowMs = Date.now()) -> { state: 'open'|'closed'|'always'|'appointment'|'unknown', until: 'HH:MM'|null, opens: 'HH:MM'|null }` (`until` = hora de cierre si está abierto; `opens` = próxima apertura de hoy si está cerrado).
  - `normInstagram(v) -> string` (handle sin `@`, `''` si inválido; acepta `@x`, `x`, `instagram.com/x`).
  - `waLink(phone) -> string` (usa `normPhone` de `lib/importer.js`; `''` si no hay 10 dígitos).
  - `validatePlace(b, { admin = false } = {}) -> { ok, errors, data }` con `data = { name, section, category, localities, address, homeService, description, whatsapp, phone, instagram, website, hours }`.

- [ ] **Step 1: Write the failing tests** (`tools/test-places-lib.js`, mismo formato `check(name, cond)` que `tools/test-importer.js`)

```js
const L = require('../lib/places');
const at = (iso) => Date.parse(iso); // las fechas van en UTC; AR = UTC-3
const bar = L.normalizeHours({ mode: 'horario', days: { sab: [['23:00', '06:00']], dom: [['23:00', '06:00']] } });
check('sábado 23:30 AR abierto', L.openStatus(bar, at('2026-11-15T02:30:00Z')).state === 'open');      // sáb 23:30
check('domingo 02:00 AR abierto por el tramo del sábado', L.openStatus(bar, at('2026-11-15T05:00:00Z')).state === 'open');
check('lunes 02:00 AR abierto por el tramo del domingo', L.openStatus(bar, at('2026-11-17T05:00:00Z')).state === 'open');
check('lunes 07:00 AR cerrado', L.openStatus(bar, at('2026-11-17T10:00:00Z')).state === 'closed');
const shop = L.normalizeHours({ mode: 'horario', days: { lun: [['09:00', '13:00'], ['17:00', '21:00']] } });
const s = L.openStatus(shop, at('2026-11-16T13:00:00Z')); // lun 10:00 AR
check('abierto con cierre 13:00', s.state === 'open' && s.until === '13:00');
const c = L.openStatus(shop, at('2026-11-16T17:00:00Z')); // lun 14:00 AR
check('cerrado, abre 17:00', c.state === 'closed' && c.opens === '17:00');
check('24 horas', L.openStatus(L.normalizeHours({ mode: '24h' })).state === 'always');
check('con turno', L.openStatus(L.normalizeHours({ mode: 'turno' })).state === 'appointment');
check('sin horario', L.openStatus(null).state === 'unknown');
check('hora inválida se descarta', L.normalizeHours({ mode: 'horario', days: { lun: [['25:00', '13:00']] } }).days.lun.length === 0);
check('instagram @x', L.normInstagram('@pizzeria.uco') === 'pizzeria.uco');
check('instagram URL', L.normInstagram('https://www.instagram.com/pizzeria_uco/?hl=es') === 'pizzeria_uco');
check('instagram basura', L.normInstagram('<script>') === '');
check('WhatsApp de celular local', L.waLink('+54 9 2622 15-555123') === 'https://wa.me/5492622555123');
check('WhatsApp con 0', L.waLink('02622 555123') === 'https://wa.me/5492622555123');
const base = { name: 'Gas Don Tito', section: 'oficios', category: 'Gasista', localities: ['Tunuyán'], description: 'Instalaciones y reparaciones de gas, matriculado.', whatsapp: '2622 555123' };
check('ficha válida', L.validatePlace(base).ok);
check('rubro de otra sección no', !L.validatePlace({ ...base, category: 'Boliche' }).ok);
check('sin contacto no', !!L.validatePlace({ ...base, whatsapp: '', phone: '' }).errors.whatsapp);
check('sin localidad no', !!L.validatePlace({ ...base, localities: [] }).errors.localities);
check('sitio javascript: no', L.validatePlace({ ...base, website: 'javascript:alert(1)' }).data.website === '');
check('a domicilio sólo en oficios', L.validatePlace({ ...base, section: 'comida', category: 'Pizzería', homeService: true }).data.homeService === false);
```

- [ ] **Step 2: Run** `node tools/test-places-lib.js` — Expected: FAIL (`Cannot find module '../lib/places'`).

- [ ] **Step 3: Implement `lib/places.js`** con las firmas de arriba. `openStatus` convierte `nowMs` a hora AR restando 3 h y revisa los tramos de hoy y los tramos que cruzan la medianoche de ayer (`close <= open`). `validatePlace`: nombre 2–80, descripción 20–1500, localidades ⊆ `LOCALITIES` (≥1), dirección ≤120, al menos WhatsApp o teléfono (`normPhone` con 10 dígitos; error en `whatsapp`), sitio sólo `http(s)://`, `homeService` sólo si `section === 'oficios'`.

- [ ] **Step 4: Run** `node tools/test-places-lib.js` — Expected: `N ok · 0 fail`.

- [ ] **Step 5: Commit** `git add lib/places.js tools/test-places-lib.js && git commit -m "Guía: rubros, validación y horario de las fichas"`.

---

### Task 2: Persistencia de fichas (`lib/store.js`)

**Files:**
- Modify: `lib/store.js` (migraciones en el constructor; métodos nuevos en un bloque `/* ---------------- guía ---------------- */`)
- Test: `tools/test-places-store.js`

**Interfaces:**
- Consumes: `normPhone`, `normName` (`lib/importer.js`).
- Produces (tabla `places`: `id, slug UNIQUE, owner_type ('candidate'|'company'|NULL), owner_id, section, category, name, name_norm, description, localities JSON, address, home_service, whatsapp, phone, phone_norm, instagram, website, hours JSON, photos JSON, status ('pending'|'approved'|'rejected'|'hidden'), reject_reason, featured_until (ms, NULL = no; 0 = sin vencimiento), imported, claim_token UNIQUE, consent_by, consent_at, created_at, updated_at, approved_at`; tabla `place_stats(place_id, day 'YYYY-MM-DD', views, whatsapp, calls, maps, PRIMARY KEY(place_id, day))`):
  - `insertPlace(p) -> place`, `updatePlace(id, patch) -> place`, `place(id)`, `placeBySlug(slug)`, `placesOf(ownerType, ownerId) -> place[]`, `countPlacesOf(ownerType, ownerId) -> number`.
  - `searchPlaces({ section, category, locality, q, page = 1, limit = 12 }) -> { places, total, pages }` — sólo `approved`; orden: destacada vigente, después `updated_at DESC`.
  - `setPlaceStatus(id, status, reason = null)`, `setPlaceFeatured(id, untilMs | null)`.
  - `bumpPlaceStat(id, kind: 'views'|'whatsapp'|'calls'|'maps')`, `placeStats(id) -> { week: {views, contacts}, month: {views, contacts} }`.
  - `recentPlaceChanges(limit = 50)` — aprobadas con `updated_at > approved_at`.
  - `placeByClaimToken(token)`, `claimPlace(id, ownerType, ownerId) -> place | null` (atómico: `WHERE claim_token=? AND owner_id IS NULL`; borra el token).
  - `placeBlocked(phoneNorm, nameNorm) -> bool`, `addPlaceBlock(phoneNorm, nameNorm, label)` (en `import_blocklist` con `kind` `'place_phone'` / `'place_name'`).
  - `deletePlace(id) -> string[]` (fotos a borrar del disco; borra también `place_stats`).
  - El objeto `place` (vía `rowToPlace`) expone camelCase: `{ id, slug, ownerType, ownerId, section, category, name, description, localities[], address, homeService, whatsapp, phone, instagram, website, hours, photos[] (URLs /media), photoFiles[], status, rejectReason, featured (bool vigente), featuredUntil, imported, claimed (bool), consentBy, consentAt, createdAt, updatedAt, approvedAt }`.

- [ ] **Step 1: Write the failing tests** (`tools/test-places-store.js`, `Store` sobre una carpeta temporal como `tools/test-store-flyers.js`)

```js
const p = s.insertPlace({ section: 'comida', category: 'Pizzería', name: 'Pizzería Uco', description: 'Pizzas a la piedra todos los días.', localities: ['Tunuyán'], whatsapp: '2622 555123', status: 'approved', ownerType: 'company', ownerId: 'c1' });
check('slug legible y único', p.slug === 'pizzeria-uco' && s.insertPlace({ ...p, id: undefined, slug: undefined }).slug === 'pizzeria-uco-2');
check('búsqueda por sección y localidad', s.searchPlaces({ section: 'comida', locality: 'Tunuyán' }).total === 2);
check('pendiente no aparece', (s.insertPlace({ ...base, status: 'pending' }), s.searchPlaces({ q: 'pendiente' }).total === 0));
s.setPlaceFeatured(p2.id, Date.now() + 86400000);
check('destacada vigente primero', s.searchPlaces({ section: 'comida' }).places[0].id === p2.id);
s.setPlaceFeatured(p2.id, Date.now() - 1);
check('destacada vencida no va primero', !s.place(p2.id).featured);
s.bumpPlaceStat(p.id, 'views'); s.bumpPlaceStat(p.id, 'whatsapp'); s.bumpPlaceStat(p.id, 'calls');
check('estadísticas de la semana', s.placeStats(p.id).week.views === 1 && s.placeStats(p.id).week.contacts === 2);
check('reclamo atómico', !!s.claimPlace(u.id, 'candidate', 'u1') && s.claimPlace(u.id, 'candidate', 'u2') === null);
check('bloqueo de la guía no bloquea importados', (s.addPlaceBlock('2622555123', 'pizzeria uco', 'x'), s.placeBlocked('2622555123', '') && !s.blocked('2622555123', '')));
check('borrar devuelve las fotos', s.deletePlace(withPhotos.id).length === 2 && !s.place(withPhotos.id));
```

- [ ] **Step 2: Run** `node tools/test-places-store.js` — Expected: FAIL (`s.insertPlace is not a function`).
- [ ] **Step 3: Implement** las tablas y métodos de arriba. `slug` con `slugify` existente + sufijo `-2`, `-3`… si se repite. `featured` vigente = `featured_until === 0 || featured_until > now()`.
- [ ] **Step 4: Run** `node tools/test-places-store.js` y `node tools/test-store-flyers.js` — Expected: ambos `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Guía: fichas, estadísticas, reclamo y bloqueo en la base"`.

---

### Task 3: API de la guía (`server.js`)

**Files:**
- Modify: `server.js` (sección `/* ---------- guía del valle ---------- */` en `handleApi`, antes de la sección de empresa; `rowToPlace` → `publicPlace(place, { owner = false })`)
- Test: `tools/test-guia.js` (servidor temporal con `WORKUCO_DEMO=1`, `WORKUCO_MAIL_FAKE=1`)

**Interfaces:**
- Consumes: Task 1 (`validatePlace`, `openStatus`, `waLink`, `normInstagram`, `SECTIONS`), Task 2 (todos los métodos).
- Produces (JSON):
  - `GET /api/places?section&category&locality&q&open=1&page&limit` → `{ places: PlaceSummary[], total, pages, sections }` con `PlaceSummary = { id, slug, name, section, category, localities, cover, featured, claimed, status: openStatus }` (con `open=1` se filtra por `state in ('open','always')` después de buscar).
  - `GET /api/places/:slug` → `{ place: PlaceDetail, canEdit }` (detalle incluye contacto, `waUrl`, `mapsUrl` = `https://www.google.com/maps/search/?api=1&query=` + dirección y localidad); 404 si no está aprobada salvo para su dueño o el admin; suma `views`.
  - `POST /api/places/:id/contact { kind: 'whatsapp'|'calls'|'maps' }` → 204; cuenta una vez por IP+ficha+tipo cada 6 h (Map en memoria).
  - `GET /api/my/places` → `{ places: (PlaceDetail & { stats })[], max: 5 }` (persona o empresa).
  - `POST /api/my/places` (campos de `validatePlace` + `photos: dataUrl[]`) → 201 `pending`; 400 con más de 5 fichas o 6 fotos.
  - `PUT /api/my/places/:id` (+ `keepPhotos: url[]`, `photos: dataUrl[]`) → si cambia `name`, `section` o `category`, vuelve a `pending`; si no, conserva el estado y actualiza `updated_at`.
  - `DELETE /api/my/places/:id` → 200 (borra fotos con `removeUpload`).
  - `GET /api/admin/places?status=pending|approved|hidden|rejected|recent|unclaimed` → `{ places }` (con `claimUrl` y `waUrl` de reclamo para las sin reclamar).
  - `POST /api/admin/places` → 201 `approved`, sin dueño, con `claim_token` (24 bytes hex); exige `consent === true` si `section === 'oficios'` (guarda `consent_by` = email del admin y `consent_at`); 409 si `placeBlocked`.
  - `PATCH /api/admin/places/:id { status?, reason?, featuredDays? }` (`featuredDays`: número de días, `0` = sin vencimiento, `null` = quitar) → notifica al dueño con `kind: 'guia'`.
  - `DELETE /api/admin/places/:id`.
  - `GET /api/claim-place/:token` → `{ place }`; `POST /api/claim-place/:token/accept` → con sesión de persona o empresa la suma; sin sesión crea la cuenta con `{ role, name, email, phone, password, acceptTerms }` (mismas validaciones que `/api/auth/register`) y abre sesión; 409 si la cuenta ya tiene 5; `POST /api/claim-place/:token/delete` → borra, agrega al bloqueo de la guía, 200. Mismo `throttled`/`loginFailed` que `/api/claim`.

- [ ] **Step 1: Write the failing tests** (`tools/test-guia.js`, mismo harness que `tools/test-legal.js`). Casos con sus asserts:
  - persona crea ficha → 201 y `status === 'pending'`; no aparece en `GET /api/places`; admin aprueba → aparece; al dueño le llega notificación `guia`.
  - sexta ficha → 400; séptima foto → 400.
  - editar horario de una aprobada → sigue `approved` y figura en `?status=recent`; editar el nombre → `pending`.
  - `GET /api/places?section=comida&locality=Tunuyán&open=1` filtra bien (fixtures con horario 24h y con horario cerrado).
  - `POST /api/places/:id/contact` dos veces seguidas → `stats.week.contacts === 1`.
  - admin crea Oficio sin `consent` → 400 con `fields.consent`; con `consent: true` → 201 y `consentBy === 'admin@workuco.com.ar'`.
  - reclamo sin sesión creando cuenta de persona → 200 y `GET /api/my/places` la incluye; el token no sirve dos veces (404).
  - **Review Focus 4:** reclamo con una cuenta que ya tiene 5 → 409 `"Ya tenés 5 fichas…"` y la ficha sigue `claimed === false`.
  - borrar desde el link → 200, la ficha da 404 y volver a crearla desde el admin con el mismo teléfono → 409.
  - XSS: nombre `<img src=x onerror=alert(1)>` se guarda tal cual y la API lo devuelve como texto (el escape es del cliente; el test verifica que el detalle HTML de Task 4 no lo contenga sin escapar).
- [ ] **Step 2: Run** `node tools/test-guia.js` — Expected: FAIL (404 en `/api/places`).
- [ ] **Step 3: Implement** las rutas. Las fotos se guardan con `saveImage(dataUrl, 'place')`, máximo 6, igual que los flyers (`keepPhotos` sólo acepta URLs de esa ficha). `kind: 'guia'` se suma a las notificaciones.
- [ ] **Step 4: Run** `node tools/test-guia.js` y `npm test` — Expected: todo `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Guía: API pública, de dueños, de admin y reclamo"`.

---

### Task 4: Páginas públicas, portada, menú y Google

**Files:**
- Create: `public/guia.html` (`data-page="guide"`), `public/ficha.html` (`data-page="place"`), `public/reclamar-ficha.html` (`data-page="claim-place"`, `noindex`), `public/guia.js`
- Modify: `server.js` (rutas `/guia`, `/guia/:slug` con 404 propio, `/reclamar-ficha/:token`; `NAV_ITEMS`: `['/guia', 'Guía']` en lugar de `['/empresas', 'Empresas']`, que pasa al pie; `sitemap.xml` suma fichas aprobadas y reclamadas), `lib/seo.js` (`placeMeta(place, origin, { noindex })`, `localBusinessLd(place, origin)`), `public/index.html` (banda "Guía del Valle" después de "Changas"), `public/app.js` (router: `guide`, `place`, `claim-place` → `WKGuia.*`), `public/valle.css` (sección `GUÍA`), páginas que cargan scripts (`<script src="/guia.js"></script>` después de `app.js` en `guia.html`, `ficha.html`, `reclamar-ficha.html`, `index.html`, `mi-perfil.html`, `panel.html`, `admin.html`)
- Test: `tools/test-guia.js` (casos HTML), `tools/test-ui-guia.mjs`

**Interfaces:**
- Consumes: Task 3 API.
- Produces: `window.WKGuia = { initGuia(), initPlace(), initClaimPlace(), placeCard(summary) -> html, statusBadge(status) -> html }`.
- `localBusinessLd` usa `@type` `LocalBusiness` (o `Restaurant` para comida, `HomeAndConstructionBusiness` para oficios), `address` con `addressLocality`/`addressRegion: 'Mendoza'`/`addressCountry: 'AR'`, `openingHoursSpecification` desde `hours`, `telephone`, `image`; sólo en fichas aprobadas y reclamadas (o cargadas por su dueño) fuera de modo demo.

- [ ] **Step 1: Write the failing tests** (sumar a `tools/test-guia.js`):
  - `GET /guia` 200 y el menú tiene `href="/guia"` y no `href="/empresas"` en `.main-nav`; el pie sigue teniendo `/empresas`.
  - `GET /guia/<slug>` de una reclamada aprobada: `<title>` con nombre, `og:image` absoluta con la primera foto, `ld+json` con `"@type":"Restaurant"`, sin `noindex`.
  - ficha cargada por el admin sin reclamar: `noindex`, sin `ld+json`, y `sitemap.xml` no la lista; reclamada → la lista.
  - `GET /guia/no-existe` → 404 con la página propia.
  - el nombre con `<img onerror>` no aparece sin escapar en el HTML de `/guia/:slug`.
- [ ] **Step 2: Run** `node tools/test-guia.js` — Expected: FAIL en los casos nuevos.
- [ ] **Step 3: Implement** páginas y `public/guia.js`:
  - `/guia`: pestañas de sección (Oficios · Servicios · Salidas · Comida, con "Todo" primero), un botón de lugar (mismo patrón que `#feed-place` del modo flyers), buscador, casilla "Abierto ahora", chips de rubro de la sección elegida, grilla de `placeCard` con paginación "Ver más". Estado en la URL (`?seccion=comida&rubro=Pizzería&lugar=Tunuyán&abierto=1`).
  - `placeCard`: foto (`flyerFrame` si hay; si no, el fondo de cordillera de `genFlyer` con la inicial), etiqueta "Destacado" si corresponde, nombre, rubro · localidades, estado (`● Abierto · cierra 21:00`, `○ Cerrado · abre 17:00`, `24 horas`, `Con turno`), botón WhatsApp (registra `contact` antes de abrir `wa.me`).
  - `/guia/:slug`: carrusel de fotos (`setupFlyerRail`), datos, horario de la semana con el día de hoy marcado, botones WhatsApp / Llamar (`tel:`) / Cómo llegar / Instagram / Sitio, "A domicilio" si corresponde, leyenda de ficha sin reclamar con link a `/reclamar-ficha/…` sólo para el admin, y botón "Compartir".
  - `/reclamar-ficha/:token`: muestra la ficha, "Es mía" (con sesión: sumar; sin sesión: elegir persona o empresa y crear cuenta, con la casilla de términos y edad) y "Borrala".
  - Portada: banda "Guía del Valle" con las cuatro secciones (ícono, nombre, cantidad) y las 4 fichas destacadas o más recientes.
- [ ] **Step 4: Run** `node tools/test-guia.js`, `node tools/test-seo.js` y la prueba de interfaz nueva `WK_BASE=http://localhost:4260 node tools/test-ui-guia.mjs` (sin desbordes a 320/390/1440, pestañas y filtros cambian la URL y la grilla, "Abierto ahora" filtra, el botón WhatsApp abre `wa.me` y suma un contacto) — Expected: `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Guía: páginas, portada, menú, vista previa y Google"`.

---

### Task 5: Editores de fichas (persona, empresa, admin)

**Files:**
- Modify: `public/guia.js` (`placeEditor`, `initMyPlaces`, `initAdminPlaces`), `public/mi-perfil.html` (pestaña "Mis servicios" con `data-tab="services"`), `public/panel.html` (ítem "Guía" con `data-tab="guide"`), `public/admin.html` (pestaña "Guía"), `public/panel.js` (`TAB_ALIAS`: `servicios` → `services`, `guia` → `guide`; inicializa las pestañas nuevas llamando a `WKGuia`)
- Test: `tools/test-ui-guia.mjs`

**Interfaces:**
- Consumes: Task 3 API, Task 4 `placeCard`.
- Produces: `WKGuia.placeEditor(root, { mode: 'owner'|'admin', place = null, onSaved })`, `WKGuia.initMyPlaces(root)`, `WKGuia.initAdminPlaces(root)`.

- [ ] **Step 1: Write the failing UI checks** (`tools/test-ui-guia.mjs`): persona crea una ficha desde "Mis servicios" con 2 fotos y horario → queda "En revisión"; admin la aprueba en "Guía" → la persona la ve "Publicada" con sus estadísticas; admin carga un Oficio sin tildar la autorización → el botón muestra el error del campo; empresa crea su ficha desde el panel; el editor no desborda a 390 px.
- [ ] **Step 2: Run** la prueba — Expected: FAIL.
- [ ] **Step 3: Implement** el editor: sección → rubros dependientes, localidades (chips múltiples), dirección, "Va a domicilio" (sólo oficios), descripción con contador, WhatsApp, teléfono, Instagram, sitio, horario (modo Horario / 24 horas / Con turno; por día uno o dos tramos con "copiar a todos los días hábiles"), fotos (hasta 6, `shrinkImage`, quitar y reordenar con el primero como portada). En modo admin, además la casilla "La persona me autorizó a publicarla" (obligatoria si es Oficios), y en la lista de admin: pestañas Pendientes / Cambios recientes / Publicadas / Sin reclamar / Ocultas, con Aprobar, Rechazar (motivo), Ocultar, Destacar (7, 30 días o sin vencimiento; Quitar), Copiar link de reclamo y botón de WhatsApp con el mensaje armado (mismo texto que en importados, adaptado a la guía). "Mis servicios": lista de fichas con estado, motivo de rechazo, "Esta semana: N vistas · N contactos" y "Este mes", Editar, Ver, Borrar, y "Sumar otra ficha" hasta 5.
- [ ] **Step 4: Run** la prueba de interfaz y `npm test` — Expected: `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Guía: editores de fichas para personas, empresas y admin"`.

---

### Task 6: Preferencias de la cuenta

**Files:**
- Modify: `lib/store.js` (columnas `candidates.pref_localities`, `pref_types`, `pref_modalities` (JSON), `pref_gigs` INTEGER DEFAULT 1, y `mail_prefs` JSON en `candidates` y `companies`; `searchJobs` acepta `locality` como string o array), `lib/match.js` (`matchScore` acepta `candidate.localities: string[]`), `server.js` (`/api/account/prefs`, `publicCandidate`/`publicCompany` privados, `matchFor`, `/api/candidate/recommended`, `/api/jobs` con `locality=a,b`, `mailNotice`), `public/mi-perfil.html` + `public/panel.js` (pestaña "Preferencias" con `data-tab="prefs"`), `public/app.js` (`accountDataHtml` sin el interruptor único; `initSearch` e `initFlyers` usan las localidades de interés como filtro por defecto con un chip "Tus localidades ✕")
- Test: `tools/test-prefs.js`, `tools/test-match.js` (casos nuevos)

**Interfaces:**
- Produces:
  - `PATCH /api/account/prefs { localities?, types?, modalities?, gigs?, mail? }` → `{ ok, prefs }`; `mail` es `{ [tipo]: bool }` con tipos de persona `postulaciones`, `invitaciones`, `alertas`, `guia` y de empresa `postulantes`, `avisos`, `guia`. Sigue aceptando `{ mailNotices: false }` (apaga todos).
  - privado: `candidate.prefs = { localities, types, modalities, gigs, mail }`, `company.prefs = { mail }`.
  - `MAIL_KIND = { candidate: { etapa: 'postulaciones', invitacion: 'invitaciones', alerta: 'alertas', guia: 'guia' }, company: { postulacion: 'postulantes', oferta: 'avisos', guia: 'guia' } }`; `mailNotice` no manda si `prefs.mail[tipo] === false` o `mail_opt_out`.

- [ ] **Step 1: Write the failing tests:**
  - `tools/test-match.js`: candidata de San Carlos con `localities: ['Tunuyán']` suma los puntos de localidad para un aviso en Tunuyán.
  - `tools/test-prefs.js`: guardar y leer preferencias; tipos inválidos se descartan; `GET /api/jobs?locality=San Carlos,Tunuyán` devuelve avisos de las dos y ninguno de Tupungato; "Para vos" con `types: ['Medio tiempo']` no incluye avisos de tiempo completo y con `types: []` sí; `gigs: false` saca changas de "Para vos"; con `mail.postulaciones = false` un cambio de etapa no genera mail (outbox) pero sí la notificación; empresa con `mail.postulantes = false` no recibe el mail de postulación pero sí el de "aviso publicado"; `{ mailNotices: false }` apaga todo.
- [ ] **Step 2: Run** `node tools/test-prefs.js` y `node tools/test-match.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** Pestaña "Preferencias": "Dónde querés trabajar" (chips de localidades), "Jornada" y "Modalidad" (chips), "Changas" (interruptor), "Qué avisos querés recibir por mail" (casillas por tipo; la campanita recibe todo). Guardado automático al cambiar, con toast. Revisar que todas las pestañas de `/mi-perfil` carguen y guarden sin errores en 390 px.
- [ ] **Step 4: Run** `npm test` y `tools/test-ui-v4.mjs` — Expected: `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Preferencias de la cuenta: localidades, jornada, modalidad, changas y avisos por tipo"`.

---

### Task 7: Legal, baja, descarga y documentación

**Files:**
- Modify: `lib/store.js` (`deleteCandidateCascade` y la baja de empresa borran sus fichas y devuelven sus fotos; `companyFiles` incluye fotos de fichas), `server.js` (`/api/account/export` suma `fichas`), `public/app.js` (`INFO.privacidad`, `INFO.terminos`, `INFO.faq`, `INFO.baja`: la guía, qué se publica, fichas cargadas por WorkUco con datos públicos y cómo reclamarlas o borrarlas, Oficios sólo con autorización, destacados como publicidad identificada), `LEEME.md` (sección "Guía del Valle", tabla de páginas y API, preferencias, pruebas), `package.json` (`npm test` suma `test-places-lib.js`, `test-places-store.js`, `test-guia.js`, `test-prefs.js`)
- Test: `tools/test-legal.js` (casos nuevos)

- [ ] **Step 1: Write the failing tests** (`tools/test-legal.js`): **Review Focus 5:** persona con una ficha aprobada y 2 fotos se da de baja → la ficha no existe, `/guia/<slug>` da 404 y las fotos no están en `uploads`; la descarga de datos incluye `fichas`; la política de privacidad (`GET /privacidad` + `INFO`) menciona "Guía del Valle" y "datos públicos".
- [ ] **Step 2: Run** `node tools/test-legal.js` — Expected: FAIL en los casos nuevos.
- [ ] **Step 3: Implement** lo de arriba.
- [ ] **Step 4: Run** `npm test` — Expected: todos los scripts `0 fail`.
- [ ] **Step 5: Commit** `git commit -m "Guía: baja, descarga de datos, textos legales y LEEME"`.

---

### Task 8: Verificación final y revisión

- [ ] **Step 1:** Servidor de demo nuevo (`preview_start workuco-v3`), correr `tools/test-ui-v4.mjs` y `tools/test-ui-guia.mjs`; capturas a 390 y 1440 de `/`, `/guia`, una ficha, "Mis servicios", "Preferencias" y la pestaña Guía del admin; revisar armonía visual con `DESIGN.md`.
- [ ] **Step 2:** Revisión de Codex (`codex exec -s read-only -c 'windows.sandbox="unelevated"'`) sobre `git diff` de la rama desde el commit del spec; aplicar sólo lo verificado.
- [ ] **Step 3:** `npm test` completo — Expected: todo `0 fail`.
- [ ] **Step 4: Commit** de las correcciones de la revisión.
