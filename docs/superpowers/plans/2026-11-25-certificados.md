# Certificados de trabajo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una empresa con cuenta emita un certificado de trabajo verificable (código + QR) para alguien que contrató por una postulación en WorkUco, que la persona lo vea, lo imprima y decida qué mostrar.

**Architecture:** Reglas puras en `lib/certificates.js`, tabla y consultas en `lib/store.js`, API y página en `server.js` (una función `handleCertificatesApi` como `handleVecinosApi`), UI en `public/certificado.*` + `public/certificados.js` (`window.WKCert`) y ganchos chicos en `panel.js`, `app.js` y `mi-perfil.html`. El QR se dibuja en el navegador con `public/vendor/qrcode.js`.

**Tech Stack:** Node 24, `node:sqlite`, JS sin frameworks. Única pieza externa: `qrcode-generator` 1.4.4 (Kazuhiko Arase, MIT), copiada a `public/vendor/qrcode.js`.

**Spec:** `docs/superpowers/specs/2026-11-25-certificados-design.md`

## Global Constraints

- Sin dependencias de npm; el QR es un solo archivo MIT servido desde `public/vendor/`, sin pedidos a la red.
- El certificado nunca muestra DNI, teléfono, mail ni domicilio.
- `/certificado/<código>` lleva `noindex` y no entra al sitemap.
- El comentario sólo se muestra con `comment_status === 'shown'`.
- Sólo postulaciones con `candidate_id`, de empresas con cuenta propia (`claimed !== 0`), en etapa `contratado`.
- `person_name` sale de `candidates.name`, no de `applications.name`.
- Los certificados sobreviven al borrado del aviso y de la empresa; se borran con la baja de la persona.
- Anulación del admin (`revoked_by='admin'`) bloquea reemitir para esa postulación.
- El dueño de WorkUco no recibe mails por certificados.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Marca: noche `#0b1612`, lima `#c8f560`, crema `#f5f1e6`, Bricolage Grotesque; impreso en B/N debe verse formal, en una hoja A4.

## Review Focus

1. Doble clic en "Dar certificado" → el segundo pedido responde 409 y queda un solo certificado vigente (test en Task 3).
2. Una empresa intenta certificar una postulación de otra empresa → 404, sin filtrar datos (Task 3).
3. El código tipeado en minúsculas o sin guion (`k7m29qxa`) abre el mismo certificado (Task 1 y Task 3).
4. La persona intenta "mostrar comentario" en un certificado sin comentario → 400 (Task 3).
5. Nombre de empresa o puesto muy largo → el certificado impreso sigue en una sola hoja (Task 4, verificación visual).

---

### Task 1: Reglas puras (`lib/certificates.js`)

**Files:**
- Create: `lib/certificates.js`
- Test: `tools/test-certificados.js` (sección "— Reglas —"; el archivo crece en Task 3)

**Interfaces:**
- Produces:
  - `ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'` (sin 0/O/1/I/L)
  - `newCode(randomBytes = crypto.randomBytes) -> string` de 8 letras del alfabeto, sin guion
  - `normCode(s: string) -> string` mayúsculas, sin guiones ni espacios; `''` si no son 8 chars del alfabeto
  - `formatCode(code) -> 'XXXX-XXXX'`
  - `validateIssue(body, { appliedDate: 'AAAA-MM-DD', today: 'AAAA-MM-DD', defaultPosition }) -> { value: { position, startDate, endDate, comment } } | { errors: {campo: mensaje} }`
  - `periodLabel(startDate, endDate) -> 'del 3 de marzo de 2026 al 30 de abril de 2026'`

- [ ] **Step 1: Write the failing tests**

