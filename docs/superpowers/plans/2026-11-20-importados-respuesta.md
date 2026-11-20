# Avisos importados: respuesta de la empresa · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (elegido: el dueño pidió seguir directo).

**Goal:** Motivo obligatorio al borrar, registro de aceptadas/rechazadas, aviso al dueño y panel Importar con filtros y botones rápidos.
**Architecture:** Tabla `import_responses` en el store; `/api/claim/:t/accept|delete` la escriben y avisan por mail; `GET /api/admin/import` devuelve también las respuestas; bandeja del admin suma "Respuestas de empresas".
**Tech Stack:** Node 24 sin dependencias, node:sqlite, JS sin frameworks.
**Spec:** `docs/superpowers/specs/2026-11-20-importados-respuesta-design.md`

## Global Constraints
- `server.js` y `public/valle.css` en CRLF; columnas/tablas nuevas con `CREATE TABLE IF NOT EXISTS`; no tocar `data/`.
- Motivos exactos (código → texto): `cubierto` "Ya cubrimos el puesto" · `no_publicar` "No queremos publicar en WorkUco" · `datos_mal` "Los datos están mal" · `otro` "Otro". Comentario opcional, máx. 300.
- Textos en español rioplatense; commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sin push.

## Review Focus
1. Borrar sin motivo o con motivo inventado → 400 y la empresa NO se borra → test Task 2.
2. Comentario con HTML → se guarda texto plano y se muestra escapado en el panel → test Task 2 (escape en panel: revisión).
3. El mismo link usado dos veces (aceptar y después borrar) → 404, una sola respuesta registrada → test Task 2.
4. "Marcar avisado" sobre una empresa ya reclamada → 404 (ya existe en `markNotified`) → test Task 2.
5. La respuesta aparece en la bandeja una sola vez y deja de ser "nueva" al marcar visto → test Task 2.

---

### Task 1: Store — `import_responses`
**Files:** Modify `lib/store.js` (migrate + sección "avisos importados") · Test `tools/test-importados-respuesta.js` (sección Base)
**Produces:**
- `IMPORT_REASONS` (exportado) = `{ cubierto, no_publicar, datos_mal, otro }` → textos de arriba.
- `recordImportResponse({ company, action: 'aceptada'|'rechazada', reason = null, comment = '' }) -> row` (guarda name, phone_norm, notify_status y notified_at de la empresa, títulos de avisos como JSON, cantidad de postulantes, created_at).
- `importResponses({ since = 0 } = {}) -> [{ id, companyId, name, action, reason, reasonLabel, comment, jobs, applications, notified, notifiedAt, createdAt }]` (más nuevas primero).
- `adminInbox()` agrega `importResponses` (las de `created_at > seen`).
- [ ] Test que falla: registrar una aceptada y una rechazada; `importResponses()` devuelve 2 con `reasonLabel` correcto; `adminInbox().importResponses.length === 2`; tras `setAdminMeta('inbox_seen_at', now)` → 0.
- [ ] Implementar · [ ] verde · [ ] commit.

### Task 2: API
**Files:** Modify `server.js` (`/api/claim/*`, `/api/admin/import*`, `/api/admin/inbox`) · Test misma suite (sección API, servidor con `WORKUCO_IMPORT_AI_FAKE=1`, `WORKUCO_MAIL_FAKE=1`)
**Produces:**
- `POST /api/claim/:t/delete { reason, comment }`: `reason` ∉ IMPORT_REASONS → 400 `{ fields: { reason } }` sin borrar; ok → registra 'rechazada' antes del borrado en cascada, mail al admin.
- `POST /api/claim/:t/accept`: tras reclamar, registra 'aceptada' y mail al admin.
- `GET /api/claim/:t` agrega `reasons: [{ id, label }]`.
- `GET /api/admin/import` agrega `responses: importResponses()`; cada empresa trae `claimedAt` (de su respuesta aceptada, si hay).
- `GET /api/admin/inbox` agrega `importResponses`.
- Tests: Review Focus 1, 3, 4, 5; borrar con `otro` + comentario → la respuesta queda con motivo y comentario, la empresa ya no existe; aceptar → respuesta 'aceptada'; outbox de mail del admin con 2 mails ("aceptó"/"borró").
- [ ] falla · [ ] implementar · [ ] verde · [ ] commit.

### Task 3: Pantallas + cierre
**Files:** `public/app.js` (`initClaim`: el panel de borrar pide motivo con 4 botones rápidos + comentario), `public/panel.js` (Importar: filtros Para avisar / Avisadas / Aceptadas / Rechazadas, botones Copiar link / WhatsApp / Marcar avisado; bandeja: grupo "Respuestas de empresas"), `public/valle.css`, `package.json` (sumar la suite a `npm test`).
- [ ] Verificar en el navegador con la demo (importar uno a mano, abrir el link, borrar con motivo; ver filtros y bandeja).
- [ ] `npm test` verde · revisión de Codex · commit · sin push.
