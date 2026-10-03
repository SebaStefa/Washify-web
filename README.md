# Washify — One Pager

Landing page one-pager de Washify (`washify.com.ar`). Sitio estático, generado originalmente con Google Stitch (formato `.dc.html`), publicado en **Cloudflare Workers** (Worker `washify-web`, con static assets).

## Estructura

```
public/                  → lo único que se publica
  index.html             → página principal
  support.js             → runtime de Stitch (carga React vía CDN en el navegador)
  assets/                → logos, íconos de marca e imágenes OG
src/worker.js            → endpoint del formulario (/api/contacto) + fallback a public/
wrangler.jsonc           → configuración del Worker
Washify Onepager.dc.html → fuente original de Stitch (referencia, no se publica)
flyers/                  → piezas gráficas auxiliares (no se publican)
docs/                    → specs y documentación (no se publican)
```

## Formulario de contacto

- El form de "Contacto" hace `POST /api/contacto` (urlencoded).
- `src/worker.js` valida los campos, descarta envíos con el honeypot `bot-field` completo y manda el mail con **Resend**.
- Destinatario y remitente se configuran en `wrangler.jsonc` (`CONTACT_TO`, `CONTACT_FROM`). `CONTACT_TO` acepta varios mails separados por coma.
- La API key de Resend es un secret del Worker (`RESEND_API_KEY`), nunca va al repo.
- Los errores de envío se ven en Cloudflare: Worker `washify-web` → Observability → Logs.

Detalle completo en [docs/spec-migracion-cloudflare.md](docs/spec-migracion-cloudflare.md).

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completar RESEND_API_KEY
npm run dev                      # http://localhost:8787
```

## Deploy

El Worker está conectado al repo con **Workers Builds**: cada push a `main` despliega automáticamente (`npx wrangler deploy`).

- Las variables (`vars`) se definen en `wrangler.jsonc`; cada deploy pisa las que se carguen a mano en el panel.
- El secret se carga una sola vez: `npx wrangler secret put RESEND_API_KEY`.
- Dominios: `washify.com.ar` y `www.washify.com.ar` como custom domains del Worker (Settings → Domains & Routes).

## Editar el sitio

Los cambios de contenido/estilos se hacen sobre `public/index.html`. Si se vuelve a exportar desde Stitch, hay que reaplicar los cambios del formulario (sin atributos de Netlify, `fetch` a `/api/contacto`).
