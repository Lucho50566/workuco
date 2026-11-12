---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/styles.css","public/app.js"]
---

Scope: home (`/`) of WorkUco, plus the shared site chrome (header, footer, cards) every public page inherits. Visitor mode: Persuade.

Audience: personas del Valle de Uco que buscan trabajo (mayoría en celular) y empleadores PyME. Action: buscar empleo (buscador funcionando en el primer viewport) o, con el interruptor, publicar/encontrar talento. Proof: ofertas, changas y conteos reales de la base; nada inventado.

Constraints: dirección fijada por el spec aprobado por el usuario (docs/superpowers/specs/2026-11-10-workuco-v3-design.md): "el Valle de noche". Sin build, sin dependencias. Sin generación de imágenes: build code-led.

## Direction contract

THESIS: La home es el Valle mismo de noche: la cordillera en capas y las tres localidades como luces encendidas con su número real de búsquedas abiertas. Rechaza la plantilla del rubro: titular centrado + buscador + fila de tarjetas iguales sobre fondo claro.

OWN-WORLD: Verde noche #0b1612 / #12241d como suelo de las bandas grandes, crema #f5f1e6 para leer, lima #c8f560 como luz (acción primaria, números vivos), malbec #7a1f4d para changas y destacados, verde marca #0a8263 sobre claro. Display Bricolage Grotesque 800, texto Inter. Siluetas de cordillera en capas planas (geometría, no ilustración), radios 14–18 px, sombras con desplazamiento suave, sin brillos.

STORY: El visitante ve que es del Valle (no un portal nacional), que hay trabajo cerca hoy y cuánto, busca o activa "Quiero contratar", entiende compatibilidad, changas y respuesta de empresas, y se registra o publica.

FIRST VIEWPORT: Banda noche a casi pantalla completa. Arriba-izquierda titular display enorme en 2–3 líneas con palabra rotativa en lima ("Trabajo en la *bodega* / *cocina* / *finca*… acá nomás"). Debajo el interruptor de dos estados (Busco trabajo / Quiero contratar) y el buscador funcionando (puesto + localidad + botón lima). Abajo, ocupando todo el ancho, la cordillera en tres capas con los pueblos San Carlos, Tunuyán y Tupungato marcados en el pie del valle con su conteo real; cada uno es un link a /buscar?locality=.

FORM: Valle de noche con mapa de luces (dirección fijada por el usuario en el spec aprobado; el sorteo se corrió sólo como registro y no la reemplaza; posición 1 de 1). seed:4b28a2d8a06c1a8a. Signature interaction: el interruptor de rol cambia titular, buscador y bloques de la home con transición de recorte; las luces de los pueblos laten suave y los contadores suben al entrar. Motion grammar: ease-out exponencial, una entrada orquestada en el hero, parallax leve de capas al hacer scroll; todo apagado con prefers-reduced-motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
