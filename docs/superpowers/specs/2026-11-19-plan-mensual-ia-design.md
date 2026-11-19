# Plan mensual con IA incluida · diseño

## Por qué
Las empresas del Valle no van a conseguir ni cargar una clave de IA: hoy la IA de WorkUco (analizar postulantes,
redactar avisos, leer flyers) sólo funciona con la clave de cada empresa, así que casi nadie la usa. El dueño quiere
juntar varios beneficios en **un plan mensual**, más barato que la competencia y con margen, donde WorkUco pone la IA
(paga al proveedor) y cobra el plan. Es la primera fuente de ingreso fija; los avisos destacados sueltos y el Pack
Cosecha siguen aparte.

Referencia de precios (19/11/2026): un aviso de Computrabajo Essential cuesta $ 44.495 + IVA (60 días); un aviso
destacado de Bumeran, $ 31.464 + impuestos (30 días). Un uso de IA cuesta menos de US$ 0,001 con modelos baratos.

## Objetivos
1. **Plan mensual** por empresa, de **30 días**, pagado por Mercado Pago (cobro único que se renueva; ver Enfoques).
2. **Prueba gratis de lanzamiento**: cada empresa puede activar **una vez** 30 días gratis del plan.
3. **IA incluida sin clave** mientras el plan está activo: las tres funciones actuales usan la clave de WorkUco.
4. **Frenos de gasto** para que la IA nunca gaste más de lo previsto (ver "IA de WorkUco").
5. Beneficios del plan mientras está activo:
   - IA incluida: hasta **500 usos por mes** y **60 por día** por empresa.
   - **1 aviso destacado** todo el período; la empresa elige cuál y lo puede cambiar.
   - **100 invitaciones por día** (hoy 20; igual que el Pack Cosecha).
   - **Revisión en el día**: sus avisos salen primero en la cola de revisión del admin, con una marca.
   - **Ficha destacada** en la Guía del Valle, si la empresa tiene ficha publicada.
   - **Sello del plan** en la página pública de la empresa.
6. **Sin plan**: todo lo gratis queda igual, más **10 usos de IA de prueba** por empresa (una sola vez, no por mes).
7. **Panel del admin**: precio del plan, prender/apagar la venta, empresas con plan, y gasto de IA del día y del mes.

## No objetivos (son proyectos siguientes, en este orden)
- Requisitos indispensables y preguntas de filtro (proyecto 2; después se suma al plan).
- "El aviso sale a buscar gente" (proyecto 3).
- Página de sueldos del Valle y crear aviso pegando texto (proyecto 4).
- Aviso confidencial y "Te armamos la búsqueda" (proyecto 5).
- Suscripción con débito automático de Mercado Pago (se evalúa cuando haya empresas pagando; ver Enfoques).
- Facturación electrónica (la hace el dueño por fuera).

## Anti-objetivos
- Que un error o un abuso gaste el saldo del proveedor: **ningún camino puede llamar a la IA sin pasar por los topes**.
- Que lo gratis empeore: nada que hoy es gratis pasa a ser pago.
- Mandar al proveedor datos que identifiquen a la persona (nombre, teléfono, mail, DNI) cuando se usa la IA de WorkUco.
- Que una empresa pierda días de destacado o de Pack Cosecha por activar el plan, o al revés.
- Cobrar dos veces el mismo período o activar dos veces un mismo pago.

## Precios (los fija el admin; estos son los iniciales)
| Producto | Precio final (IVA incluido) |
|---|---|
| Plan mensual (30 días) | $ 24.900 |
| Destacado suelto 7 / 15 / 30 días | $ 6.900 / $ 11.900 / $ 18.900 |
| Pack Cosecha (30 días) | $ 49.900 |

El dueño no es monotributista: los precios se muestran **finales, con IVA incluido**. Los de destacados y Pack Cosecha
ya se cargan desde el admin (no cambia código, sólo la carga). El del plan es nuevo: `price_plan` en `admin_meta`,
y la venta se prende con `sell_plan` (igual que `price_cosecha` / `sell_cosecha`).

