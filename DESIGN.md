---
name: WorkUco
description: El portal de empleo del Valle de Uco, de noche y con las luces de los pueblos encendidas.
colors:
  night: "#0b1612"
  night-2: "#12241d"
  night-3: "#1b3229"
  night-text: "#e8efe9"
  night-muted: "#a9bcb1"
  lime: "#c8f560"
  lime-2: "#b3e24a"
  malbec: "#7a1f4d"
  malbec-2: "#5e1639"
  malbec-soft: "#f5e6ee"
  brand-green: "#0a8263"
  brand-green-dark: "#076a51"
  green-soft: "#e6f7f0"
  cream: "#f5f1e6"
  cream-2: "#ece6d6"
  bg-warm: "#faf6ec"
  surface: "#fffdf8"
  surface-2: "#f0eadc"
  surface-3: "#e6dfcd"
  ink: "#0f1a15"
  text: "#1c2822"
  muted: "#56615a"
  line: "#e3dbc9"
  line-strong: "#cfc4ad"
  amber: "#a4690a"
  amber-soft: "#fdf2df"
  red: "#b3261e"
  red-soft: "#fdeceb"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(42px, 6.8vw, 92px)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage Grotesque, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(30px, 4.2vw, 52px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Bricolage Grotesque, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18.5px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "Bricolage Grotesque, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(24px, 2.4vw, 30px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 650
    lineHeight: 1.2
rounded:
  xs: "9px"
  input: "10px"
  sm: "12px"
  card: "16px"
  lg: "18px"
  pill: "999px"
spacing:
  gutter: "24px"
  grid-gap: "16px"
  card-padding: "20px"
  section: "clamp(56px, 7vw, 92px)"
  container: "1180px"
components:
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.night}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-lime-hover:
    backgroundColor: "#d6fb7c"
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.brand-green-dark}"
  button-night:
    backgroundColor: "{colors.night}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "10px 12px"
    height: "44px"
  chip-filter-on:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    height: "42px"
  job-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  gig-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "20px"
  match-pill:
    backgroundColor: "#e8f7c4"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "4px 10px 4px 5px"
  badge-gig:
    backgroundColor: "{colors.night}"
    textColor: "{colors.lime}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  badge-featured:
    backgroundColor: "{colors.malbec}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
---

# Design System: WorkUco

## Overview

**Creative North Star: "El Valle de noche"**

WorkUco es el Valle de Uco visto de noche: bandas grandes de verde casi negro donde la cordillera se recorta en capas planas y los pueblos son luces lima encendidas con su número real de búsquedas. Entre esas bandas, el contenido se lee sobre crema cálida, nunca sobre blanco frío. La noche es el escenario; la crema es la mesa de trabajo.

El sistema alterna dos registros. Las bandas de noche (hero, cierre, footer, encabezado de /changas) son tipográficas y enormes: Bricolage Grotesque a 800 con interlineado apretado, una palabra o una cifra en lima. Las zonas crema son densas y prácticas: tarjetas de 16px de radio, chips en píldora, cifras tabulares. El malbec aparece como una banda entera para las changas, no como acento disperso.

La geometría es plana: siluetas de cordillera en tres capas de verde (`#17302a`, `#2a463d`, `#12261f`) que cierran sobre la crema, sin ilustración, sin degradados de brillo, sin fotos inventadas del Valle. El movimiento se concentra en la entrada del hero; el resto responde a interacción y se apaga con `prefers-reduced-motion`.

**Key Characteristics:**
- Bandas de noche a todo el ancho alternadas con crema; nunca fondo blanco puro.
- Lima como luz: acción primaria sobre noche, números vivos, estado activo.
- Malbec reservado a changas y a lo destacado.
- Cordillera en capas planas como firma recurrente (hero, cierre, portadas sin foto).
- Display enorme y apretado; cuerpo en Inter legible a 16px.
- Sombras blandas desplazadas hacia abajo, sólo en hover o en objetos flotantes.

