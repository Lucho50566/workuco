# Workuco — Portal de empleo del Valle de Uco

Plataforma web para buscar y publicar empleos en **San Carlos, Tunuyán y Tupungato**.
Aplicación real y funcional: sin dependencias, sin build, con base de datos propia.

- **Stack**: Node.js 24 (`node:sqlite`) + frontend vanilla (HTML/CSS/JS).
- **Puerto**: 4250.
- **Diseño**: minimalista, blanco/gris/negro + verde `#14884a`, responsive (mobile primero).

## Arrancar

```
Iniciar Workuco.bat        (o: node server.js)
```

Abre `http://localhost:4250`. Desde el celular en la misma WiFi: `http://IP-DE-LA-PC:4250`.

### Accesos de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Empresa demo | `bodega@demo.workuco` | `demo12345` |
| Administración | `admin@workuco.com.ar` | `workuco2026` (o `WORKUCO_ADMIN_PASS`) |

Cualquier empresa demo sirve para probar el panel: `finca@`, `cafe@`, `posada@`, `obras@`,
`estudio@`, `tienda@demo.workuco` (misma contraseña). Son empresas y personas **ficticias**.

Con `WORKUCO_DEMO=1` la base se siembra sola si está vacía: 14 ofertas (12 aprobadas y 2
pendientes), 7 empresas y 8 postulaciones.

## Páginas

| Ruta | Qué hace |
|---|---|
| `/` | Home: hero, buscador, ofertas destacadas, categorías, CTA empresas |
| `/buscar` | Búsqueda con filtros por palabra, localidad, categoría, tipo, modalidad y orden |
| `/oferta/:id` | Detalle completo + postulación (con CV PDF opcional) |
| `/publicar` | Formulario de publicación (requiere cuenta de empresa) |
| `/acceder` | Login y registro de empresas |
| `/panel` | Panel de empresa: ofertas, postulaciones y perfil |
| `/admin` | Panel de administración |
| `/acerca`, `/contacto`, `/faq`, `/terminos`, `/privacidad` | Páginas institucionales |

## Funcionalidades

**Público**
- Buscador y filtros combinables, orden por fecha, paginación por “Ver más”.
- Tarjetas con puesto, empresa, localidad, modalidad, tipo, remuneración y fecha.
- Ofertas destacadas primero. Ofertas vencidas o pendientes no se muestran.
- Postulación con validación, CV PDF (máx. 4 MB) y control de duplicados por email.

**Empresas**
- Registro/login con contraseña cifrada (scrypt + salt) y sesión en cookie HttpOnly.
- Publicar ofertas: quedan **pendientes de aprobación**.
- Editar (vuelve a revisión), eliminar, ver postulaciones y descargar CVs.
- Marcar postulaciones como nueva / contactada / descartada.
- Perfil de empresa editable.

**Administración**
- KPIs: publicadas, pendientes, postulaciones, empresas (y visitas).
- Aprobar, rechazar con motivo, destacar, editar y eliminar ofertas.
- Ver todas las postulaciones y sus CVs.
- Verificar empresas y asignar plan (`free` / `pro` / `premium`).

## Estructura

```
workuco/
  server.js          servidor HTTP + API JSON + sesiones + estáticos
  lib/store.js       capa SQLite (node:sqlite): schema, consultas, métricas
  lib/demo.js        datos de demostración (empresas y personas ficticias)
  public/
    index.html       home
    buscar.html      búsqueda
    oferta.html      detalle + modal de postulación
    publicar.html    alta/edición de oferta
    acceso.html      login / registro
    panel.html       panel de empresa
    admin.html       panel de administración
    info.html        páginas institucionales
    app.js           lógica de todas las páginas
    styles.css       sistema visual
  tools/
    test-api.js      47 pruebas end-to-end de la API
    check-layout.mjs  chequeo de desbordes en 320/390/768/1366
    shots.mjs        capturas de todas las pantallas
    fix-encoding.js  utilidad (evita el bug de PowerShell con acentos)
  data/              workuco.sqlite + cv/ (no se versiona)
  render.yaml        deploy en Render (plan free)
  Dockerfile         imagen opcional
```

## API

Público: `GET /api/meta`, `GET /api/jobs` (q, locality, category, type, modality, sort, page),
`GET /api/jobs/:id`, `POST /api/jobs/:id/apply`, `GET /api/me`.

Empresa: `POST /api/auth/register|login|logout`, `GET/POST /api/company/jobs`,
`PUT/DELETE /api/company/jobs/:id`, `GET /api/company/applications`,
`PATCH /api/company/applications/:id`, `GET /api/company/cv/:id`, `PATCH /api/company/profile`.

Admin: `POST /api/admin/login`, `GET /api/admin/stats|jobs|applications|companies`,
`PATCH/DELETE /api/admin/jobs/:id`, `PATCH /api/admin/companies/:id`.

## Seguridad

- Consultas SQL parametrizadas y validación de todos los campos en el servidor.
- Contraseñas con scrypt (16 bytes de salt, 64 de hash) y comparación en tiempo constante.
- Sesiones persistidas con vencimiento (7 días) en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS.
- Límite de intentos de login (8 fallos → 10 minutos) por IP.
- Protección CSRF básica: los POST/PATCH con `Origin` externo se rechazan.
- CVs solo accesibles para la empresa dueña de la oferta y el administrador.
- Validación real de PDF (firma `%PDF-`) y límite de 4 MB.

## Pruebas

```
node tools/test-api.js       # 47 pruebas (servidor temporal + datos demo)
node tools/check-layout.mjs http://localhost:4250/ 390 844 1366 900
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
- En Render free el servicio se duerme a los 15 minutos sin visitas (~50 s para despertar).

