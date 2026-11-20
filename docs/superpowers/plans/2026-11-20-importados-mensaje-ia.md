# Mensaje con IA para avisar a la empresa · Implementation Plan

> Ejecución: superpowers:executing-plans (en esta sesión).

**Goal:** Mensaje personalizado y editable por empresa importada, e importador sin "timeout".
**Spec:** `docs/superpowers/specs/2026-11-20-importados-mensaje-ia-design.md`

## Global Constraints
- `server.js`, `public/*.js`, `public/valle.css` en CRLF. Node 24 sin dependencias. Sin push.
- Tono: respetuoso, profesional y muy amigable; voseo rioplatense; 400–700 caracteres; máx. 1 emoji; sin promesas ni datos inventados; incluye el link exacto.

## Review Focus
1. La IA devuelve el texto sin el link o con otro link → se agrega/reemplaza por el link real (test Task 2).
2. La IA tarda o falla → respuesta 200 con el texto fijo y `ai:false` (test Task 2, sin IA configurada).
3. El admin borra el link al editar → al guardar se agrega de nuevo (test Task 2).
4. Texto con `<script>` → se guarda como texto plano y el panel lo muestra escapado (textarea).
5. Empresa ya reclamada o inexistente → 404 (test Task 2).

### Task 1: `lib/ai.js` — `timeoutMs` y pensar menos en Gemini 3
- `callProvider(cfg, { ..., timeoutMs = 60000 })`; Gemini con modelo `/^gemini-3/` agrega `generationConfig.thinkingConfig = { thinkingLevel: 'low' }`; `DEFAULTS.gemini.model = 'gemini-3.5-flash-lite'`.
- Test (`tools/test-importados-mensaje.js`, sección IA): proveedor Gemini falso local recibe `thinkingConfig.thinkingLevel === 'low'` con `gemini-3.5-flash-lite` y no lo recibe con `gemini-2.5-flash`; `timeoutMs: 200` contra un falso que tarda 1 s → rechaza.

### Task 2: mensaje — importer + store + API
- `lib/importer.js`: `defaultClaimMessage({ name, jobTitle, sourceName, applications, claimUrl })`, `buildClaimMessagePrompt({...})` → `{ system, user }`, `normalizeClaimMessage(raw, claimUrl)` → texto plano ≤ 900 con el link exacto.
- `lib/store.js`: columna `claim_msg`, `setClaimMessage(id, text)`.
- `server.js`: `POST /api/admin/import/companies/:id/message` (IA o fake con `WORKUCO_IMPORT_AI_FAKE=1`; sin IA → plantilla `ai:false`), `PUT` `{ message }`; `GET /api/admin/import` agrega `message` y arma `waUrl` con él.
- Tests: Review Focus 1–3 y 5; con IA falsa el texto trae nombre, puesto y link; se guarda y aparece en la lista; el WhatsApp lleva ese texto.

### Task 3: panel
- `public/panel.js`: botón "Mensaje" por fila sin reclamar → fila desplegable con textarea, "Escribir con IA", "Guardar", "Copiar", "WhatsApp".
- `public/admin.html`/`valle.css`: estilos del editor. Verificación en el navegador con la demo.

### Task 4: cierre
- Sumar la suite a `npm test`; `npm test` verde; Codex; commit.