## Enfoques considerados (cómo se renueva cada mes)
- **A · Pase de 30 días que se paga y se renueva a mano** (elegido por el dueño):
  igual que el Pack Cosecha. La empresa paga 30 días; antes de que venzan le avisamos (panel y mail, 5 días y 1 día
  antes) con un botón "Renovar". Si renueva antes, los días se suman. Reusa todo lo que ya funciona (preferencia de
  pago, webhook, `settlePayment`), no hace falta otra integración, y a una empresa de temporada no le cobramos meses
  que no usa. En contra: depende de que la empresa renueve.
- **B · Suscripción de Mercado Pago con débito automático**: ingreso fijo sin que la empresa haga nada. En contra: otra
  integración (preapproval, eventos de suscripción, cancelaciones, tarjetas rechazadas), más casos raros y más
  pruebas. Conviene cuando haya varias empresas renovando todos los meses.
- **C · Créditos prepagos de IA**: descartado por el dueño; prefirió un plan mensual con varios beneficios.

## Cómo funciona

### Estado del plan
- En `companies`: `plan_until` (fecha en ms, o null), `plan_trial_used` (0/1), `ai_free_used` (usos gratis gastados).
- `store.planActive(companyId)`: `plan_until > ahora`.
- **Activar** (pago aprobado o prueba gratis): `plan_until = max(ahora, plan_until) + 30 días`.
- **Prueba gratis**: botón "Probar gratis 30 días" si `plan_trial_used = 0`; la marca en 1 y activa. Sólo empresas
  con al menos un aviso publicado o en revisión (evita cuentas vacías creadas para gastar IA).
  (Decisión de Claude) Se prende y apaga desde el admin con `trial_plan` en `admin_meta` (prendida por defecto
  mientras dure el lanzamiento; el dueño la apaga cuando quiera). No depende de `sell_plan`: se puede regalar la
  prueba antes de vender. Ni la prueba ni la venta se ofrecen si falta la clave de IA del servidor.
- **Columna vieja `companies.plan`** (`free`/`pro`/`premium`, decisión de Claude): hoy es sólo una etiqueta que el
  admin cambia a mano y no habilita nada. Se deja de mostrar y de editar en el admin y de mandar en `publicCompany`;
  la columna queda en la base sin uso (no se borra ni se migra). El único "plan" es el nuevo, por `plan_until`.
- **Vencimiento**: no hace falta tarea programada para apagar nada: todo pregunta `planActive`. Los avisos de "vence en
  5 días / 1 día" salen al cargar el panel o con el mismo mecanismo de notificaciones que usan los avisos destacados
  (lo decide quien implemente, sin repetir el mismo aviso).

### Pago
- `payments.kind = 'plan'`, `days = 30`, `amount = price_plan`. Ruta `POST /api/company/plan/checkout` (como
  `/api/company/cosecha/checkout`), devuelve la URL de pago.
- En `settlePayment`: rama `kind === 'plan'` → activar 30 días y notificar ("Tu plan está activo hasta el …").
  Mismas verificaciones de monto y moneda que hoy; `approvePayment` ya evita activar dos veces.
- La venta sólo está prendida si `sell_plan` está activo, hay precio, Mercado Pago conectado y dirección https pública
  (igual que `cosechaConfig`).

### IA de WorkUco (la parte crítica)
- **Clave del servidor**: variables `WORKUCO_PLAN_AI_PROVIDER`, `_KEY`, `_MODEL`, `_BASE`, leídas con el mismo
  `importConfig(env, 'WORKUCO_PLAN_AI')` que ya existe. El dueño la carga en el servidor; nunca se ve en el panel ni en
  el repo. Proveedor recomendado: Gemini Flash-Lite pago (no entrena con los datos de la API); se puede cambiar
  por DeepSeek u otro compatible con OpenAI sin tocar código. **Tiene que ser una clave sólo para WorkUco**, en una
  cuenta o proyecto aparte (no compartida con agentes como OpenClaw), con saldo prepago y sin recarga automática.
