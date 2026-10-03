# Spec funcional — Migración de Washify Web a Cloudflare Workers + Resend

- **Estado:** En producción desde 2026-10-03 (~22:45 UTC). Pendientes menores en sección 2.
- **Fecha:** 2026-10-03
- **Repo:** `washifyoficial/Washify-WEB`
- **Destino:** Worker `washify-web` (static assets) en la cuenta `Washify.oficial@gmail.com's Account`

## 1. Contexto y objetivo

La landing `washify.com.ar` se mueve de Netlify a Cloudflare para tener el sitio institucional y el transaccional en la misma plataforma. Se publica como **Worker con static assets** (`washify-web`), no como proyecto de Pages.

El sitio es estático (HTML + `support.js` de Stitch, sin build), así que todo funciona igual en Cloudflare **salvo el formulario de contacto**, que hoy depende de Netlify Forms:

- El `<form>` de `index.html` tiene `data-netlify="true"`, `netlify-honeypot="bot-field"` y el input oculto `form-name`.
- `submitForm` hace `fetch("/", { method: "POST" })`. Netlify intercepta ese POST, guarda el envío y avisa por mail a `washify.oficial@gmail.com`.

En Cloudflare nadie recibe ese POST (verificado: `POST /` en el Worker responde `405`). Además, el `.then()` actual no revisa `res.ok`, así que el usuario vería "enviado" aunque el contacto se pierda.

**Objetivo:** que el formulario siga funcionando en Cloudflare y mande los contactos por mail usando Resend, que ya está configurado en el proyecto.

## 2. Estado actual (actualizado 2026-10-03)

| Elemento | Estado |
| --- | --- |
| Sitio en producción | `https://www.washify.com.ar` (canónico), servido por el Worker `washify-web`. `washify.com.ar` redirige 301 a `www` conservando ruta y query. |
| Código | En `main`. Cada push a `main` despliega solo (Workers Builds, check `Workers Builds: washify-web` en GitHub). |
| Worker `washify-web` | Custom domains `www.washify.com.ar` y `washify.com.ar`. Secret `RESEND_API_KEY` cargado. `workers.dev` habilitado: `https://washify-web.washify-oficial.workers.dev`. |
| Formulario | Probado de punta a punta: envío real recibido (local y producción), validaciones y honeypot OK. |
| Zona `washify.com.ar` | **Active** en Cloudflare desde 2026-10-03 16:09 UTC. NIC.ar delegado a `daisy.ns.cloudflare.com` / `otto.ns.cloudflare.com`. |
| DNS | Los A de `@` y `www` que apuntaban a Netlify (`13.52.188.95`, `52.52.192.191`) se borraron al conectar los custom domains. Resend intacto: CNAME `send`, TXT `resend._domainkey`, TXT `_dmarc`. |
| Dominio en Resend | `washify.com.ar` (DKIM en `resend._domainkey.washify.com.ar`). API key propia de la web, solo envío. |
| Plataforma transaccional (fuera de alcance) | Worker `washify` (app Next.js) detrás del Worker router `washify-edge`, con custom domains `clientes.`, `lavaderos.`, `admin.` y `api.washify.com.ar`. Repo `washifyoficial/Washify-DEV`. |

**Pendientes**

- [ ] Activar **Always Use HTTPS** en la zona (SSL/TLS → Edge Certificates). Hoy `http://www.washify.com.ar` responde 200 en vez de redirigir a `https`; antes lo forzaba Netlify.
- [ ] Dar de baja el proyecto de Netlify (el sitio ya no recibe tráfico de ahí).
- [ ] Borrar la rama `feat/cloudflare-worker` del repo (ya mergeada).
- [ ] Preguntas abiertas de la sección 12.

## 3. Alcance

**Entra**

- Mover los archivos públicos del sitio a `public/`.
- Script del Worker con el endpoint `POST /api/contacto`, que valida el formulario y envía el mail con Resend.
- `wrangler.jsonc` con la configuración del Worker `washify-web`.
- Ajustes al formulario y a `submitForm` en `index.html`.
- Conexión del Worker al repo (Workers Builds), secret de Resend, dominio y DNS.
- Actualización del `README.md`.

**No entra**

- Cambios de contenido o diseño de la landing.
- Migración del historial de envíos de Netlify. Si se quiere conservar, se exporta a CSV desde Netlify antes de darlo de baja.
- Persistir los contactos en una base (D1 o backend transaccional). Mejora futura.
- Cualquier cambio en la plataforma transaccional (Workers `washify` y `washify-edge`).

## 4. Requerimientos funcionales