```js
check('código de 8 letras sin ambiguas', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(newCode()));
check('normaliza minúsculas y guion', normCode('k7m2-9qxa') === 'K7M29QXA');
check('rechaza letras ambiguas', normCode('O0I1L000') === '');
check('formato con guion', formatCode('K7M29QXA') === 'K7M2-9QXA');
const ctx = { appliedDate: '2026-03-10', today: '2026-11-25', defaultPosition: 'Tractorista' };
check('válido', validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).value.position === 'Tractorista');
check('fecha inexistente', !!validateIssue({ startDate: '2026-02-30', endDate: '2026-04-30' }, ctx).errors.startDate);
check('desde > hasta', !!validateIssue({ startDate: '2026-05-01', endDate: '2026-04-30' }, ctx).errors.endDate);
check('hasta futura', !!validateIssue({ startDate: '2026-03-15', endDate: '2026-12-01' }, ctx).errors.endDate);
check('desde antes de postularse (-1 día ok)', !validateIssue({ startDate: '2026-03-09', endDate: '2026-03-20' }, ctx).errors && !!validateIssue({ startDate: '2026-03-08', endDate: '2026-03-20' }, ctx).errors.startDate);
check('comentario con teléfono', !!validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'llamalo al 2622555123' }, ctx).errors.comment);
check('comentario de 281', !!validateIssue({ startDate: '2026-03-15', endDate: '2026-04-30', comment: 'a'.repeat(281) }, ctx).errors.comment);
check('puesto de 81', !!validateIssue({ position: 'a'.repeat(81), startDate: '2026-03-15', endDate: '2026-04-30' }, ctx).errors.position);
check('período legible', periodLabel('2026-03-03', '2026-04-30') === 'del 3 de marzo de 2026 al 30 de abril de 2026');
```

- [ ] **Step 2:** `node tools/test-certificados.js` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement `lib/certificates.js`.** Reusar `hasContactData` de `lib/vecinos.js` y el chequeo de fecha real por ida y vuelta ISO que usa `validateRequest`. `newCode` mapea cada byte con `byte % ALPHABET.length`.
- [ ] **Step 4:** `node tools/test-certificados.js` → todos `ok`.
- [ ] **Step 5: Commit** `feat(certificados): reglas de código y validación`.

### Task 2: Tabla y consultas (`lib/store.js`)

**Files:**
- Modify: `lib/store.js` (crear tabla junto a la de `requests`, ~línea 462; métodos nuevos después de los de vecinos; `deleteCandidateCascade` ~línea 1392)
- Test: `tools/test-certificados.js` (sección "— Base —", con un `Store` en carpeta temporal como `test-places-store.js`)

**Interfaces:**
- Consumes: Task 1 `newCode`.
- Produces (objetos en camelCase, salvo indicación):
  - Tabla `certificates` con las columnas del spec más `revoked_by`; `code` UNIQUE; índices por `candidate_id`, `company_id`, `application_id`.
  - `insertCertificate({ applicationId, candidateId, companyId, jobId, personName, companyName, position, locality, startDate, endDate, comment }) -> cert` (genera `id` con `uid('ce')` y `code` único reintentando ante choque; `commentStatus` = `'pending'` si hay comentario, si no `'none'`; `status:'valid'`; `onProfile:false`)
  - `certificate(id) -> cert|null`, `certificateByCode(code) -> cert|null`
  - `certificatesForApplication(applicationId) -> cert[]` (más nuevo primero)
  - `certificatesOfCandidate(candidateId) -> cert[]`, `certificatesOfCompany(companyId) -> cert[]`, `publicCertificatesOf(candidateId) -> cert[]` (sólo `valid` y `onProfile`)
  - `adminCertificates({ q } = {}) -> cert[]` (q busca en persona, empresa, puesto o código; límite 200)
  - `revokeCertificate(id, by: 'company'|'admin', reason) -> cert|null` (sólo si estaba `valid`)
  - `setCertificateComment(id, 'shown'|'hidden') -> cert`, `setCertificateOnProfile(id, bool) -> cert`
  - `deleteCandidateCascade` además borra `certificates WHERE candidate_id=?`.

- [ ] **Step 1: Write the failing tests**