## Colors

Noche profunda, crema cálida y dos voces fuertes: lima como luz y malbec como vino.

### Primary
- **Lima Farol** (lime): la luz del sistema. Botón primario sobre noche, palabra rotativa del titular, pulsos de los pueblos, cintas de rubros, chip de filtro activo, contadores (campanita, pestañas), anillo de foto de perfil. Sobre noche siempre con texto noche encima, nunca blanco.
- **Verde WorkUco** (brand-green): verde de marca comprometido en PRODUCT.md. Acción primaria sobre crema (botón, links con flecha, foco, numerales de pasos, interruptores encendidos, anillo de compatibilidad).

### Secondary
- **Malbec** (malbec): banda de changas, cifra de pago de cada changa, insignia "Destacada", franja de modo demostración. Su variante suave (malbec-soft) sólo como fondo de la etiqueta "Empieza en N días" y del bloque de changa en el wizard.

### Neutral
- **Noche** (night): suelo de las bandas grandes, header, footer, chips de filtro activos sobre crema.
- **Noche 2 / Noche 3** (night-2, night-3): capas internas sobre noche (pista del interruptor de rol, degradado de portada de tarjeta).
- **Texto nocturno / Niebla** (night-text, night-muted): lectura y texto secundario sobre noche.
- **Crema** (cream): fondo de página y suelo del valle en la silueta.
- **Papel** (surface): tarjetas, campos, paneles.
- **Arena 2 / Arena 3** (surface-2, surface-3): insignias neutras, fondos de íconos, interruptor apagado.
- **Tinta / Texto / Gris tierra** (ink, text, muted): titulares, cuerpo, metadatos.
- **Hilo / Hilo fuerte** (line, line-strong): bordes de tarjeta y divisores; el fuerte para separadores de listas editoriales y líneas punteadas.
- **Ámbar y rojo** (amber, red y sus suaves): sólo estados (sueldo sugerido, advertencias, errores).

### Named Rules
**The Una Luz Rule.** El lima es luz, no pintura: va sobre noche o como botón/estado. Nunca como texto sobre crema, donde no tiene contraste.

**The Vino Para Changas Rule.** El malbec identifica changas y destacados. Si algo no es changa ni destacado, no es malbec.

## Typography

**Display Font:** Bricolage Grotesque (con Inter, system-ui)
**Body Font:** Inter (con ui-sans-serif, system-ui, Segoe UI, Roboto)

**Character:** Una grotesca de display con carácter, pesada y apretada, para titulares que se leen como carteles del pueblo; Inter neutra y clara para todo lo que hay que leer o completar.

### Hierarchy
- **Display** (800, clamp(42px, 6.8vw, 92px), 0.94): titular del hero y de bandas de noche (/changas usa clamp(40px, 6.6vw, 88px)). Máximo ~20ch, `text-wrap: balance`. La palabra clave en lima.
- **Headline** (700–800, clamp(30px, 4.2vw, 52px), 1): encabezados de sección; el cierre sube a clamp(36px, 5.6vw, 76px) a 800.
- **Title** (700, 17–19px, 1.2): título de oferta, de changa, de talento, de paso.
- **Figure** (800, clamp(24px, 2.4vw, 30px), tabular): cifras de pago de changa y de detalle de oferta. Toda cifra lleva `tabular-nums`.
- **Body** (400, 16px, 1.55): párrafos, máximo 54–68ch. Subtítulos de banda clamp(16px, 1.5vw, 18.5px).
- **Label** (600–700, 11.5–13.5px): insignias, metadatos, campos (`field > label` 13px/650).

### Named Rules
**The Cartel Rule.** Display siempre a 800 con tracking negativo (-0.03 a -0.035em) e interlineado menor a 1. Un display flojo o espaciado deja de ser del Valle.