| ID | Requerimiento |
| --- | --- |
| RF-01 | El visitante completa el formulario de contacto con: nombre, lavadero, teléfono/WhatsApp, ciudad/zona (obligatorios) y mensaje (opcional). |
| RF-02 | Al enviar, el botón muestra "Enviando..." y no permite un segundo envío hasta tener respuesta. |
| RF-03 | Si el envío se procesó bien, se muestra el mensaje de confirmación actual. |
| RF-04 | Si el servidor responde con error o falla la red, se muestra el estado de error y el usuario puede reintentar. Nunca se muestra "enviado" si el contacto no se envió. |
| RF-05 | Cada envío válido genera un mail al destinatario configurado (`CONTACT_TO`) con todos los campos, la fecha/hora y un link `https://wa.me/{telefono}` para responder. |
| RF-06 | Asunto del mail: `Nuevo lavadero interesado: {lavadero} ({ciudad})`. |
| RF-07 | Si el honeypot `bot-field` viene completo, el endpoint responde OK pero **no** envía el mail. |
| RF-08 | Si falta un campo obligatorio o algún campo supera el largo máximo, el endpoint rechaza el envío y no manda mail. |
| RF-09 | El destinatario se puede cambiar (o ampliar a varios, separados por coma) cambiando una variable, sin tocar la lógica. |

## 5. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-01 | La API key de Resend nunca se expone en el navegador ni se commitea. Vive como secret del Worker y en `.dev.vars` (ignorado por git) para desarrollo local. |
| RNF-02 | Solo se publica el contenido de `public/`. `README.md`, `docs/`, `flyers/`, `src/`, `.env.local` y `.dev.vars` nunca quedan accesibles por URL. |
| RNF-03 | El contenido ingresado por el usuario se escapa antes de armar el HTML del mail. |
| RNF-04 | Largo máximo: 200 caracteres por campo, 2000 para `mensaje`. |
| RNF-05 | Los errores de Resend quedan registrados en los logs del Worker (Observability habilitado). |
| RNF-06 | El mail llega en menos de 1 minuto desde el envío. |
| RNF-07 | Se usa una API key de Resend exclusiva para la web (`washify-web`), con permiso solo de envío y limitada a `washify.com.ar`, para poder revocarla sin afectar al transaccional. |

## 6. Flujo

```
Visitante ─▶ Form (public/index.html) ─POST /api/contacto─▶ Worker washify-web ─▶ Resend API ─▶ Mail a CONTACT_TO
                    ▲                                              │
                    └────────────── 200 / 400 / 502 ───────────────┘

washify.com.ar/*        ─▶ Worker ─▶ 301 a https://www.washify.com.ar/*
Cualquier otro request ─▶ Worker ─▶ static assets (public/)
```

Todas las requests pasan primero por el Worker (`run_worker_first: true`). Sin eso, Cloudflare sirve directo los archivos que existen (`/` → `index.html`) y la redirección del dominio raíz nunca se ejecuta.

1. El visitante completa el form y envía.
2. El front hace POST urlencoded a `/api/contacto`.
3. El Worker revisa honeypot → valida campos → llama a Resend.
4. Responde según la tabla de la sección 7; el front muestra confirmación o error.

## 7. Contrato del endpoint

**Request**

- `POST /api/contacto`
- `Content-Type: application/x-www-form-urlencoded` (mismo formato que se envía hoy)
- Campos: `nombre`, `lavadero`, `telefono`, `ciudad`, `mensaje`, `bot-field`

**Respuestas**

| Caso | HTTP | Body |
| --- | --- | --- |
| Enviado (o honeypot completo) | 200 | `{ "ok": true }` |
| Falta un obligatorio o se excede un largo | 400 | `{ "ok": false, "error": "validation" }` |
| Resend falló o no respondió | 502 | `{ "ok": false, "error": "send_failed" }` |
| Método distinto de POST en `/api/contacto` | 405 | `{ "ok": false, "error": "method_not_allowed" }` |

**Mail enviado (Resend)**

- `from`: variable `CONTACT_FROM` → `Washify Web <web@washify.com.ar>`
- `to`: variable `CONTACT_TO`
- `subject`: ver RF-06
- Cuerpo en texto y HTML con todos los campos. El form no pide email, así que no se usa `reply_to`.

## 8. Cambios en el código

### Estructura final del repo

```
public/                 → lo único que se publica
  index.html
  support.js
  assets/
src/
  worker.js             → endpoint /api/contacto + fallback a assets
wrangler.jsonc
.dev.vars.example
docs/  flyers/  README.md  "Washify Onepager.dc.html"   → no se publican
```

