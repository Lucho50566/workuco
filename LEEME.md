# Workuco — Portal de empleo del Valle de Uco

Plataforma web para buscar y publicar empleos en **San Carlos, Tunuyán y Tupungato**.
Aplicación real y funcional: sin dependencias, sin build, con base de datos propia.

- **Stack**: Node.js 24 (`node:sqlite`) + frontend vanilla (HTML/CSS/JS).
- **Puerto**: 4250.
- **Diseño**: minimalista, blanco/gris/negro + verde `#0a8263`, responsive (mobile primero).
- **Dos lados**: quien busca trabajo (**empleado**) y quien contrata (**empleador**), cada uno
  con su propio recorrido y su propio panel.

## Arrancar

```
Iniciar Workuco.bat        (o: node server.js)
```

Abre `http://localhost:4250`. Desde el celular en la misma WiFi: `http://IP-DE-LA-PC:4250`.

### Accesos de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Empresa demo | `bodega@demo.workuco` | `demo12345` |
| Persona demo | `martina@demo.workuco` | `demo12345` |
| Administración | `admin@workuco.com.ar` | `workuco2026` (o `WORKUCO_ADMIN_PASS`) |

Cualquier empresa demo sirve para probar el panel: `finca@`, `cafe@`, `posada@`, `obras@`,
`estudio@`, `tienda@demo.workuco` (misma contraseña). Son empresas y personas **ficticias**.

Con `WORKUCO_DEMO=1` la base se siembra sola si está vacía: 14 ofertas (12 aprobadas y 2
pendientes), 7 empresas con fotos, 8 personas y postulaciones repartidas en todas las etapas.

## Páginas

| Ruta | Qué hace |
|---|---|
| `/` | Home: hero con doble camino (busco / contrato), buscador, ofertas y empresas |
| `/buscar` | Búsqueda con filtros por palabra, localidad, categoría, tipo, modalidad y orden |
| `/oferta/:id` | Detalle con carrusel de fotos de la empresa, resumen, beneficios y postulación |
| `/empresas` | Directorio de empresas del Valle |
| `/empresa/:id` | Ficha pública: carrusel, descripción, datos y búsquedas abiertas |
| `/acceder` | Entrada con **selector de rol** (busco trabajo / quiero contratar) |
| `/mi-perfil` | Perfil de la persona: foto, titular, CV, habilidades, disponibilidad, guardadas y postulaciones |
| `/publicar` | Alta de oferta en **4 pasos** (wizard con tarjetas y chips) |
| `/panel` | Panel de empresa: resumen, ofertas, postulantes (Kanban), mi empresa, IA |
| `/admin` | Panel de administración |
| `/acerca`, `/contacto`, `/faq`, `/terminos`, `/privacidad` | Páginas institucionales |

## Funcionalidades

**Quien busca trabajo**
- Perfil con **foto**, **CV en PDF**, titular, resumen, habilidades, experiencia, formación y
  disponibilidad. Barra de **% de perfil completo** que dice qué falta.
- Postularse **en un toque**: el perfil viaja con la postulación, sin volver a escribir nada.
- **Guardar ofertas** (corazón) y verlas después en *Mi perfil → Guardadas*.
- **Mis postulaciones** con la etapa real en la que está cada una.
- Compartir una oferta con el botón nativo del teléfono.

**Empresas**
- Registro/login con contraseña cifrada (scrypt + salt) y sesión en cookie HttpOnly.
- Publicar en **4 pasos** con preview en vivo: sin formularios eternos.
- **Galería de fotos** (hasta 8, se achican en el navegador): alimenta el **carrusel** de la
  ficha de empresa y de cada aviso, y la portada de las tarjetas en el listado.
- **Panel de postulantes tipo Kanban** por etapas (nuevo → revisión → entrevista → finalista →
  contratado / descartado), arrastrando tarjetas o con un toque en mobile.
- Ficha del postulante con perfil completo, nota interna, **estrellas de puntaje**, etiquetas,
  historial y contacto por WhatsApp/mail.
- **IA opcional**: cada empresa conecta **su propia API key** (OpenAI o cualquier API
  compatible, Google Gemini, Anthropic o una URL propia) y la IA **lee el CV, lo resume, marca
  puntos fuertes y dudas** y le pone un puntaje. Se puede activar el análisis automático.
  La key se guarda por empresa y nunca se devuelve al navegador.
- Resumen con KPIs, embudo de postulantes, "para hacer hoy" y últimos postulantes.
- Duplicar ofertas, ver visitas por aviso, exportar postulantes a **CSV**.

**Administración**
- KPIs: publicadas, pendientes, postulaciones, empresas, visitas.
- Aprobar, rechazar con motivo, destacar, editar y eliminar ofertas.
- Ver todas las postulaciones y sus CVs; verificar empresas y asignar plan.

