# Avisos importados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin cargue avisos de canales de WhatsApp (texto o imágenes, con IA o a mano), los publique a nombre de fichas "sin reclamar" y le mande a cada empresa un link privado para reclamarlos o borrarlos.

**Architecture:** Lógica pura de parseo en `lib/importer.js`; `lib/ai.js` gana soporte de imágenes; `lib/store.js` gana columnas, lista de bloqueo y operaciones de reclamo; `server.js` suma rutas `/api/admin/import*`, `/api/claim/*` y la página `/reclamar/:token`; el admin gana la pestaña "Importar".

**Tech Stack:** Node 24 (`node:sqlite`, `fetch`), HTML/CSS/JS sin build.

**Spec:** `docs/superpowers/specs/2026-11-11-avisos-importados-design.md`

## Global Constraints

- Sin dependencias npm ni build. `npm test` sigue en verde (hoy 13 + 82 + 94).
- Config de IA del admin sólo por entorno: `WORKUCO_IMPORT_AI_PROVIDER`, `WORKUCO_IMPORT_AI_KEY`, `WORKUCO_IMPORT_AI_MODEL`, `WORKUCO_IMPORT_AI_BASE`; prueba con `WORKUCO_IMPORT_AI_FAKE=1`. Contacto público de Workuco: `WORKUCO_CONTACT_WA`.
- Lote máximo: 6 imágenes de 4 MB y 20.000 caracteres.
- Importados vencen a hoy (AR) + 30 días, salvo fecha anterior en el borrador.
- El código de reclamo (48 hex) y `source_text` nunca salen en HTML público ni en `/api/jobs`, `/api/jobs/:id`, `/api/companies*`.
- Fichas sin reclamar: `email sin-reclamar+<id>@import.workuco`, `password '!'`, `claimed=0`, no cuentan para `responseStats`.
- Textos en español rioplatense; todo texto de usuario se escapa al renderizar.

## Review Focus

1. Aviso pegado con teléfono en formatos distintos (`+54 9 2622 15-555123`, `2622-555123`, `02622 555123`): el mismo número normaliza igual y reusa la ficha / dispara la lista de bloqueo. → Task 1 y Task 3.
2. Código de reclamo filtrado por error en una respuesta pública. → Task 4 (prueba que busca el token en `/api/jobs?limit=30`, `/api/jobs/:id`, `/api/companies/:id` y en el HTML de `/empresa/:id`).
3. Empresa que borra su aviso y otra persona del admin lo vuelve a importar: 409 `blocked`. → Task 4.
4. Reclamar dos veces el mismo link o con un email ya registrado: 404 / 409, sin dejar la ficha a medio cambiar. → Task 4.
5. IA que devuelve basura (texto no JSON, campos inventados fuera de listas, 0 avisos): 502 o borradores con advertencias, nunca una oferta publicada sola. → Task 1 y Task 3.

---

### Task 1: Parseo puro (`lib/importer.js`)

**Files:** Create `lib/importer.js`, `tools/test-importer.js`. Modify `package.json` (`test` agrega `node tools/test-importer.js`).

**Interfaces — Produces:**
- `normPhone(s) -> string` (sólo dígitos; quita `54`, `9`, `0` de prefijo y el `15` móvil después de la característica de 4 dígitos; devuelve los últimos 10; `''` si quedan < 8).
- `normName(s) -> string` (minúsculas, sin acentos, espacios simples, sin `s.a.`/`srl`).
- `buildImportPrompt(meta) -> { system, user }` (`meta` = `/api/meta`: localities, categories, types, modalities).
- `normalizeDrafts(raw, meta, sourceText = '') -> { drafts: Draft[], warnings: string[] }`, `Draft` = campos del spec §2 + `warnings: string[]`.

- [ ] **Step 1:** Tests en `tools/test-importer.js` (`node:assert`):
  - `normPhone('+54 9 2622 15-555123') === normPhone('2622-555123') === normPhone('02622 555123') === '2622555123'`; `normPhone('123') === ''`.
  - `normName('Bodega Alto Uco S.A.') === normName('bodega  alto uco') === 'bodega alto uco'`.
  - `buildImportPrompt(meta).system` incluye "Tunuyán", "Gastronomía", "Tiempo completo" y "no inventes".
  - `normalizeDrafts({ avisos: [a, b] }, meta)` devuelve 2 borradores.
  - Localidad "tunuyan" → "Tunuyán"; localidad "Mendoza" → `''` y advertencia "Sin localidad".
  - Categoría desconocida → "Otros"; tipo vacío → "Tiempo completo"; modalidad vacía → "Presencial".
  - `salaryMin: '900.000'` → 900000; `salaryPeriod: 'diario'` → "día"; `salaryMax < salaryMin` → `salaryMax: 0`.
  - Sin teléfono ni email → advertencia "Sin contacto".
  - `description` de menos de 60 caracteres con `sourceText` → usa `sourceText` recortado a 8000 y advertencia "Descripción tomada del texto original".
  - `normalizeDrafts('basura', meta)` → `{ drafts: [] }` con advertencia "La IA no encontró avisos".
