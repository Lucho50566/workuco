# Plan mensual con IA incluida · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan mensual de 30 días (pago único renovable o prueba gratis) que incluye IA con la clave de WorkUco, protegida por topes y corte de emergencia, más destacado, invitaciones, revisión en el día, ficha destacada y sello.

**Architecture:** Un módulo nuevo `lib/platform-ai.js` es el único paso para llamar a la IA con la clave de WorkUco (elige configuración, reserva el uso, aplica topes, quita datos personales y anota el gasto). El estado del plan vive en columnas de `companies` y se consulta con `store.planActive`; el cobro reusa `payments` + `settlePayment` con `kind='plan'`, igual que el Pack Cosecha.

**Tech Stack:** Node 24 sin dependencias, `node:sqlite`, JS sin frameworks, pruebas con scripts `node tools/test-*.js`.

**Spec:** `docs/superpowers/specs/2026-11-19-plan-mensual-ia-design.md`

## Global Constraints
- Node 24 sin dependencias nuevas; `node:sqlite`; sin frameworks.
- `server.js` está en CRLF: las ediciones por script convierten `\n` a `\r\n`.
- Columnas nuevas con `ensureColumn`; nunca borrar ni regenerar `data/`.
- Repo público: ninguna clave real, ni precio real de proveedor, ni dato real en código o pruebas.
- Precios iniciales (los carga el admin, el código no los fija salvo como ejemplo en textos de ayuda): plan **$ 24.900**, destacados 7/15/30 días **$ 6.900 / $ 11.900 / $ 18.900**, Pack Cosecha **$ 49.900**; todos finales con IVA.
- Plan: **30 días**. Topes por empresa: **500 por mes**, **60 por día**, **10 por minuto**. Global: `WORKUCO_PLAN_AI_DAILY_MAX` (defecto **2000**/día), `WORKUCO_PLAN_AI_BURST` (defecto **120**/minuto) → pausa de **15 minutos** + mail al admin. Usos gratis sin plan: **10** (una sola vez). Invitaciones con plan: **100**/día. CV recortado a **12.000** caracteres.
- Variables de la clave: `WORKUCO_PLAN_AI_PROVIDER`, `_KEY`, `_MODEL`, `_BASE`; estimación de costo: `WORKUCO_PLAN_AI_PRICE_IN`, `_PRICE_OUT` (US$ por millón).
- `admin_meta`: `price_plan`, `sell_plan` ('1'/'0'), `trial_plan` (prendida salvo que valga '0'), `ai_pause_until`.
- Textos en español rioplatense sin tecnicismos. No promocionar el CV Pro. No tocar la animación de inicio (`wk-intro`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No hacer push sin permiso del dueño.

## Review Focus
1. Dos pedidos de IA al mismo tiempo con el tope a 1 de agotarse: sólo uno pasa (la reserva es atómica en SQLite) → test en Task 2.
2. El proveedor tarda o falla (timeout, 429, 500): el uso reservado se devuelve y no cuenta, y no hay reintento automático → test en Task 2.
3. El plan vence con el aviso del plan elegido: deja de figurar destacado en buscar, en `rowToJob` y en las vistas que se cuentan como destacadas → test en Task 1.
4. Webhook del mismo pago repetido o llegando después de una renovación: activa una sola vez y nunca resta días → test en Task 4.
5. Una empresa con clave propia **y** plan: usa su clave y no gasta usos del plan; si su clave falla, no cae en silencio a la de WorkUco → test en Task 2.

---

### Task 1: Estado del plan, registro de uso y destacado del plan en el store

**Files:**
- Modify: `lib/store.js` (columnas en el bloque de `ensureColumn` ~línea 284-330; `featuredSql` línea 47; `rowToJob` ~línea 676; registro de vistas destacadas; métodos nuevos junto a los de Pack Cosecha ~línea 590)
- Test: `tools/test-plan-store.js` (nuevo; abre un `Store` en carpeta temporal, como `tools/test-places-store.js`)

**Interfaces:**
- Produces (en la clase del store):
  - Columnas `companies`: `plan_until INTEGER`, `plan_trial_used INTEGER NOT NULL DEFAULT 0`, `ai_free_used INTEGER NOT NULL DEFAULT 0`, `plan_job_id TEXT`, `plan_ai_auto INTEGER NOT NULL DEFAULT 0`, `plan_notice TEXT` (`'5'|'1'|null`, último aviso de vencimiento mandado; `activatePlan` lo vuelve a null).
  - Tabla `ai_usage(id TEXT PK, company_id TEXT, kind TEXT, status TEXT /* 'reserved'|'ok'|'error' */, tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL, source TEXT /* 'plan'|'free' */, day TEXT /* AAAA-MM-DD hora AR */, created_at INTEGER)` con índices por `(company_id, created_at)` y `(day)`.
  - `planActive(companyId) -> boolean`
  - `activatePlan(companyId, days) -> { until: number }` — `until = max(now, plan_until) + days*86400000`.
  - `startPlanTrial(companyId) -> { until } | null` — null si `plan_trial_used=1`.
  - `setPlanJob(companyId, jobId|null) -> boolean` — sólo avisos `approved` de esa empresa.
  - `setPlanAiAuto(companyId, on: boolean)`.
  - `aiReserve({ companyId, kind, source, limits: { day, month, minute, globalDay } }) -> { id } | { error: 'dia'|'mes'|'minuto'|'global' }` — cuenta filas `reserved`+`ok` y la inserción en **una transacción** (`BEGIN IMMEDIATE`).
  - `aiFinish(id, { ok: boolean, tokensIn, tokensOut, costUsd })` — `ok=false` borra la reserva (devuelve el uso).
  - `aiRecentCount(ms) -> number` — usos `reserved`+`ok` de todas las empresas (fuente `plan` o `free`) en los últimos `ms`; lo usa el corte de emergencia.
  - `setPlanNotice(companyId, '5'|'1'|null)`.
  - `aiFreeTake(companyId, max=10) -> boolean` — suma 1 a `ai_free_used` si es menor que max (un solo UPDATE condicional).
  - `aiUsageSummary() -> { today: { uses, usd, byKind }, month: { uses, usd, byKind } }` y `aiCompanyUsage(companyId) -> { day, month, freeLeft }`.
  - `featuredSql()` pasa a ser verdadero también cuando `j.id` es el `plan_job_id` de una empresa con `plan_until > ahora`; `rowToJob(r).featured` usa la misma regla (con `featuredUntil` = `plan_until` cuando el destacado viene sólo del plan).
  - "Mes" para el tope de 500 = **período pagado vigente**: desde `plan_until - 30 días` (decisión anotada en el código).

- [ ] **Step 1: Escribir las pruebas que fallan** en `tools/test-plan-store.js`:
  - `activatePlan` dos veces suma 60 días; `planActive` falso con `plan_until` en el pasado.
  - `startPlanTrial` devuelve null la segunda vez.
  - `setPlanJob` rechaza aviso de otra empresa o no aprobado.
  - Aviso elegido: aparece primero en `listJobs` (orden por destacado) y `rowToJob.featured === true`; con `plan_until` vencido → `false`, y su `featured_until` pagado previo queda **intacto** (assert de igualdad del valor en la base).
  - `aiReserve` con `limits.day=1`: la primera da `{id}`, la segunda `{error:'dia'}`; `aiFinish(id,{ok:false})` y la siguiente vuelve a dar `{id}`.
  - `aiReserve` con `minute=10`: 11.ª reserva en el mismo minuto → `{error:'minuto'}`.
  - `aiFreeTake` da true 10 veces y false la 11.ª.
- [ ] **Step 2:** `node tools/test-plan-store.js` → FAIL (métodos inexistentes).
- [ ] **Step 3:** Implementar lo de Interfaces en `lib/store.js`. La vista destacada que se registra en `job_views.featured` usa la misma regla que `featuredSql`.
- [ ] **Step 4:** `node tools/test-plan-store.js` → `N ok · 0 fail`; `npm test` sigue verde.
- [ ] **Step 5:** Commit `Plan: estado, registro de uso de IA y destacado del plan en el store`.

### Task 2: `lib/platform-ai.js` — el único paso hacia la IA de WorkUco

**Files:**
- Create: `lib/platform-ai.js`
- Modify: `lib/ai.js` (`callProvider` devuelve también el uso de tokens; `analyzeApplication` acepta `redact`)
- Test: `tools/test-platform-ai.js` (nuevo; store en carpeta temporal + proveedor falso compatible con OpenAI levantado en un puerto local, como el `mock` de `tools/test-ai.js`)

**Interfaces:**
- Consumes: métodos de store de Task 1.
- Produces:
  - `createPlatformAi({ store, env = process.env, now = Date.now, onBreaker = (info) => {} }) -> platformAi`
  - `platformAi.config() -> cfg | null` (= `ai.importConfig(env, 'WORKUCO_PLAN_AI')`).
  - `platformAi.aiFor(company, { auto = false } = {}) -> { cfg, source: 'own'|'plan'|'free' } | { error: string, code: 'sin_plan'|'sin_ia' }`
    - orden: clave propia activa (`ai.configOf(company)` con provider+key+enabled) → `own`; plan activo y `config()` → `plan`; `auto=false`, `config()` y quedan usos gratis → `free`; si no, `{ code:'sin_plan', error:'Activá el plan o probalo gratis 30 días para usar la IA' }`. Si no hay `config()` y no hay clave propia → `code:'sin_ia'`.
    - `auto=true` sólo admite `own`, o `plan` con `company.plan_ai_auto=1`.
  - `platformAi.run(company, kind, { auto = false } = {}, fn: (cfg, { redact: boolean }) => Promise<{ result, usage? }>) -> Promise<result>`
    - `own`: llama `fn(cfg, {redact:false})` sin topes ni registro.
    - `plan`/`free`: si `ai_pause_until > now` → error "La IA de WorkUco está en pausa un rato. Probá en unos minutos."; `free` toma 1 con `aiFreeTake`; `aiReserve` con `{ day:60, month:500, minute:10, globalDay: DAILY_MAX }` (para `free`, sólo `minute` y `globalDay`); antes de llamar cuenta con `store.aiRecentCount(60000)` y si supera `BURST` → guarda `ai_pause_until = now+15min`, llama `onBreaker`, y corta; llama `fn(cfg,{redact:true})` una sola vez; `aiFinish` con tokens y costo (`(in*PRICE_IN + out*PRICE_OUT)/1e6`). Si `fn` falla → `aiFinish(ok:false)` (y para `free` devuelve el uso gratis) y relanza.
  - `redactText(text: string) -> string` (exportada): reemplaza mails, teléfonos (secuencias de 8+ dígitos con espacios/guiones/+), DNI/CUIL (7-11 dígitos con puntos o guiones) por `[dato quitado]`.
  - `ai.analyzeApplication({ ..., redact })`: con `redact=true` omite la línea `Nombre:`, pasa perfil, mensaje y CV por `redactText`, y recorta el CV a 12.000 caracteres (el recorte aplica siempre).
  - `ai.callProvider` devuelve `parseJson(text)` como hoy pero agrega la propiedad no enumerable `__usage = { in, out }` leída de `usage.prompt_tokens/completion_tokens` (OpenAI), `usageMetadata` (Gemini) o `usage.input_tokens/output_tokens` (Anthropic). Con la clave de WorkUco y Anthropic, `max_tokens` usa el de la función (no 16.000): parámetro `{ strictMax: true }`.

- [ ] **Step 1: Pruebas que fallan** en `tools/test-platform-ai.js`:
  - `aiFor`: clave propia → `own`; sin clave con plan → `plan`; sin plan → `free` hasta 10 y después `code:'sin_plan'`; sin `WORKUCO_PLAN_AI_*` y sin clave → `code:'sin_ia'`; `auto:true` sin plan → error (nunca `free`).
  - `run` con proveedor falso: 61.ª llamada del día → error y el proveedor recibió exactamente 60.
  - Dos `run` simultáneos con un solo uso disponible → uno resuelve, el otro rechaza; el proveedor recibió 1.
  - Proveedor que responde 500 → `run` rechaza, el uso no cuenta (`aiCompanyUsage().day` igual que antes), el proveedor recibió 1 llamada (sin reintento).
  - `BURST=5` y 6 llamadas de 6 empresas distintas en el mismo minuto → la 6.ª no llega al proveedor, `onBreaker` llamado una vez, `ai_pause_until` guardado; llamadas siguientes rechazadas hasta que el reloj falso pasa 15 minutos.
  - Empresa con clave propia y plan: el proveedor recibe la clave propia (header) y `aiCompanyUsage` no cambia; si la clave propia da 401, el error se propaga y **no** se llama con la clave de WorkUco.
  - Redacción: con `source:'plan'`, el cuerpo que recibe el proveedor no contiene el nombre, el mail ni el teléfono de la postulación de prueba.
- [ ] **Step 2:** `node tools/test-platform-ai.js` → FAIL.
- [ ] **Step 3:** Implementar `lib/platform-ai.js` y los cambios de `lib/ai.js`.
- [ ] **Step 4:** `node tools/test-platform-ai.js` → `0 fail`; `node tools/test-ai.js` sigue verde.
- [ ] **Step 5:** Commit `IA de WorkUco: paso único con topes, corte de emergencia y datos personales quitados`.

### Task 3: Conectar las rutas de IA y el análisis automático

**Files:**
- Modify: `server.js` — instanciar `platformAi` cerca de `MAILER` (~línea 355) con `onBreaker` que manda mail a `ADMIN_EMAIL` vía `MAILER`; rutas `/api/company/applications/:id/analyze` (~1986), `/api/company/ai/flyer` (~2074), `/api/company/ai/describe` (~2092), `GET /api/company/ai` (~2038); análisis automático tras postular (~1413) y `analyzeAndSave` (~825).
- Test: `tools/test-plan.js` (nuevo; levanta el servidor con `WORKUCO_DEMO=1`, Mercado Pago falso como `tools/test-cosecha.js` y proveedor de IA falso compatible con OpenAI vía `WORKUCO_PLAN_AI_PROVIDER=custom`, `_BASE=http://127.0.0.1:<puerto>`, `_KEY=clave-de-prueba`)

**Interfaces:**
- Consumes: `platformAi.aiFor`, `platformAi.run`, `ai.analyzeApplication({redact})`.
- Produces:
  - Las tres rutas usan `platformAi.run(company, 'analisis'|'flyer'|'aviso', …)`. Si `aiFor` da error: respuesta **402** con `{ error, code }` (`sin_plan` o `sin_ia`) para que el panel muestre el botón del plan.
  - `GET /api/company/ai` agrega `{ platform: { available: boolean, source: 'own'|'plan'|'free'|null, day, month, dayMax: 60, monthMax: 500, freeLeft, auto: boolean } }`.
  - `PATCH /api/company/ai` acepta `planAuto: boolean` → `store.setPlanAiAuto`.
  - Análisis automático: corre si `aiFor(company,{auto:true})` no da error; los errores de tope se registran en consola y no se reintentan.
  - Admin: `GET /api/admin/ai-usage` → `aiUsageSummary()` + `{ pausedUntil }`; `POST /api/admin/ai-usage/resume` borra `ai_pause_until`.

- [ ] **Step 1: Pruebas que fallan** (en `tools/test-plan.js`, sección "IA"):
  - Empresa demo sin clave y sin plan: `POST /api/company/ai/describe` 10 veces → 200; la 11.ª → 402 `code:'sin_plan'`.
  - Postulación nueva a un aviso de empresa con plan y `planAuto` apagado → el proveedor falso no recibe llamada; con `PATCH planAuto:true` y otra postulación → recibe 1.
  - Empresa sin plan con usos gratis: postular no dispara análisis automático.
  - `GET /api/admin/ai-usage` (admin) muestra los usos de hoy; sin sesión de admin → 401.
- [ ] **Step 2:** `node tools/test-plan.js` → FAIL.
- [ ] **Step 3:** Cablear `server.js` según Interfaces.
- [ ] **Step 4:** `node tools/test-plan.js` (sección IA) verde; `npm test` verde.
- [ ] **Step 5:** Commit `IA de WorkUco en analizar, redactar y leer flyers; análisis automático opcional`.

### Task 4: Plan: prueba, cobro, beneficios y admin

**Files:**
- Modify: `server.js` — constantes `PLAN_DAYS = 30`, `PLAN_INVITES = 100`; `planConfig()` junto a `cosechaConfig()` (~446); `inviteLimit` (~451); `settlePayment` rama `kind==='plan'` (~522); rutas nuevas junto a las de cosecha (~1844); `publicCompany` (~182: quitar `plan`, agregar `hasPlan`); admin settings `/api/admin/payments` y `/settings` (~2661-2700); admin empresas (~2715-2750: quitar edición de `plan`, agregar `planUntil` y `POST /api/admin/companies/:id/plan {days|null}`); `GET /api/admin/jobs` (~2537: pendientes de empresas con plan primero y `hasPlan` en cada fila); fichas de la Guía de empresas con plan se muestran destacadas (en la consulta pública de places, `owner_type='company'` con plan activo cuenta como destacada).
- Test: `tools/test-plan.js` (sección "Plan")

**Interfaces:**
- Consumes: Task 1 (`activatePlan`, `startPlanTrial`, `setPlanJob`, `planActive`), `platformAi.config()`.
- Produces:
  - `planConfig() -> { price, sell, trial, aiReady, payEnabled }` — `trial = admin_meta.trial_plan !== '0'`; `payEnabled = sell && price>0 && mp.connected() && mp.isPublicHttps(PUBLIC_URL) && aiReady`.
  - `planState(companyId) -> { active, until, trialAvailable, price, payEnabled, planJobId, ai: {...como en Task 3} }` — `trialAvailable = trial && aiReady && !plan_trial_used && tieneAvisoPublicadoOEnRevision`.
  - Rutas: `GET /api/company/plan` → `planState`; `POST /api/company/plan/trial` → activa o 400 con motivo; `POST /api/company/plan/checkout` → `{ url, reference }` (preferencia `"Plan WorkUco (30 días)"`, `returnPath: '/panel'`); `PUT /api/company/plan/job { jobId|null }`.
  - `settlePayment` `kind==='plan'`: `activatePlan(company, PLAN_DAYS)` y `tryNotify(... title: 'Tu plan está activo', body: 'Hasta el DD/MM/AAAA: IA incluida, 1 aviso destacado y 100 invitaciones por día.', link:'/panel')`.
  - Avisos de vencimiento: al pedir `GET /api/company/plan` o cargar el panel, si faltan ≤5 días o ≤1 día y no se avisó ese umbral (columna `plan_notice` con `'5'|'1'|null`, se limpia al activar) → `tryNotify` con "Tu plan vence el …" y link a `/panel`.
  - `GET /api/admin/payments` agrega `settings.planPrice`, `settings.sellPlan`, `settings.trialPlan`; `PUT .../settings` acepta `planPrice` (mismo `okPrice`), `sellPlan`, `trialPlan`.

- [ ] **Step 1: Pruebas que fallan** (sección "Plan"):
  - Sin aviso → `POST /plan/trial` 400; con aviso pendiente → 200 y `planState.active`; segunda vez → 400. Admin con `trialPlan:false` → `trialAvailable:false`. Sin `WORKUCO_PLAN_AI_*` (segundo arranque o variable vacía) → ni prueba ni pago.
  - Checkout con venta prendida y precio 24900 → preferencia en el MP falso con `unit_price 24900`; webhook aprobado → activo 30 días; mismo webhook otra vez → `plan_until` sin cambios; pago con monto 100 → no activa.
  - Renovar con 10 días restantes → `until` ≈ +40 días.
  - `PUT /plan/job` con aviso propio aprobado → aparece destacado en `/api/jobs`; con aviso de otra empresa → 404.
  - Invitaciones: `invitesLeft` 100 con plan, 20 sin plan.
  - `GET /api/admin/jobs?status=pending` lista primero los de empresas con plan.
  - `/api/companies/:id` (o la ruta pública de empresa) no expone `plan` y expone `hasPlan`.
  - Ficha de la Guía de una empresa con plan aparece primero en la lista pública de su sección.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar según Interfaces.
- [ ] **Step 4:** `node tools/test-plan.js` verde; `npm test` verde.
- [ ] **Step 5:** Commit `Plan mensual: prueba gratis, cobro con Mercado Pago, beneficios y admin`.

### Task 5: Pantallas: `/plan`, panel, admin y sello

**Files:**
- Create: `public/plan.html`
- Modify: `server.js` (ruta `GET /plan` con `renderPage`, sumarla al sitemap ~2922 y al menú "Para empresas"), `public/panel.js` (tarjeta "Tu plan" en Resumen con el estilo de `renderCosecha`; pestaña IA; botón "Usar el destacado del plan" en cada aviso aprobado de Ofertas; admin: precio/venta/prueba del plan, gasto de IA con "Reanudar", plan por empresa en Empresas en lugar del selector viejo), `public/app.js` (`initPlan`; sello en `/empresa/<id>` si `hasPlan`; la tarjeta "Destacalo" de los próximos pasos de publicar suma un enlace a `/plan`; error 402 de IA en publicar → toast con enlace a `/plan`), `public/valle.css`.
- Test: `tools/test-plan.js` (sección "Páginas": `/plan` responde 200 con la tabla gratis/plan y el precio cargado; sitemap incluye `/plan`) + verificación en el navegador.

**Interfaces:**
- Consumes: `GET /api/company/plan`, `POST /api/company/plan/trial|checkout`, `PUT /api/company/plan/job`, `GET/PATCH /api/company/ai`, rutas de admin de Tasks 3-4, `meta.plan = { price, payEnabled, trial }` (agregar a `/api/meta`).
- Produces: textos visibles —
  - Tarjeta: título "Plan WorkUco", líneas "IA incluida: X de 500 usos este mes", "1 aviso destacado todo el mes", "100 invitaciones por día", botón "Probar gratis 30 días" / "Activar por $ 24.900" / "Renovar", estado "Activo hasta el DD/MM".
  - IA sin clave propia: "IA de WorkUco" con usos restantes; interruptor "Analizar solo a cada postulante nuevo (gasta 1 uso por postulante)"; la configuración de clave propia queda en un desplegable "Usar mi propia clave (avanzado)".
  - `/plan`: tabla Gratis vs Plan del diseño, precio, comparación "un aviso destacado en otros portales cuesta entre $ 38.000 y $ 54.000", preguntas frecuentes cortas (qué pasa cuando vence, cómo se renueva, qué hace la IA con los datos).

- [ ] **Step 1:** Prueba de páginas que falla (`/plan` 404 hoy).
- [ ] **Step 2:** Implementar pantallas.
- [ ] **Step 3:** `node tools/test-plan.js` verde; `npm test` verde.
- [ ] **Step 4:** Verificar en el navegador con la demo (preview "workuco-pagos-demo", entrar como `bodega@demo.workuco`): probar gratis, elegir aviso destacado, prender análisis automático, ver la tarjeta, `/plan` en celular (375 px) y escritorio, admin con gasto de IA y "Reanudar". Captura de pantalla de la tarjeta y de `/plan`.
- [ ] **Step 5:** Commit `Plan mensual: página /plan, tarjeta del panel, IA de WorkUco en el panel y admin`.

### Task 6: Revisión y cierre
- [ ] **Step 1:** `npm test` completo (sumar `tools/test-plan-store.js`, `tools/test-platform-ai.js` y `tools/test-plan.js` a la cadena de `package.json`) → todo `0 fail`.
- [ ] **Step 2:** `codex review --base <commit anterior al Task 1> -c 'windows.sandbox="unelevated"' < /dev/null`; verificar cada hallazgo, aplicar los correctos, volver a correr `npm test`.
- [ ] **Step 3:** Commit de correcciones si hubo. **No hacer push**: pedir permiso al dueño, recordando que en el servidor tiene que cargar `WORKUCO_PLAN_AI_PROVIDER/KEY/MODEL` (clave sólo para WorkUco, saldo prepago sin recarga automática) y los precios desde el admin.