- **Qué configuración se usa** en cada llamada de empresa (`aiFor(company)`):
  1. Si la empresa tiene su propia clave cargada y activa → la suya (como hoy, sin topes de WorkUco).
  2. Si no, y tiene plan activo → la de WorkUco, con los topes del plan.
  3. Si no, y le quedan usos gratis (de 10) → la de WorkUco, gastando uno.
  4. Si no → error claro: "Activá el plan o probalo gratis 30 días" (con botón), nunca una llamada.
- **Un solo punto de paso**: todas las llamadas con la clave de WorkUco pasan por una función
  (`platformAi.run(companyId, kind, fn)`) que, en este orden: revisa el corte de emergencia, el tope global del día,
  el tope de la empresa (día y mes), **reserva** el uso antes de llamar (para que dos pedidos al mismo tiempo no
  pasen el tope), llama, y anota el resultado. Si la llamada falla, el uso reservado se devuelve.
- **Topes**:
  - Empresa con plan: 500 por mes (desde el inicio del período pagado o del mes calendario; lo decide quien implemente
    y lo deja escrito) y 60 por día.
  - Global de WorkUco: `WORKUCO_PLAN_AI_DAILY_MAX` (por defecto 2.000 usos por día).
  - **Corte de emergencia**: si hay más de `WORKUCO_PLAN_AI_BURST` (por defecto 120) usos en un minuto, la IA de WorkUco
    se pausa 15 minutos y se manda un mail al admin. Se puede despausar desde el admin.
- **Llamadas chicas**: el texto del CV se recorta a 12.000 caracteres; la respuesta tiene su límite actual por función;
  se usa un modelo sin razonamiento largo. Para Anthropic el código sube `max_tokens` a 16.000: con la clave de WorkUco
  eso no aplica (usar el límite de la función).
- **Datos personales**: con la clave de WorkUco, antes de mandar se quitan nombre, mails, teléfonos y números de
  documento del perfil y del CV (se reemplazan por "[dato quitado]"). Con la clave propia de la empresa sigue como hoy.
- **Registro de uso**: tabla `ai_usage` (empresa, función: `analisis` / `aviso` / `flyer`, tokens de entrada y salida
  si el proveedor los devuelve, costo estimado en US$, ok/error, fecha). Precio por millón de tokens en
  `WORKUCO_PLAN_AI_PRICE_IN` / `_OUT` (sólo para estimar).
- **Análisis automático** (decisión de Claude): con la clave de WorkUco viene **apagado** y la empresa lo prende en
  Panel → IA (aviso: "cada postulante nuevo gasta 1 uso"). Se usa una marca nueva `plan_ai_auto` (0 por defecto),
  porque `ai_auto` vale 1 por defecto y prendería el gasto sin que nadie lo pida. Con la clave propia sigue como hoy.
  Los 10 usos gratis **nunca** se gastan en automático, sólo con un clic. Si el tope se acabó, no corre y el panel
  dice "Se acabaron los usos de IA de este mes".
- **Freno por empresa** (decisión de Claude): además del corte global, una empresa no puede pasar de 10 usos por
  minuto; si lo pasa, sus pedidos esperan al minuto siguiente (los automáticos quedan en cola o se saltean, sin
  pausar la IA de las demás). El corte de emergencia global sube a 120 usos por minuto
  (`WORKUCO_PLAN_AI_BURST`), para que una sola empresa no frene a todas.

