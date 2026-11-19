# Pack Cosecha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un pack de 30 días por empresa que destaca hasta 5 avisos de cosecha, sube el tope de invitaciones a 100, marca esos avisos con sello "Cosecha" y suma la página pública `/cosecha`; se paga con Mercado Pago o se pide gratis durante el lanzamiento.

**Architecture:** El estado del pack vive en `companies` (`cosecha_until`, `cosecha_req_at`); `Store.activateCosecha` es la única puerta para activar/extender (la usan el pago aprobado y el admin). El servidor reutiliza el circuito de pagos (`payments.kind='cosecha'`, `settlePayment`) y el de pedidos del lanzamiento, como los destacados. El front suma una tarjeta en el panel, controles en el admin y una página que reutiliza las tarjetas de aviso.

**Tech Stack:** Node 24 sin dependencias, `node:sqlite`, JS del navegador sin framework. Pruebas: scripts `tools/test-*.js` que levantan el servidor con `WORKUCO_DEMO=1`.

**Spec:** `docs/superpowers/specs/2026-11-18-pack-cosecha-design.md`

## Global Constraints

- Duración del pack: **30 días**; avisos del pack: **hasta 5**; invitaciones con pack: **100 por día** (sin pack sigue `INVITE_LIMIT`, 20).
- Elegible = aviso `status='approved'`, sin cerrar (`closes_at` vacío o ≥ hoy), y `category='Agricultura'` **o** `gig=1`.
- Activar nunca acorta un destacado: `featured_until = max(actual, cosecha_until)`; un destacado sin vencimiento (`featured=1, featured_until NULL`) queda igual.
- Venta habilitada = `sell_cosecha='1'` + `price_cosecha>0` + `mp.connected()` + `mp.isPublicHttps(PUBLIC_URL)`.
- Precio validado igual que los otros (`okPrice`: entero, 100 a 10.000.000).
- Textos en español rioplatense; nada de prometer resultados.
- Archivos con LF; no tocar `data/`; commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Pack vencido: `cosecha_until` en el pasado no debe dar tope 100, ni sello, ni contar como activo; el sello sale sólo mientras dure. → prueba en Task 1 y Task 2.
- Empresa sin avisos elegibles que activa el pack: no falla; cuando después aprueban uno elegible, se destaca. → prueba en Task 2.
- Pagar dos veces el mismo pago (webhook repetido): activa una sola vez (no suma 60 días). → prueba en Task 2.
- Empresa A intenta pedir/pagar/ver el pack de B: siempre trabaja sobre su propia empresa (la sesión), nunca por id del cuerpo. → prueba en Task 2.
- Quitar el pack desde el admin: los avisos conservan la fecha de destacado que ya tenían (no se apagan de golpe), y el tope vuelve a 20. → prueba en Task 2.

---

### Task 1: Estado del pack en la base

**Files:**
- Modify: `lib/store.js` (migraciones con `ensureColumn`, métodos nuevos junto a `setJobFeatured`, `rowToJob`, `searchJobs`, `companies`)
- Test: `tools/test-cosecha.js` (nuevo; primera parte, sobre la API en Task 2 — en esta tarea la prueba usa `Store` directo como `tools/test-places-store.js`)

**Interfaces:**
- Produces:
  - `store.cosechaActive(companyId) -> boolean`
  - `store.activateCosecha(companyId, days = 30) -> { until: number, featured: string[] }` (ids destacados en esta llamada)
  - `store.endCosecha(companyId) -> void` (`cosecha_until = now()`; no toca avisos)
  - `store.setCosechaRequest(companyId, on: boolean) -> void`
  - `store.cosechaEligible(companyId) -> job rows` (elegibles, más nuevos primero)
  - `store.cosechaFeaturedCount(companyId) -> number` (elegibles destacados vigentes)
  - `rowToJob` agrega `cosecha: boolean` (empresa con pack activo y aviso elegible); las consultas que alimentan `rowToJob` traen `c.cosecha_until AS company_cosecha_until`.
  - `searchJobs({ ..., cosecha: '1' })` filtra `(j.category='Agricultura' OR j.gig=1)`.
  - `companies()` devuelve también `cosecha_until`, `cosecha_req_at`.

