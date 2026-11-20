# Avisos importados: mensaje personalizado con IA · diseño corto (aprobado en el chat)

## Por qué
Para avisarle a cada empresa que subimos su aviso hoy se usa un único texto fijo. El dueño quiere que la IA escriba
un mensaje distinto para cada empresa, **respetuoso, profesional y muy amigable**, y poder corregirlo antes de mandarlo.
Además, el importador daba "timeout" con `gemini-3.8-flash` (piensa mucho y el corte era de 60 s).

## Qué se suma
1. **Importador más rápido**: `callProvider` acepta `timeoutMs` (defecto 60 s); el importador y el mensaje usan 120 s.
   Con Gemini 3.x se pide `thinkingConfig.thinkingLevel = "low"`. Modelo sugerido por defecto: `gemini-3.5-flash-lite`.
2. **Mensaje con IA** (Admin → Importar, por empresa sin reclamar): "Escribir mensaje con IA" → la IA arma el texto con
   nombre de la empresa, puesto(s), localidad, canal de origen y postulantes; termina con el link de reclamo.
   Se puede editar, guardar, copiar, mandar por WhatsApp (con ese texto) o pedir otro.
3. **Reglas del texto**: tono respetuoso, profesional y muy amigable; tuteo/voseo rioplatense; 400–700 caracteres; sin
   emojis en exceso (máx. 1); no promete resultados ni inventa datos; siempre incluye el link exacto (si falta, se agrega).
4. **Guardado**: columna `companies.claim_msg`; el link de WhatsApp de la lista usa ese texto si existe.
5. **Si la IA falla o no está configurada**: se devuelve el texto fijo de siempre con `ai: false` y un aviso; nada se traba.

## Enfoques
- A (elegido): generar a pedido por empresa, editable y guardado. Gasta IA sólo cuando el dueño lo pide.
- B: generar automáticamente al publicar: descartado (gasta IA en empresas que quizás no se avisan y suma demora al publicar).

## Decisiones de Claude
- La plantilla fija pasa a `lib/importer.js` (`defaultClaimMessage`) para usarla como respaldo y en la lista.
- Ruta: `POST /api/admin/import/companies/:id/message` (generar) y `PUT` (guardar edición); sólo admin.
- Rama `importados-mensaje-ia` desde `main`.