**The Cifra Tabular Rule.** Sueldos, conteos y porcentajes van en display o tabular-nums; un número nunca baila.

## Layout

Contenedor de 1180px con 24px de margen lateral. Las bandas (hero, cinta de rubros, changas, cierre, footer) ocupan todo el ancho; el contenido vive dentro del contenedor. Secciones con padding vertical clamp(56px, 7vw, 92px).

Grillas de tarjetas con `auto-fill`/`auto-fit` y `minmax(min(100%, 260–300px), 1fr)`, separación 14–18px. Las listas editoriales (promesas, pasos) no son tarjetas: van separadas por reglas de 1px `line-strong` y una regla superior de 2px tinta.

El hero apila titular, interruptor, bajada y buscador arriba a la izquierda; la cordillera ocupa todo el ancho abajo, con los pueblos posicionados sobre el pie del valle.

Cortes: 1080px (nav a hamburguesa), 900px (splits y promesas a una columna), 760px (buscador y interruptor a una columna, botones a todo el ancho, en el header queda sólo la campanita), 560px y 430px ajustes finos. Objetivos táctiles mínimos de 44px.

## Elevation & Depth

La profundidad viene de capas tonales (noche, noche 2, noche 3; crema, papel, arena) y de las siluetas superpuestas. Las sombras son blandas, desplazadas hacia abajo con spread negativo, y aparecen en hover o en objetos que flotan sobre noche (buscador, botón lima, panel de notificaciones). Nada brilla.

### Shadow Vocabulary
- **Buscador flotante** (`box-shadow: 0 18px 50px rgba(0, 0, 0, .35)`): el buscador crema sobre noche.
- **Botón lima** (`box-shadow: 0 6px 14px rgba(0, 0, 0, .22)`): asienta la luz sobre noche.
- **Hover de tarjeta** (`box-shadow: 0 18px 40px -18px rgba(15, 26, 21, .35)`): oferta y talento al levantarse.
- **Hover de changa** (`box-shadow: 0 22px 40px -20px rgba(40, 6, 22, .55)`): sombra teñida de vino.
- **Popover** (`box-shadow: 0 24px 60px -12px rgba(11, 22, 18, .45)`): panel de la campanita.

### Named Rules
**The Plano En Reposo Rule.** Las tarjetas descansan planas, con borde de 1px. La sombra llega con el hover (y un `translateY(-4px)`), no antes.

## Shapes

Radios suaves y consistentes: 9px para botones chicos e íconos, 10px campos, 12px botones y cajas internas, 16px tarjetas, buscador y popovers, 18px tarjetas genéricas, píldora para chips, insignias, interruptor y filtros. Las fotos de persona son círculos con anillo lima de 4px. La cordillera es la única silueta no rectangular: polígonos planos de picos rectos, también en las portadas SVG de demo y en la cresta superior de la banda de cierre. Separadores internos de changa en línea punteada.

## Components

### Buttons
Directos y grandes, con peso 650.
- **Shape:** curva suave (12px); chico 9px, grande 13px.
- **Lima:** fondo lima, texto noche, sombra corta; es el primario sobre noche (header, buscador del hero, cierre).
- **Primario verde:** fondo verde WorkUco, texto blanco; primario sobre crema. Hover verde oscuro.
- **Noche:** fondo noche, texto blanco; hover noche 2.
- **Outline:** papel con borde `line-strong`; sobre noche, transparente con borde blanco 28%.
- **Estados:** `:active` baja 1px; deshabilitado al 55%. Mínimo 44px de alto (52–54px en el hero).

