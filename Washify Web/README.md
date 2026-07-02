# Washify — One Pager

Landing page one-pager de Washify. Sitio estático, generado originalmente con Google Stitch (formato `.dc.html`), pensado para desplegarse directo en Netlify.

## Estructura

```
index.html          → página principal (deploy)
Washify Onepager.dc.html → fuente original de Stitch (referencia/edición)
support.js          → runtime de Stitch (carga React vía CDN en el navegador)
assets/             → logos e íconos de marca
flyers/             → piezas gráficas auxiliares (no forman parte del sitio público)
```

## Formulario de contacto

El formulario de la sección "Contacto" usa **Netlify Forms**:

- El `<form>` tiene `data-netlify="true"` y un campo honeypot (`bot-field`) anti-spam.
- Al enviarse, hace un `fetch` POST a `/` con los datos — Netlify lo captura automáticamente, sin backend propio.
- Las notificaciones por email se configuran en Netlify: **Site configuration → Forms → Form notifications**, destino `washify.oficial@gmail.com`.

## Deploy

1. Conectar este repo en Netlify (New site from Git).
2. Build command: ninguno. Publish directory: `/` (raíz del repo).
3. Configurar el dominio `washify.com.ar` en **Domain settings** y cargar los registros DNS que indique Netlify en el panel de NIC.ar.

## Editar el sitio

Los cambios de contenido/estilos se hacen sobre `index.html` (y se replican en `Washify Onepager.dc.html` si se vuelve a exportar desde Stitch). No requiere build ni instalación de dependencias.