### Beneficios del plan
- **Destacado incluido**: en el panel, cada aviso publicado tiene "Usar el destacado del plan". Elegir otro le saca
  el del plan al anterior. Si el plan vence, el destacado del plan se termina con él.
  (Decisión de Claude) El destacado del plan **no toca** `featured`/`featured_until` del aviso: se guarda aparte
  (`companies.plan_job_id`) y un aviso cuenta como destacado si tiene su destacado propio vigente (pagado, Pack
  Cosecha o del admin) **o** es el `plan_job_id` de una empresa con plan activo. Así cambiar de aviso o que venza el
  plan nunca le quita días pagados a nadie. Las consultas que ordenan y marcan destacados (buscar, Wik Works,
  `/cosecha`, estadísticas de rendimiento) tienen que usar esa misma condición.
- **Invitaciones**: `inviteLimit` devuelve 100 con plan o Pack Cosecha.
- **Revisión en el día**: la lista de pendientes del admin ordena primero los avisos de empresas con plan y les pone
  una marca "Plan".
- **Guía**: si la empresa es dueña de una ficha publicada, se muestra destacada mientras el plan está activo (con la
  etiqueta "Destacado" que ya exige la política de la Guía).
- **Sello**: "Empresa con plan WorkUco" en `/empresa/<id>`. (El nombre comercial del plan lo elige el dueño; en el
  código, `plan`.)

### Pantallas
- **Página pública `/plan`**: qué incluye gratis vs. plan (tabla como la de este diseño), precio, prueba gratis, y
  comparación honesta con "un aviso en otros portales". Enlazada desde "Para empresas", el panel y los próximos pasos
  de publicar.
- **Panel → Resumen**: tarjeta "Tu plan" (activo hasta / usos de IA del mes / botón renovar o probar gratis), con el
  mismo estilo que la tarjeta del Pack Cosecha.
- **Panel → IA**: si no hay clave propia, en vez del formulario de clave muestra "IA de WorkUco" con los usos que
  quedan; el formulario de clave propia queda como opción avanzada.
- **Admin**: precio y venta del plan, lista de empresas con plan (hasta cuándo), gasto de IA (usos y US$ estimados de
  hoy y del mes, por función), estado del corte de emergencia con botón para reanudar, y "activar/quitar plan" manual.

## Restricciones
- Node 24 sin dependencias, `node:sqlite`, JS sin frameworks. `server.js` está en CRLF.
- El repo es público: ninguna clave, precio real de proveedor ni dato de empresa real en el código o las pruebas.
- No borrar ni regenerar `data/`; las columnas nuevas con `ensureColumn`.
- No promocionar el CV Pro. Mantener la animación de inicio.
- Textos en español rioplatense, sin tecnicismos para la empresa.

## Pruebas que tienen que existir (`tools/test-plan.js`, sumado a `npm test`)
- Prueba gratis: una vez por empresa; no se da a empresas sin avisos.
- Pago aprobado: activa 30 días; segundo aviso del mismo pago no suma; renovar antes suma días.
- Monto o moneda distintos: no activa.
- `aiFor`: clave propia > plan > usos gratis > error (sin llamada).
- Análisis automático: apagado por defecto con la clave de WorkUco; nunca gasta los usos gratis; freno de 10 por minuto
  por empresa sin pausar a las demás.
- Prueba gratis apagada desde el admin: no se ofrece; sin clave del servidor: ni prueba ni venta.
- La etiqueta vieja `plan` ya no aparece en el admin ni en la API pública.
- Topes: día y mes de la empresa, global, y corte de emergencia con proveedor falso; dos pedidos simultáneos no pasan
  el tope; una llamada fallida devuelve el uso.
- Datos personales: con la clave de WorkUco el texto enviado no tiene nombre, mail ni teléfono de la persona.
- Destacado del plan: no acorta un destacado pagado; termina al vencer el plan; cambiar de aviso funciona.
- Invitaciones 100 con plan; admin ve el gasto y puede reanudar el corte.

## Lo que queda para quien implemente
- Cómo contar el mes de los 500 usos (período pagado o mes calendario), dejándolo escrito.
- Cómo se disparan los avisos de vencimiento sin repetirlos.
- Detalles visuales de `/plan`, la tarjeta del panel y el admin, siguiendo el estilo actual (y la preferencia del
  dueño por diseños llamativos).