- [ ] **Step 1: Escribir la prueba que falla** (`tools/test-cosecha.js`, sección "— Base —", Store en carpeta temporal):
  - empresa con 7 avisos aprobados elegibles + 1 de "Gastronomía" → `activateCosecha(id)` devuelve `featured.length === 5` y `until ≈ now + 30 días` (±60 s); el de Gastronomía no queda destacado.
  - un elegible ya destacado hasta `now + 60 días` conserva esa fecha; uno con `featured=1, featured_until NULL` sigue sin vencimiento.
  - activar de nuevo con pack vigente: `until` nuevo ≈ `until` anterior + 30 días.
  - `cosechaActive` true; tras `endCosecha` false; con `cosecha_until` en el pasado false.
  - `searchJobs({ cosecha: '1' })` sólo trae Agricultura o changa.
- [ ] **Step 2:** `node tools/test-cosecha.js` → FAIL (métodos inexistentes).
- [ ] **Step 3:** Implementar los métodos de **Interfaces** en `lib/store.js` (columnas por `ensureColumn('companies', 'cosecha_until', 'INTEGER')` y `'cosecha_req_at'`). `activateCosecha` usa `setJobFeatured(id, untilMs)` sólo cuando el aviso no tiene un destacado más largo ni sin vencimiento.
- [ ] **Step 4:** `node tools/test-cosecha.js` → PASS.
- [ ] **Step 5:** Commit `Pack Cosecha: estado del pack en la base`.

### Task 2: API, cobro y admin del lado servidor

**Files:**
- Modify: `server.js` (config junto a `payConfig`, `settlePayment`, rutas de empresa junto a `feature-request`, PATCH admin de empresas y de avisos, `/api/admin/payments` settings, `/api/company/talent` e invitaciones, `/api/jobs`, `/api/meta`)
- Test: `tools/test-cosecha.js` (sección "— API —", servidor con `WORKUCO_DEMO=1`, admin y empresas demo `bodega@demo.workuco` / `cafe@demo.workuco`), y sumarlo a `npm test` en `package.json`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `cosechaConfig() -> { price: number, sell: boolean, enabled: boolean }`
  - `inviteLimit(companyId) -> number` (100 con pack, si no `INVITE_LIMIT`); usado en talent e invitaciones.
  - `GET /api/company/cosecha -> { active, until, requested, eligible, featured, price, payEnabled, launchFree, inviteLimit }`
  - `POST /api/company/cosecha/request` (400 si `payEnabled`) / `DELETE /api/company/cosecha/request`
  - `POST /api/company/cosecha/checkout -> { url, reference }` (400 si venta deshabilitada); `insertPayment({ companyId, jobTitle: 'Pack Cosecha', days: 30, amount: price, kind: 'cosecha' })`; preferencia con `returnPath: '/panel'`.
  - `settlePayment`: rama `row.kind === 'cosecha'` → `activateCosecha(row.company_id, row.days || 30)` + `tryNotify('company', …, { kind: 'oferta', title: 'Tu Pack Cosecha está activo', link: '/panel' })`.
  - `PATCH /api/admin/companies/:id { cosechaDays: 30 | null }` → activa (y avisa) o `endCosecha`.
  - `GET /api/admin/companies` agrega `cosechaUntil`, `cosechaRequestedAt`.
  - `PUT /api/admin/payments` acepta `cosechaPrice` (con `okPrice`) y `sellCosecha`; la respuesta `settings` agrega `cosechaPrice`, `sellCosecha`.
  - Aprobación de aviso (`PATCH /api/admin/jobs/:id` con `status:'approved'`): si la empresa tiene pack activo, el aviso es elegible y `cosechaFeaturedCount < 5`, se destaca hasta `cosecha_until`.
  - `GET /api/jobs?cosecha=1` filtra; cada aviso trae `cosecha`.
  - `/api/meta` agrega `cosecha: { price, payEnabled }`.

