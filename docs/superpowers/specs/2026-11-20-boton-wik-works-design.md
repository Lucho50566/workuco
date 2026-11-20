# Botón flotante de Wik Works en el celular · diseño corto (aprobado en el chat)

## Por qué
En el celular a Wik Works (avisos en formato flyer, tipo TikTok) sólo se llega desde el menú ☰. El dueño quiere un
acceso siempre a mano que no moleste y que se pueda apagar.

## Qué se hace
- **Botón redondo** abajo a la derecha, sólo en pantallas de hasta 860 px: fondo noche, W lima, 56 px, respetando el
  área segura del celular. Lleva a `/flyers`.
- **Primera vez**: muestra al lado "Wik Works" ~4 s y después queda sólo el círculo (se recuerda en el equipo).
- **No molesta**: se esconde al bajar la página y vuelve al subir; se oculta mientras está el cartel "Instalar app".
- **No aparece** en: Wik Works, panel, admin, publicar, acceder, reclamar (aviso y ficha), restablecer, ficha de la Guía
  (tiene barra de WhatsApp abajo), CV y CV Pro.
- **Apagar**: "✕" chiquita en el botón → se oculta y avisa "Listo, lo ocultamos. Lo podés volver a activar desde el menú."
  En el menú ☰ hay un interruptor "Botón de Wik Works" (Activado / Desactivado). Se guarda en `localStorage`
  (`wk_wik_btn`), por equipo, sin cuenta.

## Enfoques
- A (elegido): botón flotante + ✕ + interruptor en el menú.
- B: apagar sólo desde el menú: más limpio pero menos obvio (descartado por el dueño).

## Decisiones de Claude
- Todo del lado del navegador (`public/app.js` + `public/valle.css`); el interruptor del menú se arma en `navHtml`.
- Prueba en Chrome sin ventana: `tools/test-ui-wik.mjs` (levanta su propio servidor de demo).
