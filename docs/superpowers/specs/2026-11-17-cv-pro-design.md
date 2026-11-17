# CV Pro — "Mejorá tu CV" con IA (diseño)

Fecha: 17/11/2026 · Estado: para aprobar

## Intención

Que cualquier persona del Valle que busca trabajo pueda transformar su CV (o los datos de su perfil) en un CV
profesional, escrito y diseñado para ella, y que WorkUco cobre **$ 5.000** por ese servicio con Mercado Pago.
Es la **única excepción paga** para quien busca trabajo: el CV básico gratis (`/cv/:id`) sigue igual. Decisión del
dueño (17/11/2026).

Éxito = la persona ve antes de pagar que el CV nuevo es claramente mejor que el suyo, paga sin fricción, descarga
un PDF de una hoja que se imprime bien, y WorkUco recibe la plata en su Mercado Pago sin intervenir.

## Objetivos

- Subir el CV propio (PDF o foto) o partir de los datos del perfil.
- Análisis gratis: puntaje, **lista de lo que falta** y sugerencias concretas; la persona completa lo que falta ahí.
- Generación: la IA reescribe el contenido y elige **diseño, color y orden de secciones** según la persona
  (enfoque A acordado: plantillas propias + decisiones de la IA). Cada CV sale distinto pero siempre prolijo.
- Vista previa gratis antes de pagar; pago de $ 5.000 con Mercado Pago (integración existente); descarga limpia.
- El precio y "vender sí/no" se manejan desde el admin (pestaña Pagos).

## No-objetivos (por ahora)

- Diseños generados libremente por la IA (enfoque B, descartado: impredecible).
- Adjuntar el CV Pro automáticamente a las postulaciones (la persona descarga el PDF y lo sube en su perfil).
- Cartas de presentación, varios idiomas, CV para empresas.
- Generar el PDF en el servidor: se usa "Guardar como PDF" del navegador, como el CV gratis.

## Anti-objetivos (sería un fracaso aunque funcione)

- **Que la IA invente** empresas, cargos, fechas, títulos o logros que la persona no dio. Puede redactar mejor,
  ordenar y resumir; no agregar hechos. Si falta un dato, va a la lista de "lo que falta".
- Que se pueda obtener el CV completo sin pagar.
- Que se cobre y el CV no se pueda descargar (o se corte en dos hojas / quede desarmado).
- Que un uso abusivo dispare el gasto de IA.

## Restricciones

- Node 24 sin dependencias, SQLite, JS sin framework (como todo WorkUco). Español rioplatense.
- IA del servidor: la misma del importador (`WORKUCO_IMPORT_AI_*`, hoy Claude Opus 5.5). Si no está configurada,
  el servicio no se ofrece (no aparece la entrada y la API responde 503).
- Cobro: Mercado Pago Checkout Pro ya integrado (`lib/mp.js`, `settlePayment`, firma de avisos, https obligatorio).
- Ley 25.326: el texto del CV se manda al proveedor de IA → aviso y aceptación explícita antes del análisis. El
  archivo subido no se guarda: se extrae el texto y se descarta (las fotos se mandan a la IA y se descartan).
- Pruebas: con IA simulada (`WORKUCO_IMPORT_AI_FAKE=1`) y Mercado Pago simulado, como las suites actuales.

## Enfoques considerados

| | Enfoque | A favor | En contra |
|---|---|---|---|
| **A (elegido)** | La IA escribe y elige entre 6 diseños propios, color y orden de secciones | Cada CV distinto y siempre prolijo, imprimible en 1 hoja | Hay que diseñar y mantener 6 plantillas |
| B | La IA genera el HTML/CSS de cada CV | Único de verdad | Impredecible, se rompe al imprimir, riesgo al cobrar |
| C | Un solo diseño, sólo cambia el texto | Lo más simple | No cumple "que no siempre sea el mismo" |

## Cómo funciona

### Recorrido de la persona (`/cv-pro`, con sesión de persona)

1. **Entrada**: tarjeta "Mejorá tu CV con IA · $ 5.000" en Mi perfil, botón en la barra del CV gratis
   ("Mejoralo con IA") y sección en la portada para personas. Sin sesión → ingresar/crear cuenta y volver.
2. **Subir**: PDF (hasta 5 MB), foto/s del CV (hasta 3 imágenes, se achican en el navegador como ya se hace) o
   "Usar los datos de mi perfil". Casilla obligatoria: "Acepto que el contenido de mi CV se procese con IA".
3. **Análisis (gratis)**: puntaje 0–100, "Lo que tiene bien", **"Lo que falta"** (lista fija de controles, abajo) y
   sugerencias. Debajo, un formulario con **sólo los campos que faltan** para completarlos (todos opcionales).
4. **Vista previa (gratis)**: la IA genera el CV; se muestra en su diseño con marca de agua "Vista previa".
   Para que no se pueda sacar sin pagar, **el servidor no manda el contenido completo antes del pago**: van
   completos el encabezado, el resumen y la primera experiencia; del resto sólo títulos y la primera línea, con el
   resto reemplazado por barras grises. Se pueden pedir hasta **2 versiones más** antes de pagar.