- [ ] **Step 2:** `node tools/test-importer.js` → falla (módulo inexistente).
- [ ] **Step 3:** Implementar `lib/importer.js`.
- [ ] **Step 4:** Pasa. Commit `Importador: parseo y normalización de avisos`.

### Task 2: Imágenes en `lib/ai.js`

**Files:** Modify `lib/ai.js`, `tools/test-ai.js`.

**Interfaces — Produces:** `callProvider(cfg, { system, user, images = [], maxTokens })` donde `images: [{ mime, base64 }]`; `importConfig(env) -> cfg | null` (lee las variables del admin; `null` sin proveedor o key); `parseJson` exportado.

- [ ] **Step 1:** En `tools/test-ai.js`, con `fetch` reemplazado por un stub que captura el body: Gemini manda `parts` con `inline_data { mime_type, data }`; OpenAI manda `content` como arreglo con `{ type: 'image_url', image_url: { url: 'data:image/png;base64,…' } }`; Anthropic manda `{ type: 'image', source: { type: 'base64', media_type, data } }`; sin `images` el body es igual al de hoy. `importConfig({})` → `null`; `importConfig({ WORKUCO_IMPORT_AI_PROVIDER: 'gemini', WORKUCO_IMPORT_AI_KEY: 'k' })` → modelo por defecto `gemini-2.5-flash`.
- [ ] **Step 2:** Falla. **Step 3:** Implementar. **Step 4:** `node tools/test-ai.js` pasa. Commit `IA: soporte de imágenes y config del importador`.

### Task 3: Datos y API de importación (admin)

**Files:** Modify `lib/store.js`, `server.js`. Create `tools/test-v4.js` (mismo arnés que `test-v3.js`, puerto 4597, `WORKUCO_IMPORT_AI_FAKE=1`).

**Interfaces — Produces (store):** columnas y tabla del spec §1; `blocked(phoneNorm, nameNorm) -> boolean`; `addBlock(kind, value)`; `findUnclaimed({ phoneNorm, nameNorm }) -> companyRow | null`; `createUnclaimed({ name, phone, locality }) -> companyRow` (token con `crypto.randomBytes(24)`); `importedDuplicate(phoneNorm, title) -> jobRow | null` (importado vigente con mismo teléfono normalizado y `normName(title)` igual); `importedOverview() -> [{ company, jobs, applications }]`; `companyByClaimToken(token)`; `claimCompany(id, { email, password, name })`; `deleteCompanyCascade(id) -> { candidateIds }`. `rowToJob` agrega `sourceKind`, `sourceName` (nunca `source_text`). `publicCompany` agrega `claimed`.
**Interfaces — Produces (API):** rutas del spec §3 marcadas admin. Con `WORKUCO_IMPORT_AI_FAKE=1`, `parse` no llama a la red y usa `normalizeDrafts` sobre un JSON fijo de 2 avisos de Tunuyán (uno con teléfono `2622 15-555123`).

- [ ] **Step 1: Tests en `tools/test-v4.js`:**
  - Sin sesión admin: `GET /api/admin/import/config`, `POST …/parse`, `POST …/publish` → 401.
  - `config` con IA falsa → `{ aiReady: true }` y el JSON no contiene `key`.
  - `parse` con `{ text: '…' }` → 2 borradores; con texto de 20.001 caracteres → 413; con 7 imágenes → 400.
  - `publish` del borrador 1 → 201; el aviso está `approved`, `sourceKind: 'importado'`, `closesAt` = hoy AR + 30; la empresa tiene `claimed: false`.
  - `publish` de otro título con el mismo teléfono en otro formato → misma `company.id`.
  - `publish` repetido del borrador 1 → 409 `{ code: 'duplicate' }`; con `force: true` → 201.
  - Borrador sin título válido → 400 con `fields.title`.
  - Borrador con `closesAt` anterior a +30 → se respeta.
  - `GET /api/admin/import` lista la ficha con `claimUrl` (`/reclamar/` + 48 hex), `waUrl` (`https://wa.me/549…?text=` que incluye el título y el `claimUrl`) y `notify_status: 'sin_avisar'`; `POST …/companies/:id/notified` → `avisado`.
  - `responseStats` de una ficha sin reclamar con 3 postulaciones viejas → `null`.
  - Fichas sin reclamar no pueden iniciar sesión con contraseña `!`.
