# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Personas que buscan trabajo en el Valle de Uco** (San Carlos, Tunuyán, Tupungato, Mendoza): operarios de bodega y finca, gastronomía, comercio, turismo, construcción, administración. Muchas usan el celular, a veces sin CV armado. Su trabajo: encontrar algo cerca, saber si les conviene, postularse rápido y saber si les van a contestar.
- **Empleadores del Valle**: bodegas, fincas, posadas, cafés, comercios, constructoras, estudios. PyMEs sin área de RR. HH. Su trabajo: publicar rápido, encontrar gente disponible y ordenar postulantes sin perder tiempo.
- **Administración de WorkUco**: aprueba avisos, verifica empresas.

## Product Purpose

Un portal de empleo local que conecta a la gente del Valle de Uco con las empresas del Valle. Éxito: que una persona encuentre en minutos ofertas cercanas y compatibles y reciba respuesta, y que una empresa cubra un puesto (incluidas changas de temporada) sin intermediarios.

## Positioning

Es el portal del Valle de Uco, no un portal nacional: tres localidades, rubros de la zona (vendimia, cosecha, poda, turismo enológico), changas por jornada, compatibilidad calculada contra el perfil, base de talento disponible e insignia de cuánto responde cada empresa.

## Operating Context

- Postulación en un toque con el perfil; CV WorkUco imprimible para quien no tiene CV.
- Empresas: wizard de 4 pasos con plantillas por rubro, Kanban de postulantes, mensajes rápidos por WhatsApp, IA opcional con la API key de cada empresa.
- Notificaciones dentro del sitio (no se envían emails). Alertas de búsqueda.
- Temporada: la vendimia y la cosecha mueven la demanda de changas.

## Capabilities and Constraints

- Node 24 + SQLite (`node:sqlite`), HTML/CSS/JS sin dependencias ni build. Deploy en Render (plan free).
- Teléfono y email de una persona nunca son públicos; las empresas los ven sólo cuando la persona se postula.
- Español rioplatense con voseo.
- No hay pagos ni emails (a propósito).

## Brand Commitments

- Nombre **WorkUco** y logo propio: una sola línea que es la W de WorkUco, los picos de la cordillera del Valle de Uco y, con el punto lima (cabeza / sol), una persona con los brazos en alto. Vive en SVG (`brandMark` en `server.js`, `public/favicon.svg`); los PNG se generan con `node tools/make-logo.mjs`. Verde de marca `#0a8263`.
- Voz cercana y directa, de la zona ("acá nomás"), sin tecnicismos.

## Evidence on Hand

- Empresas, personas, ofertas y postulaciones de la demo son **ficticias** (`lib/demo.js`, emails `@demo.workuco`); no presentarlas como clientes reales.
- No hay testimonios, métricas de uso, prensa ni fotos reales del Valle. No inventarlos; los conteos visibles salen de la base.

## Product Principles

1. Lo local primero: cerca, en tu localidad, en los rubros del Valle.
2. Nadie se queda sin respuesta: cada cambio de etapa se avisa.
3. Menos formularios: el perfil hace el trabajo una sola vez.
4. Transparencia: sueldo visible, compatibilidad explicada, respuesta de la empresa a la vista.
5. Funciona en un celular con poca señal.

## Accessibility & Inclusion

Usuarios con distinto nivel de alfabetización digital: textos simples, botones grandes (≥44 px), contraste AA, funciona con teclado y con `prefers-reduced-motion`.