```js
const c1 = s.insertCertificate({ applicationId: 'a1', candidateId: 'u1', companyId: 'co1', jobId: 'j1', personName: 'Ana', companyName: 'Finca', position: 'Tractorista', locality: 'Tunuyán', startDate: '2026-03-15', endDate: '2026-04-30', comment: 'Muy responsable' });
check('se crea vigente con comentario pendiente', c1.status === 'valid' && c1.commentStatus === 'pending' && c1.onProfile === false);
check('por código', s.certificateByCode(c1.code).id === c1.id);
check('sin comentario queda none', s.insertCertificate({ ...base, applicationId: 'a2', comment: '' }).commentStatus === 'none');
check('no figura en público hasta prenderlo', s.publicCertificatesOf('u1').length === 0);
s.setCertificateOnProfile(c1.id, true);
check('figura en público', s.publicCertificatesOf('u1').length === 1);
check('anula una vez', s.revokeCertificate(c1.id, 'admin', 'denuncia').revokedBy === 'admin' && s.revokeCertificate(c1.id, 'company', 'x') === null);
check('anulado no figura en público', s.publicCertificatesOf('u1').length === 0);
s.deleteCandidateCascade('u1');
check('la baja borra sus certificados', s.certificatesOfCandidate('u1').length === 0);
```
(El test crea antes un candidato real `u1` con `insertCandidate`, el método que ya usan las otras pruebas, para que la baja funcione.)

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** correr → `ok`; también `node tools/test-vecinos.js` y `node tools/test-places-store.js` siguen `ok`.
- [ ] **Step 5: Commit** `feat(certificados): tabla y consultas`.

### Task 3: API y avisos (`server.js`)

**Files:**
- Modify: `server.js` (`require('./lib/certificates')`; `handleCertificatesApi(req,res,p,method,q,me)` definida antes de `handleApi` y llamada después de `handleVecinosApi`; `GET /api/company/applications/:id` suma `certificate`; la respuesta del perfil público suma `certificates`)
- Test: `tools/test-certificados.js` (sección "— API —", servidor hijo con `WORKUCO_MAIL_FAKE=1` como `tools/test-avisos.js`); sumar `node tools/test-certificados.js` a `npm test` después de `test-avisos.js`

**Interfaces:**
- Consumes: Task 1 y Task 2.
- Produces (rutas; JSON `{ error }` en errores, como el resto del sitio):
  - `POST /api/company/applications/:id/certificate` `{ position?, startDate, endDate, comment? }` → `201 { certificate }`. Errores: 401 si no es empresa; 404 si la postulación no es suya; 400 si no está en `contratado`, si no tiene `candidateId` o si la empresa tiene `claimed === 0`; 400 `{ errors }` de validación; 409 si ya hay uno `valid` para la postulación; 409 si alguno fue anulado con `revokedBy === 'admin'`.
  - `GET /api/company/certificates` → `{ certificates }`
  - `POST /api/company/certificates/:id/revoke` `{ reason }` → `{ certificate }` (404 si no es de la empresa)
  - `GET /api/candidate/certificates` → `{ certificates }` (con `comment` aunque esté pendiente: es suyo)
  - `PATCH /api/candidate/certificates/:id` `{ commentShown?: bool, onProfile?: bool }` → `{ certificate }`; 400 si `commentShown` y `commentStatus === 'none'`
  - `GET /api/certificates/:code` (público) → `{ certificate: { code, status:'valid', personName, companyName, position, locality, period, issuedAt, comment? } }` o `{ certificate: { code, status:'revoked', revokedBy } }`; 404 si no existe. Nunca devuelve ids internos, `candidateId`, `revokeReason` ni comentarios no aceptados.
  - `GET /api/admin/certificates?q=` y `POST /api/admin/certificates/:id/revoke` `{ reason }` (sólo admin).
  - Para la vista pública: `cert.publicView(c)` vive en `server.js` como `publicCertificate(c)`.
- Avisos (`tryNotify('candidate', …, { kind: 'etapa', … })`, así respetan la preferencia "postulaciones"):
  - al emitir: título `${companyName} te dio un certificado de trabajo`, cuerpo `Puesto: ${position}`, link `/mi-perfil?tab=certificados`
  - al anular: título `Se anuló tu certificado de ${companyName}`, cuerpo `Lo anuló ${revokedBy === 'admin' ? 'WorkUco' : 'la empresa'}.`, mismo link.

- [ ] **Step 1: Write the failing tests** (empresa, persona contratada y admin como en `test-avisos.js`):