## Estructura

```
workuco/
  server.js          servidor HTTP + API JSON + sesiones + estáticos
  lib/store.js       capa SQLite (node:sqlite): schema, consultas, métricas
  lib/demo.js        datos de demostración (empresas y personas ficticias)
  lib/ai.js          proveedores de IA (OpenAI compatible, Gemini, Anthropic)
  lib/cvtext.js      extracción de texto de CV en PDF
  public/
    index.html · buscar.html · oferta.html · empresas.html · empresa.html
    acceso.html · mi-perfil.html · publicar.html · panel.html · admin.html · info.html
    app.js           lógica de las páginas públicas y del perfil
    panel.js         lógica del panel de empresa
    styles.css       sistema visual
    demo/            fotos y logos de las empresas de ejemplo
  tools/
    test-api.js      82 pruebas end-to-end de la API
    test-ai.js       pruebas del armado de prompts y parseo de respuestas
    test-ui.mjs      prueba de UI con dos navegadores
    check-layout.mjs chequeo de desbordes en 320/390/768/1366
    shots.mjs        capturas de todas las pantallas en shots/
  data/              workuco.sqlite + cv/ + fotos (no se versiona)
  render.yaml        deploy en Render (plan free)
  Dockerfile         imagen opcional
```

## API

Público: `GET /api/meta`, `GET /api/jobs` (q, locality, category, type, modality, sort, page),
`GET /api/jobs/:id`, `POST /api/jobs/:id/apply`, `GET /api/companies`, `GET /api/companies/:id`,
`GET /api/me`.

Persona: `GET/PATCH /api/candidate/profile`, `GET /api/candidate/applications`,
`GET/POST /api/candidate/saved[/:jobId]`, `GET /api/photo/c/:id`, `GET /api/cv/c/:id`.

Empresa: `POST /api/auth/register|login|logout`, `GET/POST /api/company/jobs`,
`PUT/DELETE /api/company/jobs/:id`, `GET /api/company/applications`,
`PATCH /api/company/applications/:id`, `GET /api/company/applications.csv`,
`GET /api/company/cv/:id`, `PATCH /api/company/profile`, `POST/DELETE /api/company/gallery`,
`GET/PATCH /api/company/ai`, `POST /api/company/ai/test`, `POST /api/company/ai/describe`,
`GET /api/company/dashboard`.

Admin: `POST /api/admin/login`, `GET /api/admin/stats|jobs|applications|companies`,
`PATCH/DELETE /api/admin/jobs/:id`, `PATCH /api/admin/companies/:id`.

## Seguridad

- Consultas SQL parametrizadas y validación de todos los campos en el servidor.
- Contraseñas con scrypt (16 bytes de salt, 64 de hash) y comparación en tiempo constante.
- Sesiones persistidas con vencimiento (7 días) en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS.
- Límite de intentos de login (8 fallos → 10 minutos) por IP.
- Protección CSRF básica: los POST/PATCH con `Origin` externo se rechazan.
- CVs y fotos solo accesibles para la empresa dueña de la oferta/postulación y el administrador.
- Validación real de PDF (firma `%PDF-`), límite de 4 MB y de 8 fotos por empresa.
- La API key de IA se guarda por empresa, nunca se envía al navegador (solo enmascarada).

## Pruebas

```
node tools/test-api.js       # 82 pruebas (servidor temporal + datos demo)
node tools/test-ai.js        # prompts y parseo de la IA
node tools/check-layout.mjs http://localhost:4250/ 320 390 768 1366
node tools/shots.mjs http://localhost:4250          # capturas en shots/
```

## Deploy en Render

Repo: <https://github.com/Lucho50566/workuco> (público).
Deploy en un clic: <https://render.com/deploy?repo=https://github.com/Lucho50566/workuco>

`render.yaml` define Node 24, plan free, `WORKUCO_DEMO=1` y una contraseña de admin generada
por Render (se ve en **Environment**). El disco del plan free es efímero: al reiniciar se
pierden las cuentas y postulaciones reales y vuelven los datos demo.

## Preparado para monetizar

- `companies.plan` (`free` / `pro` / `premium`) y `jobs.featured` ya existen.
- El alta de ofertas pasa por un único punto (`POST /api/company/jobs`), donde se pueden aplicar
  límites por plan o cobros sin tocar el frontend.
- No hay pasarela de pago integrada todavía (a propósito).

## Limitaciones conocidas

- No envía emails: las postulaciones se ven en el panel de la empresa.
- El aviso de aprobación/rechazo se consulta en el panel (no hay notificación push).
- La IA depende de la key y la cuota de cada empresa; sin key, el panel funciona igual.
- En Render free el servicio se duerme a los 15 minutos sin visitas (~50 s para despertar).
