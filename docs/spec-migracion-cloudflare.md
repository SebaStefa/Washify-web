# Spec funcional — Migración de Washify Web a Cloudflare Workers + Resend

- **Estado:** En implementación — código mergeado, pendiente corte de dominio
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
| Código | Mergeado a `main` (PR #1): sitio en `public/`, `src/worker.js`, `wrangler.jsonc`. Probado en local, incluido un envío real con Resend. |
| Worker `washify-web` | Conectado a `washifyoficial/Washify-WEB`, rama `main` (Workers Builds). Secret `RESEND_API_KEY` cargado. Sin dominio propio todavía. |
| URL de prueba | `https://washify-web.washify-oficial.workers.dev` |
| Zona `washify.com.ar` | **Active** en Cloudflare desde 2026-10-03 16:09 UTC. NIC.ar delegado a `daisy.ns.cloudflare.com` / `otto.ns.cloudflare.com`. |
| Sitio en producción | Sigue servido por Netlify (los A de `@` y `www` apuntan a Netlify) hasta agregar los custom domains al Worker. |
| Registros importados | A de `@` y `www` → Netlify (`13.52.188.95`, `52.52.192.191`); Resend: CNAME `send`, TXT `resend._domainkey`, TXT `_dmarc`. Coinciden con lo publicado hoy. |
| Dominio en Resend | `washify.com.ar` (DKIM en `resend._domainkey.washify.com.ar`). |
| Otros recursos en la cuenta | Worker `washify` y Pages `washify-dev` (transaccional / DEV). **Fuera de alcance, no se tocan.** |

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
- Cualquier cambio en el Worker `washify` o en el proyecto Pages `washify-dev`.

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

Cualquier otro request ─▶ Worker ─▶ static assets (public/)
```

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

### Boceto de `src/worker.js`

```js
const REQUIRED = ["nombre", "lavadero", "telefono", "ciudad"];
const MAX = { mensaje: 2000 };
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function contacto(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const form = await request.formData();
  if (form.get("bot-field")) return json({ ok: true });

  const data = {};
  for (const k of [...REQUIRED, "mensaje"]) data[k] = String(form.get(k) ?? "").trim();
  const invalid =
    REQUIRED.some((k) => !data[k]) ||
    Object.entries(data).some(([k, v]) => v.length > (MAX[k] ?? 200));
  if (invalid) return json({ ok: false, error: "validation" }, 400);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO.split(","),
      subject: `Nuevo lavadero interesado: ${data.lavadero} (${data.ciudad})`,
      html: Object.entries(data).map(([k, v]) => `<b>${k}</b>: ${esc(v)}`).join("<br>"),
      text: Object.entries(data).map(([k, v]) => `${k}: ${v}`).join("\n"),
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return json({ ok: false, error: "send_failed" }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contacto") return contacto(request, env);
    if (pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
```

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
3. Mantener habilitado `workers.dev` hasta el corte, para probar.

**Dominio y DNS**

1. Cambiar en NIC.ar los nameservers de `washify.com.ar` por `daisy.ns.cloudflare.com` y `otto.ns.cloudflare.com`. Mientras los A sigan apuntando a Netlify, el sitio sigue servido por Netlify: el cambio de NS por sí solo no corta nada.
2. Con la zona en **active**: Worker → Settings → Domains & Routes → Custom domain → `washify.com.ar` y `www.washify.com.ar`. Cloudflare reemplaza los registros A de Netlify y emite el certificado.
3. Verificar que los registros de Resend (`send`, `resend._domainkey`, `_dmarc`) siguen intactos.

## 10. Plan de corte

1. Implementar en una rama y probar en local con `npx wrangler dev` + `.dev.vars`.
2. Deploy a `washify-web.washify-oficial.workers.dev` y probar el form de punta a punta.
3. Mergear a `main`; con Workers Builds conectado, el deploy sale solo. Volver a probar en `workers.dev`.
4. Exportar a CSV los envíos guardados en Netlify (si se quieren conservar).
5. Cambiar nameservers en NIC.ar y esperar a que la zona pase a **active** (sin impacto: los A siguen apuntando a Netlify).
6. Agregar los custom domains al Worker (este es el corte real).
7. Verificar HTTPS, `www`, form y llegada del mail en `washify.com.ar`.
8. Mantener Netlify activo (sin dominio) 1–2 semanas y luego darlo de baja.

**Rollback:** quitar los custom domains del Worker y recrear los registros A de `@` y `www` apuntando a Netlify (`13.52.188.95`, `52.52.192.191`). El `main` migrado ya no tiene `data-netlify`; si hay que volver a Netlify con form funcionando, redeployar allí el último commit previo a la migración (`0038096`).

## 11. Criterios de aceptación

Se validan en producción (`washify.com.ar`), no solo en `workers.dev`.

- [ ] La landing se ve igual que en Netlify en desktop y mobile (imágenes, favicon, meta OG).
- [ ] Un envío completo llega a `CONTACT_TO` en menos de 1 minuto, con todos los campos y el link de WhatsApp.
- [ ] Un envío sin `mensaje` se acepta y llega.
- [ ] Un envío sin un campo obligatorio (forzado con curl) devuelve `400` y no manda mail.
- [ ] Un envío con `bot-field` completo devuelve `200` y no manda mail.
- [ ] Un `GET /api/contacto` devuelve `405`.
- [ ] Con una `RESEND_API_KEY` inválida (en local o en una versión de preview), el form muestra error (no "enviado") y el error aparece en los logs.
- [ ] HTML ingresado en un campo (`<b>hola</b>`) llega escapado en el mail.
- [ ] `/README.md`, `/docs/...`, `/flyers/...`, `/wrangler.jsonc` y `/.env.local` devuelven `404`.
- [ ] HTTPS activo en `washify.com.ar` y `www.washify.com.ar`.
- [ ] Los mails del transaccional enviados por Resend siguen llegando después del cambio de DNS.
- [ ] El `README.md` describe el deploy en Cloudflare y no menciona Netlify.

Prueba rápida:

```bash
curl -i -X POST https://washify-web.washify-oficial.workers.dev/api/contacto \
  -d nombre=Test -d lavadero=Prueba -d telefono=5491100000000 -d ciudad=CABA
```

## 12. Preguntas abiertas

- [ ] ¿Alcanza con el honeypot o sumamos Cloudflare Turnstile desde el día uno?
- [ ] ¿Además de `washify.oficial@gmail.com`, quién más tiene que recibir los contactos?
- [ ] `Washify Onepager.dc.html`: ¿se actualiza o se elimina?
- [ ] ¿El remitente `web@washify.com.ar` está bien o prefieren otro (ej. `contacto@`)?
