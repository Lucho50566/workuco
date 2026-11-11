# Modo flyers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hasta 5 flyers por aviso, flyers siempre completos y una pantalla `/flyers` tipo TikTok con Me interesa, Guardar, Compartir y filtros.

**Architecture:** `jobs.flyers` (JSON) reemplaza en la práctica a `flyer_file` (que queda como el primero). La API acepta y conserva varios flyers y suma `sort=flyer`. El frontend agrega un componente de flyer completo reutilizable, el carrusel del detalle y la página `/flyers` (`public/flyers.html` + `initFlyers` en `app.js` + estilos en `valle.css`).

**Tech Stack:** Node 24 + `node:sqlite`, HTML/CSS/JS sin build.

**Spec:** `docs/superpowers/specs/2026-11-11-modo-flyers-design.md`

## Global Constraints

- Sin dependencias ni build; `npm test` en verde (hoy 17 + 5 + 13 + 82 + 94 + 64).
- Máximo 5 flyers por aviso; JPG/PNG/WebP validados con `saveImage(…, 'flyer')`.
- `flyer` === `flyers[0] || null` en toda respuesta; `flyer_file` === primer archivo o null.
- Con al menos un flyer la descripción mínima es 20; sin flyer, 60.
- `/flyers`: carga de a 10; columna máx. 460 px en escritorio; sin desborde horizontal en 390 y 1440.
- `prefers-reduced-motion`: sin scroll suave ni transiciones en `/flyers`.

## Review Focus

1. Aviso viejo con `flyer_file` y sin `flyers`: tiene que verse con su flyer en tarjeta, detalle y `/flyers`. → Task 1 (prueba de migración).
2. `keepFlyers` con URLs que no son del aviso (otro aviso, `/media/../x`): se ignoran, nunca se referencia un archivo ajeno. → Task 1.
3. Flyer muy alto o muy ancho (3:1 o 1:3): se ve completo sin desbordar la diapositiva ni la tarjeta. → Task 3 (prueba en navegador con imagen 1:3).
4. Llegar al final del feed o un filtro sin resultados: mensaje claro, no diapositivas vacías ni errores. → Task 3.
5. Guardar sin sesión o con cuenta de empresa: lleva a acceder (o avisa que es para personas), no falla en silencio. → Task 3.

---

### Task 1: Varios flyers en datos y API

**Files:** Modify `lib/store.js`, `server.js`, `tools/test-v4.js`.

**Interfaces — Produces:** columna `jobs.flyers`; `rowToJob` agrega `flyers: string[]` (URLs `/media/…`) y `flyerFiles: string[]`, y `flyer`/`flyerFile` pasan a derivarse de ellos; `insertJob`/`updateJob` reciben `flyerFiles: string[]` (escriben `flyers` y `flyer_file = flyerFiles[0] || null`); `searchJobs({ …, sort: 'flyer' })`; `jobSummary` y el detalle exponen `flyers`.

- [ ] **Step 1: Tests** en `tools/test-v4.js` (sección "— Varios flyers —"):
  - alta con `flyers: [PNG, PNG]` → 201, `flyers.length === 2`, `flyer === flyers[0]`.
  - alta con 6 → 400 `fields.flyers`.
  - PUT sin campos de flyer → siguen los 2.
  - PUT con `keepFlyers: [flyers[1]]` + `flyers: [PNG]` → `flyers.length === 2`, `flyers[0] === anterior flyers[1]`.
  - PUT con `keepFlyers: ['/media/flyer-ajeno.png', flyers[0]]` → sólo queda `flyers[0]` (+0 nuevos) → 1.
  - PUT con `removeFlyer: true` y descripción larga → `flyers.length === 0`, `flyer === null`.
  - aviso con sólo `flyer` (forma vieja) → `flyers.length === 1`.
  - migración: actualizar a mano en la base de prueba no es posible desde la API; se cubre con un aviso creado con `flyer` (camino viejo) y con la migración en `migrate()` probada en `tools/test-store-flyers.js` (abre una base temporal, inserta un job con `flyer_file` y `flyers NULL`, reabre `Store` y espera `job.flyers.length === 1`).
  - `GET /api/jobs?sort=flyer&limit=30`: el índice del último con flyer < índice del primero sin flyer; con `locality=Tupungato` todos son de Tupungato; con `gig=1` todos changas.
