# Workuco v4 — avisos importados de canales de WhatsApp

Fecha: 2026-11-11 · Rama: `v4-importados`

## Objetivo

Arrancar con contenido real: el administrador carga avisos que circulan en canales de WhatsApp de la
zona, los publica en Workuco a nombre de una ficha de empresa "sin reclamar", y le avisa a cada empresa
por WhatsApp con un link privado para **reclamar** el aviso (y su ficha) o **borrarlo**. La empresa
decide; Workuco nunca insiste.

Decisiones del dueño:
- Entrada: texto pegado **y** capturas/fotos (flyers).
- Aviso a la empresa: botón de WhatsApp con mensaje armado, enviado a mano desde el teléfono del admin.
- Los importados vencen a los 30 días.
- Se puede postular a un aviso todavía no reclamado.

## Fuera de alcance

Lectura automática de canales de WhatsApp, envío automático de mensajes o mails, importar desde
Facebook/Computrabajo/otros portales, cobrar por reclamar.

## Restricciones

- Sin dependencias npm ni build (igual que v3).
- La API key de IA para importar es **del administrador**, por variables de entorno; no se mezcla con las
  keys de cada empresa.
- Sin IA configurada, la importación funciona igual con carga manual.
- Nunca se publican datos de personas que buscan trabajo tomados de los canales.
- El código de reclamo nunca aparece en páginas públicas ni en respuestas de la API pública.

## 1. Datos

Columnas nuevas (`ensureColumn`):

| Tabla | Columna | Uso |
|---|---|---|
| `companies` | `claimed INTEGER NOT NULL DEFAULT 1` | 0 = ficha creada por Workuco, sin dueño |
| `companies` | `claim_token TEXT` | 48 hex aleatorios; null cuando se reclama |
| `companies` | `notify_status TEXT` | `sin_avisar` · `avisado` (sólo fichas sin reclamar) |
| `companies` | `notified_at INTEGER` | cuándo el admin tocó "Avisar por WhatsApp" |
| `jobs` | `source_kind TEXT NOT NULL DEFAULT 'propio'` | `propio` · `importado` |
| `jobs` | `source_name TEXT` | nombre del canal, p. ej. "Empleos Tunuyán (WhatsApp)" |
| `jobs` | `source_text TEXT` | texto original o transcripción; **sólo admin** |
| `jobs` | `imported_at INTEGER` | |

Tabla nueva `import_blocklist(id, kind 'phone'|'name', value TEXT, created_at)`, con `value` normalizado
(teléfono: sólo dígitos, últimos 10; nombre: minúsculas, sin acentos ni espacios dobles). Índice único
`(kind, value)`.

Ficha sin reclamar: `email = sin-reclamar+<id>@import.workuco`, `password = '!'` (no verifica nunca),
`verified = 0`, `claimed = 0`, `notify_status = 'sin_avisar'`.

## 2. Parseo con IA

`lib/importer.js` (puro, testeable):
- `buildImportPrompt({ meta })` → `{ system, user }`. Pide JSON `{ "avisos": [...] }`, un elemento por
  aviso distinto encontrado, con: `title, companyName, locality (San Carlos|Tunuyán|Tupungato|""),
  category, type, modality, description, requirements, salaryMin, salaryMax, salaryPeriod (mes|día|hora),
  gig, startDate (YYYY-MM-DD|""), duration, positions, contactPhone, contactEmail, skills[]`. Regla
  explícita: no inventar datos; si falta, vacío.
- `normalizeDrafts(raw, meta) -> { drafts, warnings }`: valida contra las listas de `store`
  (localidad, categoría, tipo, modalidad), acota números, normaliza teléfono, completa
  `description` mínima con el texto fuente si la IA la dejó corta, y agrega `warnings` por borrador
  ("Sin localidad", "Sin contacto", "Descripción corta").
- `normPhone(s)`, `normName(s)`.

`lib/ai.js`: `callProvider` acepta `images: [{ mime, base64 }]` (Gemini `inline_data`, OpenAI/compatible
`image_url` data URI, Anthropic bloque `image`). Config del admin: `WORKUCO_IMPORT_AI_PROVIDER`,
`WORKUCO_IMPORT_AI_KEY`, `WORKUCO_IMPORT_AI_MODEL`, `WORKUCO_IMPORT_AI_BASE`. Recomendado: Gemini
(`gemini-2.5-flash`, lee imágenes). Máximo 6 imágenes de 4 MB y 20.000 caracteres de texto por lote.

## 3. API (todo admin salvo lo marcado)