- [ ] **Step 2:** `node tools/test-v4.js` → fallan. **Step 3:** Implementar. **Step 4:** Pasan; `npm test` verde. Commit `Importación: fichas sin reclamar y API del admin`.

### Task 4: Reclamo y borrado (público)

**Files:** Modify `lib/store.js`, `server.js` (rutas `/api/claim/*`, página `/reclamar/:token`), `tools/test-v4.js`.

- [ ] **Step 1: Tests:**
  - Ningún código de reclamo aparece en `/api/jobs?limit=30`, `/api/jobs/:id`, `/api/companies`, `/api/companies/:id` ni en el HTML de `/empresa/:id` y `/oferta/:id`; tampoco `sourceText`.
  - Persona postula al importado → 201; el detalle trae `sourceName`.
  - `GET /api/claim/<token>` → empresa, avisos y `applicationsCount: 1`, sin nombres de postulantes; token inventado → 404.
  - `accept` con email de una cuenta existente → 409 y la ficha sigue `claimed: false`.
  - `accept` válido → 200, cookie de empresa; `/api/company/dashboard` ve la postulación; la persona recibe notificación "…ya administra su aviso…".
  - Mismo token otra vez → 404.
  - Otra ficha: `delete` → 200; sus avisos ya no están en `/api/jobs`; la persona postulada recibe "…fue retirado por la empresa"; volver a publicar un borrador con ese teléfono → 409 `{ code: 'blocked' }`; con otro teléfono pero el mismo nombre → 409 `blocked`.
  - 9 intentos de `GET /api/claim/<inventado>` → el 9.º 429.
  - `GET /reclamar/<token>` → HTML 200 sin `{{`.
- [ ] **Step 2:** Fallan. **Step 3:** Implementar (las notificaciones con `tryNotify`; el borrado en `store.tx`). **Step 4:** Pasan. Commit `Reclamo y borrado de fichas importadas`.

### Task 5: Pantallas

**Files:** Modify `public/admin.html`, `public/panel.js` (`initAdmin`), `public/app.js` (`jobCard`, `jobRow`, `initJob`, `initCompanyPage`, nuevo `initClaim`), `public/valle.css`. Create `public/reclamar.html`.

- [ ] **Step 1: Admin → "Importar"** (spec §4): nombre del canal guardado en `localStorage` (`wk_import_source`, con try/catch), texto, hasta 6 imágenes achicadas con `shrinkImage(file, 1600, 0.85)`, "Leer avisos", borradores editables con advertencias y "Publicar"/"Descartar", 409 `duplicate` → "Publicar igual", 409 `blocked` → mensaje "Esta empresa pidió no aparecer en Workuco". Sin IA → formulario manual. Tabla de importados con estado y botones "Avisar por WhatsApp" (abre `waUrl` en pestaña nueva y llama a `…/notified`), "Copiar link", "Borrar".
- [ ] **Step 2: Público:** etiqueta "Tomado de <canal>" en tarjeta y detalle; en el detalle, bloque "¿Es tu empresa? Escribinos" con `wa.me/<WORKUCO_CONTACT_WA>` (servido en `/api/meta.contactWa`; si falta, `/contacto`); ficha de empresa sin reclamar con el aviso del spec.
- [ ] **Step 3: `/reclamar/:token`:** ficha + avisos como se ven, "N personas ya se postularon", acciones Es mío / Corregir datos (→ `/panel#ofertas` después de reclamar) / Borralo (confirmación). Estados: cargando, token inválido, error de email repetido, éxito.
- [ ] **Step 4: Verificar** con el servidor de vista previa (`WORKUCO_IMPORT_AI_FAKE=1`): flujo completo en 1440 y 390 sin desbordes ni errores de consola; capturas del admin, del aviso importado y de `/reclamar`. Agregar a `tools/test-ui-v3.mjs` (o un `test-ui-v4.mjs`) el recorrido pegar → publicar → reclamar → borrar otro.
- [ ] **Step 5:** Commit `Pantallas de importación y reclamo`.

### Task 6: Cierre

- [ ] **Step 1:** `npm test` verde y prueba de interfaz verde.
- [ ] **Step 2:** Revisión independiente con Codex (skill `codex-review`) sobre `main..v4-importados`; corregir lo importante con prueba primero.
- [ ] **Step 3:** LEEME: sección "Avisos importados" (cómo configurar la IA del admin, `WORKUCO_CONTACT_WA`, flujo de reclamo, lista de no importar).
- [ ] **Step 4:** Commit `v4: documentación y cierre`.
