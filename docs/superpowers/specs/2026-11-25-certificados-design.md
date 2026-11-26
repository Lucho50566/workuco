# Certificados de trabajo — diseño

Fecha: 2026-11-25 · Rama: `certificados`

## Para qué

En el Valle de Uco mucho trabajo es informal o por temporada. La gente no tiene cómo demostrar dónde trabajó. Con WorkUco, una empresa que contrató a alguien por la página le puede dar un **certificado de trabajo verificable**. La persona lo descarga y lo muestra en su próxima búsqueda, y quien lo recibe comprueba en segundos que es real.

Para WorkUco es un motivo concreto para que las empresas contraten por la página y las personas se postulen por acá.

## Objetivos

- La empresa emite un certificado **cuando el trabajo terminó**, para alguien que contrató a través de una postulación en WorkUco.
- La persona lo ve en *Mi perfil*, lo imprime o lo guarda como PDF, y decide si lo muestra en su perfil público.
- Cualquiera lo verifica con un **código** o un **QR** en `workuco.com.ar/certificado/<código>`.
- La empresa puede sumar un **comentario opcional**. Sólo se muestra si la persona lo acepta.

## No objetivos (por ahora)

- Certificados para Changas de vecinos. Las changas publicadas por empresas en `/changas` sí entran, porque son avisos comunes.
- Certificados para postulantes sin cuenta: invitados o personas dadas de alta a mano por la empresa.
- Puntajes o estrellas.
- PDF generado en el servidor.
- Que la persona pida el certificado desde su lado. Se puede sumar después.

## Anti-objetivos (si pasa esto, salió mal aunque funcione)

- Que una empresa pueda certificar a alguien que no contrató por WorkUco.
- Que aparezca un comentario negativo o no aceptado sobre una persona.
- Que el certificado muestre DNI, teléfono, mail o domicilio.
- Que las páginas de certificados aparezcan en Google.
- Que un certificado anulado siga apareciendo como válido.

## Restricciones

- Mismo stack: Node 24, `node:sqlite` en `lib/store.js`, JS sin frameworks, sin dependencias de npm.
- Única excepción aprobada: un archivo de un generador de QR de licencia libre, servido desde `public/` (no desde una CDN externa).
- Las reglas de privacidad de siempre. Lo que se hace con el Botón de baja se respeta.
- Estilo visual de la marca: noche `#0b1612`, lima `#c8f560`, crema `#f5f1e6`, tipografía Bricolage Grotesque.

## Enfoques considerados

1. **Código y link, sin QR.** Es lo más simple, pero obliga a tipear el código cuando se tiene en papel.
2. **Código, link y QR, con un archivo libre de QR servido por WorkUco.** ← **Elegido por el dueño.** Escanear es mucho más fácil, y el QR se dibuja en el navegador sin servicios externos.
3. **PDF generado en el servidor.** Descartado: es mucho más trabajo para el mismo resultado que "Guardar como PDF".

## Cómo funciona (decidido con el dueño)

### Quién confirma y cuándo
**La empresa confirma cuando el trabajo terminó.** No se genera automáticamente al pasar a "Contratado".

### Emisión (panel de empresa)
- En una postulación en etapa **Contratado** de una persona **con cuenta**, aparece el botón **"Terminó el trabajo · Dar certificado"**. Sólo lo ven empresas con cuenta propia; un aviso importado sin reclamar no puede emitir.
- El formulario pide:
  - **Puesto:** viene completado con el título del aviso y se puede editar, hasta 80 caracteres.
  - **Desde y hasta:** fechas en formato `AAAA-MM-DD`.
  - **Comentario:** opcional, hasta 280 caracteres, sobre cómo trabajó la persona. El formulario aclara que la persona lo ve antes y decide si se muestra.
- Validaciones: fechas reales, "desde" no posterior a "hasta", "hasta" no futura, "desde" no anterior a la fecha de la postulación menos 1 día. El comentario no lleva teléfonos, mails ni links (mismo criterio que `hasContactData` de vecinos).
- **Un certificado vigente por postulación.** Si la empresa se equivocó, lo anula y emite uno nuevo.

### La persona
- Le llega un aviso por campanita y mail: "{Empresa} te dio un certificado de trabajo", con link a *Mi perfil*. Es un aviso de tipo `postulaciones`, así que respeta las preferencias de mail.
- En *Mi perfil* aparece una sección o pestaña **"Certificados"**, con la lista y un botón **Ver / Descargar** para cada uno.
- Si hay comentario, lo ve con dos botones: **"Mostrarlo en el certificado"** o **"No mostrarlo"**. Mientras no decide, el comentario **no se muestra** en ningún lado. Puede cambiar de opinión cuando quiera.
- Interruptor **"Mostrar en mi perfil público"**, apagado por defecto. Si lo prende y su perfil es público, el certificado aparece ahí con link a la verificación.
- No puede editar el contenido del certificado.