### Chips
- **Filtro sobre noche:** píldora transparente con borde blanco 22%, texto blanco, 42px de alto; hover borde lima; activo lima con texto noche.
- **Filtro sobre crema:** píldora papel con borde `line`; activo noche con texto blanco.
- **Insignias:** píldora arena 12.5px. "Destacada" en malbec, "Changa" en noche con texto lima.
- **Compatibilidad:** píldora lima pálida (#e8f7c4) con un anillo cónico en verde marca que marca el porcentaje; media en #f6efd6, baja en arena.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** papel sobre crema.
- **Shadow Strategy:** plano en reposo; sombra blanda y elevación de 4px en hover.
- **Border:** 1px `line`; changas con borde malbec al 14%.
- **Internal Padding:** 16–20px.
- **Oferta:** portada de 118px (foto del aviso o cordillera SVG sobre noche), logo superpuesto, pie con cifra en display y fecha.
- **Changa:** etiqueta "Empieza en N días", cupos, pago grande en malbec, datos en dos columnas tras línea punteada, CTA "Postularme" en malbec con flecha que avanza 3px en hover.

### Inputs / Fields
- **Style:** papel, borde 1px `line-strong`, radio 10px, 44px mínimo, texto 14.5px tinta, cursor verde.
- **Focus:** borde verde WorkUco y halo de 3px verde al 13%.
- **Error:** borde #d46b64.
- **Buscador del hero:** contenedor crema de 16px con campos sin borde de 52px, ícono a la izquierda y botón lima.

### Navigation
- Header pegajoso de noche al 94% con desenfoque de 10px y filete lima al 8%. Links en niebla, 14.5px/550; hover y activo en blanco sobre blanco al 7%, el activo con subrayado interior lima de 2px. Bajo 1080px pasa a hamburguesa; bajo 760px sólo queda la campanita con su contador lima.
- Footer de noche, links en niebla con hover lima.

### Interruptor de rol (firma)
Píldora noche 2 con dos botones de 44px ("Busco trabajo" / "Quiero contratar") y un pulgar lima que se desliza en 0.45s con ease-out exponencial. Al cambiar, los bloques del otro rol entran con un recorte de arriba hacia abajo (`clip-path`).

### Valle y pueblos (firma)
Cordillera en tres capas planas a todo el ancho que cierra sobre crema. Cada pueblo es un link: etiqueta noche translúcida con borde lima al 22%, nombre en display 15px y conteo real en lima tabular, sobre un punto lima con pulso de 2.6s. Hover: borde lima y elevación de 3px.

### Cinta de rubros (firma)
Banda lima a todo el ancho con rubros en display 800 clamp(20px, 2.4vw, 30px) separados por puntos noche, en desplazamiento continuo de 38s que se pausa en hover y se vuelve estática con movimiento reducido.

## Do's and Don'ts

### Do:
- **Do** alternar bandas de noche y crema; cada página pública abre o cierra en noche.
- **Do** usar lima como luz sobre noche (botón primario, palabra clave, números vivos) y verde WorkUco como acción sobre crema.
- **Do** reservar el malbec para changas, destacados y la franja de demostración.
- **Do** componer titulares en Bricolage Grotesque 800 con tracking negativo e interlineado menor a 1.
- **Do** mostrar cifras reales de la base en tabular-nums; si no hay dato, decirlo en texto gris, no inventar.
- **Do** resolver imágenes ausentes con la cordillera plana sobre noche.
- **Do** usar ease-out exponencial (cubic-bezier(.16, 1, .3, 1)) y apagar todo movimiento con `prefers-reduced-motion`.

### Don't:
- **Don't** usar lima como color de texto sobre crema o papel.
- **Don't** usar fondo blanco puro de página ni degradados de brillo o halos radiales.
- **Don't** convertir la cordillera en ilustración detallada: picos rectos, capas planas, tres tonos de noche.
- **Don't** poner sombras en tarjetas en reposo.
- **Don't** usar fotos o ilustraciones inventadas del Valle.
- **Don't** poner etiquetas en mayúsculas espaciadas encima de un titular (kickers); el titular display alcanza. Las mayúsculas espaciadas quedan para rótulos de columna (footer, Kanban, filtros, secciones del CV).
