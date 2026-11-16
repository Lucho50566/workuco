# Base para ofrecer servicios a empresas — Diseño corto

Fecha: 2026-11-16 · Aprobado en la conversación ("Sí, armala")

## Por qué
El dueño quiere, cuando haya bastantes empresas, venderles otros servicios (automatización con IA, páginas web,
programas a medida). Antes de invertir en armarlos, quiere medir cuántas empresas los quieren y cuáles, y poder
contactarlas legalmente.

## Qué se construye
- **Panel de empresa → pestaña "Soluciones"**: tres servicios (Automatización con IA, Página web, Programas a medida),
  cada uno con "Me interesa"; un campo opcional "Contanos qué necesitás" (hasta 600 caracteres); un casillero aparte,
  sin marcar, "Acepto que WorkUco me contacte con propuestas sobre estos servicios" (Ley 25.326: consentimiento libre,
  expreso e informado, separado de los términos). Sin el casillero no se guarda el interés. Se puede retirar.
- **Mi empresa → "Cantidad de empleados"** (opcional: 1 a 5, 6 a 20, 21 a 50, Más de 50). El sitio web ya existe.
- **Admin → pestaña "Servicios"**: lista de empresas interesadas con permiso de contacto: nombre, email, teléfono,
  localidad, empleados, si tiene web, qué servicios, nota y fecha.
- **Privacidad**: la política agrega esta finalidad (sólo con permiso) y que se puede retirar desde el panel.

## Decisiones
- Datos en columnas de `companies` (services_interest JSON, services_note, services_at, marketing_ok, marketing_at,
  employees): se borran con la empresa y salen en "Descargar mis datos" sin código extra.
- Lista de servicios en `lib/services.js` (ids `ia`, `web`, `sistemas`), así se suman otros sin tocar la base.
- Sin mails automáticos al admin en esta etapa (la pestaña alcanza).

## No objetivos / anti-objetivos
- No vender ni cobrar nada todavía; no mostrar precios.
- Nunca contactar a una empresa sin el casillero marcado; nunca preseleccionarlo.
- No molestar: la pestaña no aparece como aviso emergente ni en el resumen.