```js
check('no se emite si no está contratada', (await emp.post(`/api/company/applications/${app.id}/certificate`, okBody)).status === 400);
// mover a contratado
const r1 = await emp.post(`/api/company/applications/${app.id}/certificate`, { ...okBody, comment: 'Muy responsable' });
check('emite', r1.status === 201 && /^[A-Z2-9]{8}$/.test(r1.data.certificate.code));
check('doble clic → 409', (await emp.post(`/api/company/applications/${app.id}/certificate`, okBody)).status === 409);
check('otra empresa → 404', (await otra.post(`/api/company/applications/${app.id}/certificate`, okBody)).status === 404);
const code = r1.data.certificate.code;
const pub = await client().get(`/api/certificates/${code.toLowerCase()}`);
check('verificación pública con minúsculas', pub.status === 200 && pub.data.certificate.status === 'valid');
check('comentario pendiente no se muestra', !('comment' in pub.data.certificate));
check('sin datos privados', !/2622|@test\.workuco|candidateId|revokeReason/.test(pub.text));
check('nombre de la cuenta, no de la postulación', pub.data.certificate.personName === 'Ana Certificada');
check('aviso a la persona', mailsTo('ana@test.workuco').some((m) => /te dio un certificado de trabajo/.test(m.subject)));
await ana.patch(`/api/candidate/certificates/${id}`, { commentShown: true });
check('comentario aceptado se muestra', (await client().get(`/api/certificates/${code}`)).data.certificate.comment === 'Muy responsable');
check('mostrar comentario sin comentario → 400', (await ana.patch(`/api/candidate/certificates/${idSinComentario}`, { commentShown: true })).status === 400);
check('página con noindex', /noindex/.test((await client().get(`/certificado/${code}`)).text));
check('no está en el sitemap', !/\/certificado\//.test((await client().get('/sitemap.xml')).text));
await admin.post(`/api/admin/certificates/${id}/revoke`, { reason: 'denuncia' });
check('anulado se ve como anulado y sin datos', (await client().get(`/api/certificates/${code}`)).data.certificate.status === 'revoked');
check('anulado por admin bloquea reemitir', (await emp.post(`/api/company/applications/${app.id}/certificate`, okBody)).status === 409);
// borrar el aviso: el certificado de otra postulación sigue valiendo y la empresa lo ve en su lista
check('sobrevive al borrado del aviso', (await client().get(`/api/certificates/${code2}`)).data.certificate.status === 'valid' && (await emp.get('/api/company/certificates')).data.certificates.some((c) => c.code === code2));
check('postulación sin cuenta → 400', (await emp.post(`/api/company/applications/${guestApp.id}/certificate`, okBody)).status === 400);
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar rutas y la página `GET /certificado/:code` → `renderPage(res, 'certificado.html', { req, title: 'Certificado de trabajo · WorkUco', noindex: true })` (la página carga los datos por la API). La URL con código inválido o inexistente da el 404 común.
- [ ] **Step 4:** `node tools/test-certificados.js` y `npm test` → todo `ok`.
- [ ] **Step 5: Commit** `feat(certificados): API, verificación pública y avisos`.

### Task 4: Página del certificado y QR

**Files:**
- Create: `public/vendor/qrcode.js` (qrcode-generator 1.4.4, `qrcode.js` del paquete npm, con su encabezado de licencia MIT intacto), `public/certificado.html`, `public/certificado.css`, `public/certificados.js`
- Modify: `public/app.js` (switch de páginas: `case 'certificado': await window.WKCert.initPage(); break;`)

**Interfaces:**
- Consumes: `GET /api/certificates/:code`.
- Produces: `window.WKCert = { initPage, profileSection, issueForm, companyList }` (los tres últimos los usa Task 5).

- [ ] **Step 1:** descargar el archivo del registro de npm (`npm pack qrcode-generator@1.4.4` en una carpeta temporal) y copiar `qrcode.js`; verificar que no tenga `fetch`/`XMLHttpRequest`.
- [ ] **Step 2:** `initPage` lee el código de la URL, pide la API y dibuja: encabezado WorkUco, "Certificado de trabajo", "Se certifica que **{persona}** trabajó como **{puesto}** en **{empresa}** ({localidad}) {período}.", comentario si viene, fecha de emisión, código `XXXX-XXXX`, QR (SVG con `qrcode(0,'M')` → `createSvgTag`) hacia `${location.origin}/certificado/${code}` y el texto aclaratorio exacto del spec. Botón "Descargar / imprimir" → `window.print()`. Anulado: "Este certificado fue anulado por {la empresa|WorkUco}" sin datos de la persona.
- [ ] **Step 3:** `@media print` en `certificado.css`: A4, sin header/footer/botón, contraste para B/N; textos largos cortan con `overflow-wrap:anywhere`.
- [ ] **Step 4: Verificar en el navegador** (preview `workuco-vecinos-demo` o servidor de prueba): certificado vigente, con comentario, anulado y con empresa de 80 caracteres. Imprimir a PDF con Edge headless (`--print-to-pdf`) y confirmar **1 página**. Escanear el QR no es posible acá: confirmar que el SVG decodifica a la URL con un segundo chequeo (comparar `qrcode(0,'M').addData(url)` regenerado o mostrarlo al dueño para escanear).
- [ ] **Step 5: Commit** `feat(certificados): página imprimible con QR`.

### Task 5: Panel de empresa, Mi perfil, perfil público y admin

**Files:**
- Modify: `public/panel.js` (en `openDrawer`, ~línea 528: bloque "Certificado"; lista "Certificados emitidos" en la pestaña de postulantes; en el panel de admin, una sección "Certificados" con buscador y "Anular"), `public/panel.html` y `public/admin.html` (cargar `/vendor/qrcode.js` no hace falta; sí `/certificados.js` donde se use `WKCert`)
- Modify: `public/mi-perfil.html` (pestaña `data-tab="certificados"` "Certificados", después de "Mis postulaciones") y `public/app.js` (que `?tab=certificados` la abra y llame a `WKCert.profileSection`)
- Modify: `public/app.js` `initPublicProfile` (~línea 2077): si vienen `certificates`, lista "Certificados de trabajo" con link a cada `/certificado/<código>`
- Test: `tools/test-ui-certificados.mjs` siguiendo `tools/test-ui-v4.mjs` (no entra en `npm test`, igual que las otras pruebas de UI)

**Interfaces:**
- Consumes: rutas de Task 3; `WKCert` de Task 4.

- [ ] **Step 1:** drawer de la postulación:
  - en `contratado` con `candidateId` y sin certificado vigente: botón "Terminó el trabajo · Dar certificado" que abre `WKCert.issueForm` (puesto precargado, desde/hasta, comentario con contador 280 y la aclaración "La persona lo ve antes y decide si se muestra");
  - con certificado vigente: código, link "Ver certificado" y "Anular" (pide motivo);
  - si lo anuló WorkUco: "WorkUco anuló el certificado de esta postulación" sin botón.
- [ ] **Step 2:** "Certificados emitidos" (persona, puesto, período, estado, Ver, Anular) en la pestaña de postulantes.
- [ ] **Step 3:** pestaña "Certificados" en Mi perfil: tarjetas con empresa, puesto, período, estado, "Ver / Descargar"; si `commentStatus==='pending'`, el comentario con "Mostrarlo en el certificado" / "No mostrarlo"; interruptor "Mostrar en mi perfil público" (deshabilitado con explicación si el perfil no es público); estado vacío: "Cuando una empresa que te contrató por WorkUco termine el trabajo, te puede dar un certificado. Te avisamos."
- [ ] **Step 4:** perfil público y sección de admin.
- [ ] **Step 5:** `node tools/test-ui-certificados.mjs` con el servidor de prueba: emitir desde el drawer, aceptar el comentario en Mi perfil, ver la verificación pública y el bloque en el perfil público, anular desde admin. Revisar a 375 px y en escritorio.
- [ ] **Step 6:** `npm test` → todo `ok`. **Commit** `feat(certificados): panel, Mi perfil, perfil público y admin`.

### Task 6: Cierre

- [ ] **Step 1:** sumar a `LEEME.md` una sección corta "Certificados de trabajo" (cómo se emiten, verifican y anulan).
- [ ] **Step 2:** sumar a la FAQ de `public/app.js` "¿Qué es un certificado de trabajo?" (2-3 líneas, sólo lo que hace la página).
- [ ] **Step 3:** revisión de Codex (`codex-review`, sólo lectura) sobre `git diff main..certificados`; decidir cada hallazgo.
- [ ] **Step 4:** `npm test` final → todo `ok`. **Commit** `docs(certificados): LEEME y FAQ`.
