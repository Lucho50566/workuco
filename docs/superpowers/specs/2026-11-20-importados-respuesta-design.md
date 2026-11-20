# Avisos importados: respuesta de la empresa · diseño corto (aprobado en el chat)

## Por qué
WorkUco sube flyers de empresas (Admin → Importar), les manda un link y la empresa decide si se queda con el aviso
o lo borra. Hoy funciona, pero al borrar no se sabe por qué, no queda registro de cuándo respondió cada una, el dueño
no se entera solo, y "avisado" sólo se marca tocando WhatsApp.

## Qué se suma
1. **Motivo al borrar (opción rápida, obligatoria)** en `/reclamar/<código>`: "Ya cubrimos el puesto",
   "No queremos publicar en WorkUco", "Los datos están mal", "Otro" + comentario opcional (300 caracteres).
   El servidor rechaza el borrado sin motivo válido (400).
2. **Registro de respuestas**: tabla `import_responses` (empresa, teléfono normalizado, acción aceptada/rechazada,
   motivo, comentario, títulos de los avisos, postulantes, si se había avisado y cuándo, fecha). Sobrevive al borrado.
3. **Aviso al dueño**: mail a `ADMIN_EMAIL` y grupo "Respuestas de empresas" en la bandeja "Para revisar" del admin.
4. **Admin → Importar**: filtros Para avisar / Avisadas / Aceptadas / Rechazadas (con fecha y motivo);
   botones "Copiar link", "WhatsApp" y "Marcar avisado" (sin depender de WhatsApp).
5. **IA del importador**: sin cambios de código; el dueño cargó Gemini gratis (`WORKUCO_IMPORT_AI_*`).

## Enfoques
- A (elegido): tabla aparte de respuestas; el borrado en cascada sigue igual. Así el historial no depende de que la
  empresa exista.
- B: no borrar y marcar como rechazada: descartado, porque la empresa pidió que se borre y la política lo promete.

## Decisiones de Claude
- La fecha de aceptación se guarda en la misma tabla (no columna nueva en `companies`).
- "Avisadas" = sin reclamar con `notify_status='avisado'`; "Para avisar" = sin reclamar y sin avisar.
- Rama `importados-respuesta` desde `main`, independiente del plan mensual.
