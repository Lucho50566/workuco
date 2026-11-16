# Avisos destacados y estadísticas por aviso — Diseño corto

Fecha: 2026-11-16 · Aprobado en la conversación ("si armalo")

## Por qué
WorkUco va a cobrarles a las empresas por visibilidad (nunca por publicar ni a quien busca trabajo). Los primeros
1–2 meses todo es gratis para sumar empresas. Hace falta, ya desde ahora: el producto que se va a cobrar (aviso
destacado), datos reales para venderlo ("un destacado tiene N veces más vistas") y medir cuántas empresas lo quieren.

## Qué se construye
- **Destacado con vencimiento**: el admin destaca un aviso por 7, 15 o 30 días (o lo quita). Vencido, deja de estarlo solo.
  Mientras está vigente: sale primero en Buscar, en la portada y en Wik Works, y lleva la etiqueta "Destacado".
  Editar el aviso ya no le quita el destacado.
- **Pedido de destacado**: en su panel, la empresa toca "Pedir destacado" en un aviso publicado; el admin ve el pedido
  y decide. Durante el lanzamiento es gratis (lo dice el panel). Se puede cancelar.
- **Estadísticas por aviso** (panel de empresa): vistas totales, vistas de los últimos 7 días y postulaciones; si está
  destacado, hasta cuándo. Las visitas de la propia empresa y del admin no cuentan.
- **Admin**: elige los días al destacar, ve los pedidos, y ve la comparación de vistas por día de avisos destacados
  contra no destacados (últimos 30 días): el dato para vender.
- `WORKUCO_LAUNCH_FREE` (por defecto `1`): mientras esté en 1, el panel dice "Gratis durante el lanzamiento".

## Decisiones
- Columnas nuevas en `jobs`: `featured_until` (ms; null = sin vencimiento, para destacados viejos) y
  `featured_req_at`. Tabla `job_stats(job_id, day, views)` como `place_stats`.
- Vigente = `featured=1` y (`featured_until` null o futuro). Se calcula al leer; no hace falta tarea programada.

## No objetivos
- Cobrar (Mercado Pago, facturación, términos con precios): cuando el dueño decida empezar a cobrar.
- Que la empresa se destaque sola sin aprobación del admin.
