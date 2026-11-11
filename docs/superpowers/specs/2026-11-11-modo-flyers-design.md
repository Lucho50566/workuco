# Workuco — modo flyers y varios flyers por aviso

Fecha: 2026-11-11 · Rama: `v4-importados`

## Objetivo

Los flyers son lo que más se usa y más llama la atención en el Valle. Tres cambios:
1. Un aviso puede tener **hasta 5 flyers**.
2. Los flyers se ven **siempre completos** (sin recortes) en tarjetas y detalle.
3. **Modo flyers** (`/flyers`): ver avisos de a uno a pantalla completa, deslizando como TikTok,
   con "Me interesa" → aviso completo.

Decisiones del dueño: primero los avisos con flyer y después el resto con un flyer generado;
acciones Me interesa, Guardar, Compartir; filtro por localidad y changas.

## Fuera de alcance

Video, reordenar flyers arrastrando, estadísticas de vistas por flyer, comentarios o "me gusta".

## 1. Datos

- Columna nueva `jobs.flyers TEXT` (JSON con nombres de archivo, máximo 5, en orden).
- Migración: los avisos con `flyer_file` y `flyers` vacío pasan a `flyers = [flyer_file]`.
  `flyer_file` queda como el primero (compatibilidad), siempre igual a `flyers[0]` o null.
- JSON de oferta: `flyers: [url…]` y `flyer` = `flyers[0] || null` (se mantiene).

## 2. API

- `POST /api/company/jobs` acepta `flyers: [dataUrl…]` (máx. 5; cada uno validado con `saveImage`,
  prefijo `flyer`). Sigue aceptando `flyer` (uno) por compatibilidad.
- `PUT /api/company/jobs/:id`: `keepFlyers: [url…]` (los que siguen, en orden, sólo de los que ya
  tenía el aviso) + `flyers: [dataUrl…]` nuevos al final. Sin `keepFlyers` ni `flyers` ni
  `removeFlyer` → se conservan todos. Total > 5 → 400.
- La regla de descripción corta (20 caracteres) aplica si queda al menos un flyer.
- `POST /api/admin/import/publish` sigue con un `flyer`.
- `GET /api/jobs?sort=flyer`: primero los que tienen flyer (más nuevos primero), después el resto
  (destacados y más nuevos primero). Combina con `locality` y `gig`.
- Los flyers de un aviso nunca se borran del disco al editar (otros avisos duplicados pueden
  usarlos); sólo se dejan de referenciar.

## 3. Pantallas

- **Wizard (paso 2):** "Subir flyers" con selección múltiple; miniaturas en fila con botón para
  quitar cada una; contador "N de 5". "Completar el aviso con el flyer" usa el primero.
- **Tarjeta (`jobCard`):** portada de 220 px con el primer flyer **completo** (`object-fit: contain`)
  sobre la misma imagen desenfocada de fondo; indicador "+N" si hay más flyers.
- **Detalle:** carrusel horizontal (scroll-snap) con todos los flyers completos, puntos, flechas en
  escritorio; cada flyer abre la imagen grande.
- **Modo flyers `/flyers`:**
  - Pantalla completa, contenedor vertical con `scroll-snap-type: y mandatory`; una diapositiva por
    aviso (100dvh menos el encabezado).
  - Flyers del aviso en un carrusel horizontal interno con puntos; imagen completa sobre fondo
    desenfocado de sí misma.
  - Avisos sin flyer: flyer generado en HTML con el estilo del sitio (puesto grande, empresa,
    localidad, sueldo, "Changa" si corresponde) sobre fondo noche con cordillera.
  - Capa inferior con puesto, empresa · localidad, sueldo.
  - Riel derecho: **Me interesa** (→ `/oferta/:id`), **Guardar** (persona logueada; si no,
    lleva a `/acceder?rol=empleado&next=/flyers`), **Compartir** (`navigator.share` o WhatsApp).
  - Filtros arriba: Todo el Valle · San Carlos · Tunuyán · Tupungato · Changas (recargan el feed).
  - Carga de a 10 con `IntersectionObserver` al acercarse al final; estado vacío y de error.
  - Escritorio: columna central 9:16 (máx. 460 px de ancho) con fondo desenfocado del aviso
    actual; flechas ↑/↓ y rueda del mouse avanzan de a uno.
  - `prefers-reduced-motion`: sin `scroll-behavior: smooth` ni transiciones.
  - Accesible: cada diapositiva es un `article` con encabezado; flyers con `alt`
    "Flyer: <puesto> en <empresa>"; botones con texto visible o `aria-label`.
- **Entradas:** ítem "Flyers" en el menú; botón "Ver en modo flyers" en la home y en Buscar empleo.

## 4. Pruebas

- `tools/test-v4.js`: alta con 2 flyers → `flyers.length === 2` y `flyer === flyers[0]`; 6 flyers → 400;
  editar sin campos de flyer conserva los 2; `keepFlyers` con uno + 1 nuevo → 2 en ese orden;
  `keepFlyers` con una URL ajena se ignora; `removeFlyer` deja 0; aviso migrado desde `flyer_file`
  devuelve `flyers` con 1; `sort=flyer` devuelve todos los con flyer antes que los sin flyer y
  respeta `locality`/`gig`.
- `tools/test-ui-v4.mjs`: subir 2 flyers en el wizard y publicar; `/flyers` en 390 y 1440 sin
  desbordes; la primera diapositiva es un aviso con flyer; avanzar con la flecha ↓ cambia de aviso;
  "Me interesa" lleva al detalle correcto; Guardar sin sesión lleva a acceder; filtro Tupungato
  sólo muestra avisos de Tupungato; tarjeta muestra el flyer sin recorte (`object-fit: contain`);
  sin errores de JS.