5. **Pagar $ 5.000**: Mercado Pago (Checkout Pro). Al volver, se confirma el pago (igual que los destacados).
6. **Mi CV Pro**: CV completo, botón "Descargar PDF" (imprimir), cambiar diseño y color gratis, y **3 reescrituras
   con IA** incluidas (por ejemplo "orientalo a gastronomía"). Queda guardado en "Mi perfil → Mis CV".

### Lo que se controla ("Lo que falta")

Datos de contacto (teléfono, mail, localidad) · titular / puesto buscado · resumen profesional · experiencia con
empresa, cargo y fechas (mes/año) · tareas y logros concretos (con números si los hay) · estudios con institución y
año · habilidades (técnicas y blandas) · idiomas y nivel · carnet de conducir / movilidad · disponibilidad
(horario, temporada, mudanza) · referencias o "a disposición" · largo (1 hoja) · ortografía y redacción · foto
(opcional, sólo se sugiere). Cada control: `ok | falta | mejorable` con una frase de por qué.

### Diseños (6) y colores

`clasico` (administración, comercio), `moderno` (tecnología, ventas), `campo` (finca, obra, oficios), `servicio`
(gastronomía, turismo, atención), `creativo` (diseño, eventos, redes), `primer-empleo` (estudios y habilidades
primero). Paleta de 6 acentos fija (de la marca y neutros sobrios). Secciones posibles y su orden los elige la
IA entre: `resumen, experiencia, estudios, habilidades, idiomas, cursos, logros, voluntariado, disponibilidad,
referencias`. Todo A4, una hoja, imprimible; el texto se ajusta (tope de largos por campo).

### IA (dos pedidos, con salida JSON validada)

1. **Analizar** (texto o imágenes + perfil): devuelve datos extraídos (estructura de CV), rubro probable, puntaje,
   controles y sugerencias.
2. **Generar** (datos extraídos + lo que completó la persona + pedido opcional): devuelve el CV estructurado
   (`design`, `accent`, `sections[]`, `headline`, `summary`, `experience[{company, role, from, to, bullets[]}]`,
   `education[]`, `skills[]`, `languages[]`, extras).

El servidor valida todo contra listas fijas (diseño, color, secciones) y largos máximos, y **comprueba que no haya
hechos nuevos**: cada empresa, institución y cargo del CV generado tiene que aparecer (normalizado) en el texto
original, el perfil o lo que completó la persona; lo que no aparece se descarta. Las instrucciones a la IA lo
prohíben explícitamente y le piden escribir en español rioplatense neutro y profesional, en tercera persona
implícita, con verbos de acción.

### Datos

- Tabla `cv_orders`: `id, candidate_id, status (analizado | generado | pagado), source_kind (pdf | foto | perfil),
  source_text, extracted (JSON), analysis (JSON), inputs (JSON), cv (JSON), versions, rewrites_left, payment_id,
  price, created_at, updated_at, paid_at`. Se borra con la cuenta (borrado en cascada y "descargar mis datos").
- Pagos: la tabla `payments` pasa a ser general: columnas nuevas `kind` (`destacado | cv`) y `ref_id`; los de
  destacados quedan como `destacado`. `settlePayment` aplica según el tipo (destacado → destaca el aviso; cv →
  marca la orden como pagada). Los controles de referencia, monto, moneda y firma no cambian.
- Admin → Pagos: precio del CV Pro (por defecto $ 5.000) y "Vender CV Pro" (sí/no), y los pagos de CV en la lista
  con su tipo.

### Límites (para cuidar el gasto de IA)

3 análisis por día por cuenta · hasta 3 versiones antes de pagar por orden · 3 reescrituras después de pagar ·
tope de tamaño de archivo y de texto (60.000 caracteres, el mismo de `cvtext`).

### Casos borde

- PDF escaneado sin texto → pedir fotos del CV.
- IA caída o sin configurar → mensaje claro, no se cobra; si se pagó y la generación falla, el CV ya generado en la
  vista previa es el que se entrega (el pago se hace sobre una versión ya generada).
- Precio cambiado mientras la persona está en el proceso → se cobra el precio guardado en la orden al pagar.
- Pago rechazado/pendiente → la orden queda "generado" y se puede reintentar.
- Devoluciones: manuales desde Mercado Pago; el admin ve el estado. Los términos suman el servicio, su precio y el
  botón de arrepentimiento.

## Lo que queda a criterio de quien construye

Textos finales de pantalla, detalles visuales de cada diseño dentro de la línea de la marca, nombres internos,
y cómo se reparten las funciones entre `lib/` y `server.js` (siguiendo el estilo existente: un `lib/cvpro.js`).

## Decisiones tomadas por Claude (para revisar)

- Nombre "CV Pro" ("Mejorá tu CV con IA").
- Ocultar parte del contenido en la vista previa (en vez de sólo marca de agua) para que no se pueda obtener gratis.
- 2 versiones extra antes de pagar y 3 reescrituras después; análisis 3 por día.
- Sólo personas con cuenta (para guardar la orden y el pago).
- No guardar el archivo subido, sólo el texto extraído.