| Método y ruta | Qué hace |
|---|---|
| `GET /api/admin/import/config` | `{ aiReady, provider }` (nunca la key) |
| `POST /api/admin/import/parse` `{ text?, images?[] }` | Devuelve `{ drafts, warnings }`. Sin IA: 400 con mensaje para usar la carga manual |
| `POST /api/admin/import/publish` `{ draft, sourceName, sourceText, force? }` | Valida con `validateJob` (email de contacto opcional para importados). Si el teléfono o el nombre de empresa están en la lista de "no importar" → 409 (`blocked`). Si ya hay un importado vigente con el mismo teléfono y título parecido → 409 (`duplicate`) salvo `force`. Reusa la ficha sin reclamar con el mismo teléfono normalizado o nombre normalizado; si no existe la crea. El aviso queda `approved`, `featured=0`, `source_kind='importado'`, `closes_at` = hoy + 30 días (AR) salvo que el borrador traiga una fecha anterior. 201 `{ job, company }` |
| `GET /api/admin/import` | Fichas sin reclamar y reclamadas que vinieron de importación, con sus avisos, postulaciones, `notify_status`, `claimUrl` y `waUrl` |
| `POST /api/admin/import/companies/:id/notified` | Marca `avisado` |
| `DELETE /api/admin/import/companies/:id` | El admin borra la ficha y sus avisos (sin lista de bloqueo) |
| **Público** `GET /api/claim/:token` | `{ company, jobs, applicationsCount }` (sin datos de postulantes). 404 si el código no existe o ya se usó |
| **Público** `POST /api/claim/:token/accept` `{ email, password, name? }` | Valida como el registro de empresas; si el email ya tiene cuenta → 409. Pasa la ficha a `claimed=1`, borra el código, guarda email y contraseña, inicia sesión de empresa. Notifica a cada postulante: "<Empresa> ya administra su aviso en Workuco" |
| **Público** `POST /api/claim/:token/delete` | Borra ficha, avisos, postulaciones e invitaciones; agrega teléfono y nombre normalizados a `import_blocklist`; notifica a cada postulante con cuenta "El aviso <título> fue retirado por la empresa". 200 |

`waUrl`: `https://wa.me/<teléfono AR con 549>?text=` con este mensaje:

> Hola, ¿cómo están? Les escribo de Workuco, el portal de empleo del Valle de Uco. Vimos su búsqueda
> "<título>" en <canal> y la publicamos para que llegue a más gente de la zona. Si quieren, pueden
> reclamarla gratis para manejar sus postulantes (ya tienen <N>), o pedir que la borremos con un
> toque: <claimUrl>. ¡Gracias!

## 4. Pantallas

- **Admin → pestaña "Importar"** (`admin.html` + `panel.js`):
  - Nombre del canal (se recuerda), área para pegar texto, carga de hasta 6 imágenes (se achican en
    el navegador como las fotos actuales), botón "Leer avisos". Si no hay IA: aviso y formulario
    manual vacío.
  - Lista de borradores editables (mismos campos del wizard en forma compacta), con sus advertencias,
    botón "Publicar" por borrador y "Descartar". Un 409 `duplicate` ofrece "Publicar igual".
  - Tabla de importados: empresa, avisos, postulantes, estado (Sin avisar · Avisado · Reclamado ·
    Borrado por la empresa), botón "Avisar por WhatsApp" (abre `waUrl` y marca avisado), "Copiar link",
    "Borrar".
- **Público**:
  - Tarjetas y detalle de un importado: etiqueta "Tomado de <canal>". En el detalle, bloque
    "¿Es tu empresa? Escribinos" con link a WhatsApp de Workuco (`WORKUCO_CONTACT_WA`) y el contacto
    original del aviso.
  - Ficha de empresa sin reclamar: aviso "Ficha armada por Workuco con búsquedas públicas. ¿Es tu
    empresa? Reclamala gratis".
  - Postular funciona igual que con cualquier aviso.
- **`/reclamar/:token`** (página nueva, mundo "Valle de noche"): muestra la ficha y los avisos como se
  ven en Workuco, cuántas personas se postularon, y tres acciones: **Es mío** (formulario de email y
  contraseña), **Corregir datos** (lleva al mismo formulario y después al panel, pestaña Ofertas) y
  **Borralo de Workuco** (confirmación con explicación de que no se va a volver a importar).

## 5. Seguridad y privacidad

- Todas las rutas `/api/admin/import*` exigen sesión admin.
- El código de reclamo: 24 bytes aleatorios, de un solo uso, nunca en HTML público, nunca en
  `/api/jobs` ni `/api/companies`.
- `source_text` sólo sale en `/api/admin/import`.
- Las fichas sin reclamar no pueden iniciar sesión (contraseña `!`) ni recibir invitaciones de talento
  como empresa.
- Las empresas sin reclamar no cuentan para la insignia de respuesta (no responden).
- Límite de intentos en `/api/claim/*` igual que el login (8 fallos → 10 minutos).

## 6. Pruebas

- `tools/test-importer.js`: `normalizeDrafts` con salidas de IA de ejemplo (varios avisos, campos
  inválidos, sin localidad, teléfonos con formatos `+54 9 2622…`, `2622-15…`), `normPhone`, `normName`,
  y que el prompt incluya las listas válidas.
- `tools/test-v4.js` (servidor temporal con demo y un proveedor de IA falso por variable
  `WORKUCO_IMPORT_AI_FAKE=1` que devuelve un JSON fijo): parse sin admin 401; parse con IA falsa
  devuelve borradores; publicar crea ficha sin reclamar y aviso aprobado con vencimiento a 30 días;
  segundo aviso del mismo teléfono reusa la ficha; duplicado 409 y `force`; el aviso aparece en
  `/api/jobs` con `sourceName` y sin código ni `sourceText`; postular a un importado funciona;
  reclamar con email existente 409; reclamar crea sesión de empresa y el panel ve las postulaciones;
  el código no sirve dos veces; borrar elimina todo, notifica a postulantes y bloquea reimportar
  (409 `blocked`); insignia de respuesta ignora fichas sin reclamar; rutas admin sin sesión 401.
- Prueba en navegador: pegar texto con IA falsa, publicar, abrir el link de reclamo, borrar.
- Revisión independiente de Codex al final.
