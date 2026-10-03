// Worker de la landing: atiende el formulario de contacto (/api/contacto)
// y delega todo lo demás a los archivos estáticos de public/.

const FIELDS = {
  nombre: "Nombre",
  lavadero: "Lavadero",
  telefono: "Teléfono / WhatsApp",
  ciudad: "Ciudad / Zona",
  mensaje: "Mensaje",
};
const REQUIRED = ["nombre", "lavadero", "telefono", "ciudad"];
const MAX_LENGTH = { mensaje: 2000 };
const DEFAULT_MAX_LENGTH = 200;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function buildEmail(data) {
  const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const whatsapp = `https://wa.me/${data.telefono.replace(/\D/g, "")}`;
  const rows = Object.entries(FIELDS)
    .filter(([key]) => data[key])
    .map(([key, label]) => ({ label, value: data[key] }));

  const text = [
    ...rows.map((r) => `${r.label}: ${r.value}`),
    `Fecha: ${fecha}`,
    `WhatsApp: ${whatsapp}`,
  ].join("\n");

  const html = `
    <h2 style="font-family:sans-serif;">Nuevo lavadero interesado</h2>
    <table style="font-family:sans-serif;border-collapse:collapse;">
      ${rows
        .map(
          (r) => `<tr>
        <td style="padding:6px 12px 6px 0;font-weight:bold;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(r.value)}</td>
      </tr>`
        )
        .join("")}
      <tr><td style="padding:6px 12px 6px 0;font-weight:bold;">Fecha</td><td style="padding:6px 0;">${escapeHtml(fecha)}</td></tr>
    </table>
    <p style="font-family:sans-serif;"><a href="${escapeHtml(whatsapp)}">Responder por WhatsApp</a></p>`;

  return {
    subject: `Nuevo lavadero interesado: ${data.lavadero} (${data.ciudad})`,
    text,
    html,
  };
}

async function handleContacto(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "validation" }, 400);
  }

  // Honeypot: un humano no completa este campo. Respondemos OK para no darle pistas al bot.
  if (form.get("bot-field")) return json({ ok: true });

  const data = {};
  for (const key of Object.keys(FIELDS)) data[key] = String(form.get(key) ?? "").trim();

  const invalid =
    REQUIRED.some((key) => !data[key]) ||
    Object.entries(data).some(([key, value]) => value.length > (MAX_LENGTH[key] ?? DEFAULT_MAX_LENGTH));
  if (invalid) return json({ ok: false, error: "validation" }, 400);

  const email = buildEmail(data);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: env.CONTACT_TO.split(",").map((s) => s.trim()).filter(Boolean),
        ...email,
      }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return json({ ok: false, error: "send_failed" }, 502);
    }
  } catch (err) {
    console.error("Resend fetch failed", err);
    return json({ ok: false, error: "send_failed" }, 502);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contacto") return handleContacto(request, env);
    if (pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
