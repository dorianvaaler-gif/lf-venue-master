# LF-Venue Master — proyecto independiente (Vercel + Supabase)

Copia exacta de la versión Master del artefacto `lf-venue-master`: mismo diseño
(simple tipo Mac, sin amarillo, acento azul casi turquesa #00a6b6), mismos flujos
y mismas funciones. La versión Personal (Netlify) queda aparte y no se toca.

## Qué hace

- Login por correo + contraseña (Supabase Auth). Dorian (dorianvaaler@gmail.com)
  es master, sin límite de usuarios.
- El master invita por correo: la app da un código de 6 caracteres; el miembro
  entra con correo + código, pone su nombre y su contraseña.
- Solo el master ve Equipo y puede activar/desactivar miembros. Al desactivar,
  la sesión del miembro se cierra al momento (RLS bloquea sus datos y el cliente
  re-checa cada 30 s y al volver a la app).
- Sincronización en tiempo real entre teléfonos (Supabase Realtime).
- Chat interno por proyecto/evento (pestaña Mensajes dentro de cada evento).
- Si dos editan lo mismo a la vez, vale la última edición.
- Eventos con todo dentro: ficha (nombre, fecha, horarios, responsable,
  anotaciones), rider en tabla Cantidad/Modelo/Otros, crew por evento por nombre
  y rol, checklist Pendiente → En curso → Hecho, horarios, contactos clave,
  actividad. Búsqueda y filtros, días que faltan, confirmaciones antes de borrar.
- Términos y Condiciones antes de entrar (Aceptar / No aceptar), con la
  cláusula de derechos de autor de LF Venue.
- Instalación: iPhone Safari → ··· → Compartir → Añadir a pantalla de inicio;
  Android Chrome con instalación nativa.
- Sin fotos/cámara, sin respaldo por pérdida de teléfono, sin ubicación.
- Empieza vacío: sin datos de prueba ni demo.

## Estructura

- `app/page.js` — toda la app (cliente).
- `app/api/invites/route.js` — crear invitación (master) y canjear código.
- `app/api/admin/route.js` — lista de miembros, activar/desactivar.
- `app/api/bootstrap/route.js` — crea el acceso master solo la primera vez.
- `supabase/schema.sql` — tablas + RLS + Realtime. Ejecutar una vez en Supabase.
- `public/` — icono oficial + manifest PWA.

## Variables de entorno (Vercel → Settings → Environment Variables)

- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — llave publishable `sb_publishable_...` del proyecto (antes anon key). También se acepta `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `VITE_SUPABASE_ANON_KEY`.
- `SUPABASE_SECRET_KEY` — llave secreta `sb_secret_...` (antes service role; solo servidor, nunca pública). También se acepta `SUPABASE_SERVICE_ROLE_KEY`.

## Puesta en marcha (lo que falta)

1. Crear cuenta Supabase con dorianvaaler@gmail.com (plan gratis).
2. Crear un proyecto Supabase (plan gratis, región cercana: us-east-1).
3. En el SQL Editor, ejecutar `supabase/schema.sql`.
4. En Supabase → Settings → API, copiar URL + anon key + service role key.
5. Poner las 3 variables en Vercel (production) y redesplegar.
6. Abrir la URL: pantalla inicial → Términos → "Soy el master, crear mi acceso"
   con dorianvaaler@gmail.com → poner contraseña → entrar → invitar al equipo.

## Despliegue

- Vercel, proyecto `lf-venue-master`, plan Hobby (gratis). Sin dominios de pago.
- Supabase, plan gratis.