| Archivo | Cambio |
| --- | --- |
| `index.html`, `support.js`, `assets/` | Mover a `public/` (`git mv`, mantiene historial). |
| `src/worker.js` | **Nuevo.** Maneja `POST /api/contacto` (honeypot, validación, escape, envío a Resend) y delega el resto a `env.ASSETS`. |
| `wrangler.jsonc` | **Nuevo.** Nombre `washify-web`, `main`, `assets`, vars y observability. |
| `package.json` + `package-lock.json` | **Nuevo.** Fija la versión de `wrangler` (devDependency) para que Workers Builds y el desarrollo local usen la misma. |
| `public/index.html` — form (línea ~183) | Quitar `data-netlify`, `netlify-honeypot` y el input oculto `form-name`. Mantener `bot-field`. |
| `public/index.html` — `submitForm` (línea ~406) | Apuntar a `/api/contacto` y verificar `res.ok`; si no es ok, pasar a estado de error. |
| `.gitignore` | Ya existe: ignora `.env.*`, `.dev.vars`, `.wrangler/`. |
| `.dev.vars.example` | **Nuevo.** `RESEND_API_KEY=` sin valor, como referencia. |
| `README.md` | Reemplazar Netlify Forms y Deploy por Cloudflare Workers + Resend, y documentar la nueva estructura. |
| `Washify Onepager.dc.html` | Desactualizado (todavía dice "gratis", sin favicon). Si se reexporta desde Stitch pisa `index.html` y trae de vuelta el form de Netlify. Decidir: actualizar o eliminar. |

### `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "washify-web",
  "main": "src/worker.js",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": true
  },
  "vars": {
    "CONTACT_TO": "washify.oficial@gmail.com",
    "CONTACT_FROM": "Washify Web <web@washify.com.ar>"
  },
  "observability": { "enabled": true }
}
```

Las `vars` viven en el archivo (no en el panel) porque cada deploy pisa las variables con lo que dice `wrangler.jsonc`. El secret `RESEND_API_KEY` no se pisa.

### `src/worker.js`

El código vigente está en [`src/worker.js`](../src/worker.js). En resumen:

1. Si el host es `washify.com.ar`, responde 301 a `https://www.washify.com.ar` con la misma ruta y query.
2. `/api/contacto`: solo POST; honeypot → validación de obligatorios y largos → mail con Resend (tabla HTML con los campos escapados, fecha en hora de Argentina y link a WhatsApp, más versión en texto).
3. Cualquier otro `/api/*`: 404 JSON.
4. El resto: `env.ASSETS.fetch(request)` (archivos de `public/`).

### `submitForm` en `index.html`

```js
fetch("/api/contacto", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data).toString(),
})
  .then((res) => {
    if (!res.ok) throw new Error(res.status);
    this.setState({ sent: true, sending: false });
  })
  .catch(() => this.setState({ sending: false, error: true }));
```

## 9. Configuración (fuera del código)

**Resend**

1. Crear la API key `washify-web` (Sending access, limitada a `washify.com.ar`).

**Worker `washify-web`**

1. Cargar el secret: `npx wrangler secret put RESEND_API_KEY` (o en el panel: Worker → Settings → Variables and Secrets → tipo Secret).
2. Conectar al repo: Worker → Settings → Builds → Connect → GitHub `washifyoficial/Washify-WEB`, branch `main`, deploy command `npx wrangler deploy`. Requiere autorizar la GitHub App de Cloudflare en `washifyoficial` (se hace desde el panel).
3. **No deployar a mano** (`wrangler deploy` local o subida desde el panel) ni hacer rollback a versiones viejas: los secrets viven por versión, y una versión anterior a la carga del secret deja el form sin key (pasó el 2026-10-03, ver sección 13).

**Dominio y DNS**

1. Cambiar en NIC.ar los nameservers de `washify.com.ar` por `daisy.ns.cloudflare.com` y `otto.ns.cloudflare.com`. Mientras los A sigan apuntando a Netlify, el sitio sigue servido por Netlify: el cambio de NS por sí solo no corta nada.
2. Con la zona en **active**: borrar los registros A de `@` y `www` (Cloudflare no deja crear el custom domain si existen) y en el mismo momento agregar `www.washify.com.ar` y `washify.com.ar` como custom domains del Worker. Cloudflare emite el certificado.
3. Verificar que los registros de Resend (`send`, `resend._domainkey`, `_dmarc`) siguen intactos.
4. Activar **Always Use HTTPS** en la zona.

