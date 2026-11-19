# Pack Cosecha · diseño

## Por qué
De febrero a abril las bodegas y fincas del Valle necesitan mucha gente rápido y hoy la buscan a mano en
grupos. El Pack Cosecha es la primera fuente de ingreso pensada para que la empresa pague porque le ahorra
trabajo: en un solo pago, todos sus avisos de cosecha arriba, más invitaciones a gente disponible y una
página propia de la temporada que WorkUco difunde en redes.

## Objetivos
- Un pack por empresa, de **30 días**, que se paga una vez (Mercado Pago) o se pide gratis durante el lanzamiento.
- Mientras está activo:
  1. **Avisos de cosecha destacados**: los avisos publicados de la empresa que son de **Agricultura** o
     **changa** (`gig`), hasta **5**, quedan destacados hasta que vence el pack.
  2. **Invitaciones**: el tope diario pasa de 20 (`INVITE_LIMIT`) a **100**.
  3. **Sello "Cosecha"** en esos avisos (tarjetas, aviso y página `/cosecha`).
- Página pública **`/cosecha`**: todos los avisos publicados de Agricultura o changa del Valle; primero los
  destacados, después los más nuevos. Sirve sin pack (gratis para todos); el pack hace salir arriba.

## No objetivos
- Fechas de temporada automáticas: el admin decide cuándo se vende (prende/apaga la venta).
- Packs de otros rubros, planes mensuales o facturación.
- Cambiar cómo se destacan avisos sueltos (sigue igual).

## Anti-objetivos
- Que el pack prometa resultados que no puede cumplir (nada de "garantizamos X postulantes").
- Que un aviso que ya estaba destacado por más tiempo pierda días por entrar al pack.
- Que el admin tenga que destacar a mano cada aviso del pack.

## Enfoques considerados
- **A · Pack de temporada con todo incluido** (elegido por el dueño): destacados + invitaciones + página `/cosecha` + sello.
- B · Pack de destacados con descuento (5 por el precio de 3): más simple, pero se parece a lo que ya existe y no ahorra trabajo.

## Cómo funciona

### Datos
- `companies`: columnas nuevas `cosecha_until INTEGER` (fin del pack) y `cosecha_req_at INTEGER` (pedido gratis).
- `admin_meta`: `price_cosecha` (pesos) y `sell_cosecha` ('1'/'0').
- `payments`: se reutiliza con `kind='cosecha'`, `job_id` vacío, `days=30`.
- Pack activo = `cosecha_until > ahora`.

### Activar / extender (una sola función, `activateCosecha(companyId, days)`)
- `cosecha_until = max(ahora, cosecha_until vigente) + days` (si paga de nuevo, se suma).
- Destaca hasta 5 avisos elegibles (publicados, Agricultura o changa, sin cerrar), los más nuevos primero:
  `featured_until = max(featured_until actual, cosecha_until)`; un destacado sin vencimiento queda igual.
- Borra el pedido (`cosecha_req_at`) y avisa a la empresa (campanita).
- Cuando el admin **aprueba** un aviso elegible de una empresa con pack activo y tiene menos de 5 avisos
  del pack destacados, ese aviso también se destaca hasta el fin del pack.

### Cobro
- Venta habilitada = `sell_cosecha` + precio > 0 + Mercado Pago conectado + dirección pública https
  (mismas condiciones que los destacados).
- `POST /api/company/cosecha/checkout` → crea el pago y la preferencia; vuelve al panel.
- `settlePayment` con `kind='cosecha'` → `activateCosecha(company, 30)` una sola vez por pago (misma
  protección que hoy: monto y moneda verificados, `approvePayment` idempotente).
- Sin venta habilitada (lanzamiento): `POST /api/company/cosecha/request` pide el pack; `DELETE` lo cancela.

### Admin
- Configuración de cobros: precio del Pack Cosecha y "Vender Pack Cosecha".
- Empresas: muestra "Pidió Pack Cosecha" y el pack vigente; `PATCH /api/admin/companies/:id { cosechaDays: 30 | null }`
  lo activa (o lo quita: `cosecha_until = ahora`, los avisos quedan destacados hasta la fecha que tenían).

### Panel de empresa
- Tarjeta "Pack Cosecha" en Resumen: qué incluye, estado (activo hasta X / pedido / disponible) y el botón
  (pagar con Mercado Pago, o "Pedir gratis" durante el lanzamiento). Se muestra siempre que la empresa
  tenga o pueda tener avisos de Agricultura o changa (no se esconde: es la vidriera del pack).
- Las invitaciones muestran el tope de 100 cuando el pack está activo.

### Página `/cosecha`
- Título "Cosecha en el Valle de Uco", bajada, filtro por localidad, lista con las tarjetas de avisos de
  siempre (con sello "Cosecha" en los del pack) y llamada para empresas ("¿Necesitás gente? Pack Cosecha").
- `GET /api/jobs?cosecha=1` (o equivalente) para listar; entra al mapa del sitio y al menú de Changas.

## Lo que decide quien construye
- Textos finales de la tarjeta y la página, ubicación exacta en el panel, estilos (siguiendo los existentes).
- Si la página `/cosecha` reutiliza `buscar.html` con un filtro o es propia.

## Pruebas
- Activar destaca hasta 5 elegibles y no acorta destacados más largos; extender suma días.
- Aprobación de un aviso nuevo durante el pack lo destaca; el sexto no.
- Tope de invitaciones 100 con pack, 20 sin pack.
- Pago aprobado activa una sola vez; monto incorrecto no activa; otra empresa no puede pagar/pedir por otra.
- Pedido gratis / cancelar / admin activa y quita.
- `/cosecha` lista sólo Agricultura o changa publicados, destacados primero, y marca el sello.