### El certificado (página imprimible)
- Ruta: `/certificado/<código>`. Es la misma página para ver, imprimir y verificar. Lleva `noindex` y no va en el sitemap.
- Contenido:
  - "Certificado de trabajo" y la marca WorkUco;
  - nombre de la persona, puesto, empresa, localidad del aviso, período "del … al …" y fecha de emisión;
  - el comentario, sólo si la persona lo aceptó;
  - el código y el QR que apunta a la misma URL;
  - un texto aclaratorio: "Emitido por {Empresa} a través de WorkUco. WorkUco verifica que la empresa contrató a la persona mediante una postulación en la plataforma; los datos del período y el comentario son responsabilidad de la empresa."
- Botón **"Descargar / imprimir"**, que usa `window.print()` con estilos de impresión en una sola hoja A4. El botón no sale impreso.
- Estado **anulado**: la página muestra claramente "Este certificado fue anulado por la empresa", sin los datos de la persona.
- Un código que no existe da el 404 común.

### Código
- 8 caracteres de un alfabeto sin ambiguos (sin 0/O, 1/I/L), mostrados como `XXXX-XXXX`. Se generan con `crypto` y se verifica que no choquen.
- La URL acepta el código con o sin guion y en minúsculas.

### Anulación
- La empresa puede anular un certificado desde la misma postulación, indicando un motivo interno que no se muestra. A la persona le llega un aviso.

### Qué pasa al borrar cosas
- **La persona se da de baja:** se borran todos sus certificados. Son datos personales.
- **La empresa borra la cuenta o se borra el aviso:** los certificados **siguen valiendo**. Guardan una copia de los datos (empresa, puesto, localidad, período) al momento de emitirse, y no dependen de que el aviso o la empresa sigan existiendo.
- **El admin** ve los certificados en el panel de admin, en la ficha de la persona o en una lista simple, y puede anularlos (por ejemplo, ante una denuncia).

### Datos (tabla nueva `certificates`)
- `id`, `code` (único), `application_id` (sin FK), `candidate_id`, `company_id` (puede quedar huérfano)
- Copias al emitir: `person_name`, `company_name`, `position`, `locality`, `job_id`
- `start_date`, `end_date`, `comment`, `comment_status` (`none` / `pending` / `shown` / `hidden`), `on_profile` (0/1)
- `status` (`valid` / `revoked`), `revoked_by` (`company` / `admin`), `revoke_reason`, `issued_at`, `revoked_at`

### Avisos
- Al emitir: a la persona, por campanita y mail.
- Al anular: a la persona, por campanita y mail.
- El dueño de WorkUco **no** recibe mails por esto (lo pidió así).

## Decisiones tras la revisión (tomadas por Claude, el dueño puede cambiarlas)

1. **"Con cuenta" significa que la postulación tiene `candidate_id`.** Las postulaciones hechas como invitado, aunque coincida el mail con una cuenta, no habilitan el certificado. El mail de un invitado no está verificado, y atarlo por mail podría certificar a otra persona.
2. **La empresa tiene una lista "Certificados emitidos"** en su panel, que no depende de la postulación. Desde ahí ve y anula sus certificados aunque el aviso se haya borrado. `application_id` se guarda **sin FK** (es sólo una referencia). La regla "un vigente por postulación" se controla con `application_id` mientras exista.
3. **Si el admin anula un certificado, la empresa no puede reemitirlo para esa postulación.** Se guarda `revoked_by` (`company` o `admin`). La persona recibe "fue anulado por WorkUco" en lugar de "por la empresa".
4. **`person_name` sale del nombre de la cuenta de la persona,** no del nombre de la postulación, que la empresa puede editar.
5. **Si una empresa reclama un aviso importado,** puede certificar a quienes ya estaban en "Contratado". El control mira si la empresa tiene cuenta propia al momento de emitir, no al momento de contratar.

## Lo que queda a criterio de quien lo construya

- La biblioteca de QR exacta, siempre que tenga licencia libre (MIT o similar), sea un solo archivo y no haga pedidos a la red.
- Dónde exactamente va el botón dentro del detalle de la postulación en el panel, y si "Certificados" es una pestaña propia o una sección de *Mi perfil*.
- El diseño visual del certificado, dentro de la marca. Tiene que verse formal y prolijo impreso en blanco y negro.
- Las rutas de API concretas y los nombres de las funciones, siguiendo el estilo de `server.js` y `lib/store.js`.
- Las pruebas: se espera un `tools/test-certificados.js` sumado a `npm test`, con las validaciones, los permisos, la privacidad del comentario, la anulación y el borrado en cascada.