## 10. Plan de corte

Ejecutado el 2026-10-03:

- [x] 1. Implementar en una rama y probar en local con `npx wrangler dev` + `.dev.vars` (incluido envío real).
- [x] 2. PR #1 mergeada a `main`.
- [x] 3. Conectar Workers Builds; primer deploy automático con un push a `main` y prueba en `workers.dev` (incluido envío real).
- [x] 4. Cambio de nameservers en NIC.ar; zona **active** a las 16:09 UTC.
- [x] 5. Redirección del dominio raíz a `www` en el Worker.
- [x] 6. Corte: borrar los A de Netlify y agregar los custom domains `www` y raíz (~22:45 UTC).
- [x] 7. Verificación en `washify.com.ar` / `www.washify.com.ar` (ver sección 11).
- [ ] 8. Always Use HTTPS y baja de Netlify.

**Rollback** (solo mientras exista el proyecto en Netlify): quitar los custom domains del Worker y recrear los registros A de `@` y `www` apuntando a Netlify (`13.52.188.95`, `52.52.192.191`). El `main` migrado ya no tiene `data-netlify`; para volver a Netlify con form funcionando hay que redeployar allí el último commit previo a la migración (`0038096`).

## 11. Criterios de aceptación

Se validan en producción (`washify.com.ar`), no solo en `workers.dev`.

- [ ] La landing se ve igual que en Netlify en desktop y mobile (imágenes, favicon, meta OG). *Assets verificados (200); falta la revisión visual.*
- [x] Un envío completo llega a `CONTACT_TO`, con todos los campos y el link de WhatsApp.
- [x] Un envío sin `mensaje` se acepta y llega.
- [x] Un envío sin un campo obligatorio (forzado con curl) devuelve `400` y no manda mail.
- [x] Un envío con `bot-field` completo devuelve `200` y no manda mail.
- [x] Un `GET /api/contacto` devuelve `405`.
- [x] Con una `RESEND_API_KEY` inválida, el endpoint devuelve `502` y el error aparece en los logs (verificado en local y, sin querer, en producción).
- [x] HTML ingresado en un campo (`<b>hola</b>`) llega escapado en el mail.
- [x] `/README.md`, `/docs/...`, `/wrangler.jsonc`, `/package.json`, `/src/...`, `/.env.local` y `/.dev.vars` devuelven `404`.
- [x] HTTPS activo en `washify.com.ar` y `www.washify.com.ar` (Let's Encrypt vía Cloudflare). *Falta forzar `http` → `https` (Always Use HTTPS).*
- [x] `washify.com.ar` redirige 301 a `https://www.washify.com.ar` conservando ruta y query.
- [ ] Los mails del transaccional enviados por Resend siguen llegando después del cambio de DNS. *Registros de Resend intactos; falta confirmar con un envío del transaccional.*
- [x] El `README.md` describe el deploy en Cloudflare y no menciona Netlify.

Prueba rápida:

```bash
curl -i -X POST https://www.washify.com.ar/api/contacto \
  -d nombre=Test -d lavadero=Prueba -d telefono=5491100000000 -d ciudad=CABA
```

## 12. Preguntas abiertas

- [ ] ¿Alcanza con el honeypot o sumamos Cloudflare Turnstile desde el día uno?
- [ ] ¿Además de `washify.oficial@gmail.com`, quién más tiene que recibir los contactos?
- [ ] `Washify Onepager.dc.html`: ¿se actualiza o se elimina?
- [ ] ¿El remitente `web@washify.com.ar` está bien o prefieren otro (ej. `contacto@`)?

## 13. Lecciones de la migración

- **Los secrets viven por versión del Worker.** El 2026-10-03 se cargó `RESEND_API_KEY` y minutos después se hizo un deploy manual de una versión anterior: el Worker quedó sin key y el form devolvía `502`. Solución: volver a cargar el secret y deployar solo desde `main` (Workers Builds).
- **Static assets se sirven antes que el Worker.** Con `run_worker_first` limitado a `/api/*`, la redirección del dominio raíz no corría porque `/` se resolvía directo a `index.html`. Se pasó a `run_worker_first: true`.
- **Custom domains y DNS existentes.** Cloudflare no crea un custom domain si el hostname ya tiene registros A/CNAME: hay que borrarlos justo antes de agregarlo.
- **Workers Builds solo se dispara con un push posterior a la conexión.** Mergear antes de conectar el repo no despliega nada.
- **Redirecciones que hacía Netlify** (raíz → `www`, `http` → `https`) hay que reemplazarlas explícitamente en Cloudflare.