- [ ] **Step 2:** Correr → fallan. **Step 3:** Implementar (orden SQL: `(CASE WHEN j.flyers IS NOT NULL AND j.flyers<>'[]' THEN 0 ELSE 1 END), j.published_at DESC`). **Step 4:** Pasan + `npm test` verde. Commit `Varios flyers por aviso y orden con flyer primero`.

### Task 2: Flyers completos en wizard, tarjeta y detalle

**Files:** Modify `public/publicar.html`, `public/app.js` (wizard, `jobCard`, `initJob`), `public/valle.css`.

**Interfaces — Produces (app.js):** `flyerFrame(src, alt) -> string` (HTML: `<div class="flyer-frame" style="--bg:url(…)"><img src alt loading="lazy"></div>`, imagen `object-fit: contain` sobre fondo desenfocado de sí misma); usado por tarjeta, detalle y `/flyers`.

- [ ] **Step 1:** Wizard: input `multiple`, estado `s.flyerKeep: string[]` (URLs existentes) + `s.flyerNew: string[]` (data URLs); miniaturas con "Quitar"; contador "N de 5"; envío `{ keepFlyers, flyers }` en edición y `{ flyers }` en alta; "Completar con el flyer" usa el primero.
- [ ] **Step 2:** Tarjeta: portada `flyerFrame` 220 px + insignia "+N". Detalle: carrusel horizontal (scroll-snap) de `flyerFrame`, puntos, flechas en escritorio, cada uno link a la imagen.
- [ ] **Step 3:** Verificar en `tools/test-ui-v4.mjs`: subir 2 flyers en el wizard (`DOM.setFileInputFiles` con dos rutas) → el aviso queda con 2; la tarjeta tiene `.flyer-frame img` con `object-fit: contain`; el detalle tiene 2 diapositivas. Commit `Flyers completos y varios en wizard, tarjeta y detalle`.

### Task 3: Pantalla `/flyers`

**Files:** Create `public/flyers.html`. Modify `server.js` (ruta + ítem "Flyers" en el menú), `public/app.js` (`initFlyers`, botones "Ver en modo flyers" en home y buscar), `public/index.html`, `public/buscar.html`, `public/valle.css`, `tools/test-ui-v4.mjs`.

- [ ] **Step 1:** Cargar la skill `impeccable` (modo Experience, mundo "Valle de noche" ya documentado en `DESIGN.md`) antes de escribir la UI.
- [ ] **Step 2:** `initFlyers()`: pide `/api/jobs?sort=flyer&limit=10&page=N` (+ `locality`/`gig` según filtro), arma `article.fslide` por aviso (carrusel interno de `flyerFrame` o flyer generado `.fgen`), capa inferior (puesto, empresa · localidad, sueldo), riel con Me interesa (`a[href=/oferta/:id]`), Guardar (`/api/candidate/saved/:id`; sin sesión → `/acceder?rol=empleado&next=/flyers`; empresa → toast "Guardar es para personas"), Compartir (`navigator.share` o `wa.me/?text=`). `IntersectionObserver` sobre la penúltima diapositiva para la página siguiente; fin: diapositiva "Viste todas las búsquedas" con link a Buscar; vacío: mensaje con link a "Todo el Valle". Teclas ↑/↓ y rueda: `scrollBy` de una diapositiva. Fondo de escritorio = flyer del aviso visible.
- [ ] **Step 3: Verificar** (`tools/test-ui-v4.mjs`, sección "— Modo flyers —"): en 390 y 1440 sin desborde; primera diapositiva con `.flyer-frame`; ↓ cambia el aviso visible; "Me interesa" lleva a `/oferta/<id>` de esa diapositiva; Guardar sin sesión → `/acceder`; filtro Tupungato → todas las diapositivas de Tupungato; un flyer 1:3 generado con ffmpeg se ve entero (`img.getBoundingClientRect()` dentro de la diapositiva); sin errores de JS. Capturas para revisar.
- [ ] **Step 4:** Commit `Modo flyers tipo TikTok`.

### Task 4: Cierre

- [ ] `npm test` y `tools/test-ui-v4.mjs` en verde con datos frescos.
- [ ] Revisión de Codex (`codex-review`) sobre los commits de este plan; corregir lo importante con prueba primero.
- [ ] LEEME: "Modo flyers" y "Varios flyers por aviso". Commit `Modo flyers: documentación`.