- [ ] **Step 1: Pruebas que fallan** (sección "— API —"):
  - sin sesión 401; `GET /api/company/cosecha` de bodega trae `active:false`, `inviteLimit:20`.
  - lanzamiento: `POST …/request` → `requested:true`; el admin lo ve en `/api/admin/companies` (`cosechaRequestedAt > 0`); `DELETE` lo cancela.
  - `checkout` con venta apagada → 400.
  - admin `PATCH /api/admin/companies/:id { cosechaDays: 30 }` → empresa `active:true`, `inviteLimit:100`, sus avisos elegibles salen con `featured:true` y `cosecha:true` en `/api/jobs?cosecha=1`, y ningún aviso de otro rubro aparece en esa lista.
  - `/api/company/talent` de bodega devuelve `invitesLeft` sobre 100.
  - aviso nuevo de Agricultura de bodega aprobado por el admin → destacado con `featuredUntil === cosechaUntil`; con 5 ya destacados, el sexto no.
  - café (otra empresa) sigue `active:false` y su `request` no toca a bodega.
  - admin `{ cosechaDays: null }` → `active:false`, `inviteLimit:20`, los avisos siguen destacados con su fecha.
  - `cosecha_until` puesto en el pasado por SQL → `cosecha:false` en los avisos, `active:false`.
  - `PUT /api/admin/payments { cosechaPrice: 50 }` → 400; `{ cosechaPrice: 90000, sellCosecha: true }` → 200 y `settings.cosechaPrice === 90000`.
  - pago: insertar fila `payments` `kind='cosecha'` y llamar a la lógica de acreditación dos veces con el mismo pago aprobado (usar `store.approvePayment` + `activateCosecha` como hace `settlePayment`, o el modo de pago falso si existe en `test-pagos.js`) → `until` avanza 30 días una sola vez.
- [ ] **Step 2:** `node tools/test-cosecha.js` → FAIL.
- [ ] **Step 3:** Implementar lo de **Interfaces** siguiendo los patrones de `feature-request`, `compCheckout` y `cvSettings`.
- [ ] **Step 4:** `node tools/test-cosecha.js` y `npm test` → PASS.
- [ ] **Step 5:** Commit `Pack Cosecha: API, cobro con Mercado Pago y admin`.

### Task 3: Panel, admin y página `/cosecha` (front)

**Files:**
- Modify: `public/panel.html` + `public/panel.js` (tarjeta en Resumen; tope de invitaciones), `public/admin.html` / `public/admin-tools.js` (precio, interruptor, pedido y botones en Empresas), `public/app.js` (`jobCard` muestra el sello si `job.cosecha`; init de página `cosecha`), `public/styles.css`
- Create: `public/cosecha.html` (`data-page="cosecha"`)
- Modify: `server.js` (ruta `/cosecha` con `renderPage`, título `Cosecha en el Valle de Uco · WorkUco`; `/cosecha` en el mapa del sitio)
- Test: `tools/test-cosecha.js` ("— Páginas —": `/cosecha` 200 con el título; el sitemap la incluye) + revisión en el navegador (panel de bodega, admin, `/cosecha` a 375 px).

**Interfaces:**
- Consumes: rutas de Task 2.
- Produces: `.pack-card` en el panel; `.badge-cosecha` en tarjetas.

- [ ] **Step 1:** Pruebas de páginas que fallan → `node tools/test-cosecha.js` FAIL.
- [ ] **Step 2:** Tarjeta del panel: título "Pack Cosecha", lista de lo que incluye (5 avisos de cosecha destacados 30 días, 100 invitaciones por día, sello "Cosecha", arriba en workuco.com.ar/cosecha), estado (activo hasta fecha / pedido / disponible), botón "Pagar con Mercado Pago · $ precio" si `payEnabled`, si no "Pedir gratis (lanzamiento)" / "Cancelar pedido".
- [ ] **Step 3:** Admin: campo precio + interruptor "Vender Pack Cosecha" en Cobros; en Empresas, marca "Pidió Pack Cosecha" y botón "Activar 30 días" / "Quitar pack" con la fecha vigente.
- [ ] **Step 4:** `/cosecha`: título "Cosecha en el Valle de Uco", bajada, filtro de localidad, lista con `jobCard` desde `/api/jobs?cosecha=1`, vacío amable ("Todavía no hay avisos de cosecha: volvé pronto") y bloque para empresas con link al panel.
- [ ] **Step 5:** `node tools/test-cosecha.js`, `npm test` y revisión en navegador (escritorio y 375 px) → todo bien.
- [ ] **Step 6:** Commit `Pack Cosecha: tarjeta en el panel, admin y página /cosecha`.
