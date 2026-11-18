// Anonymous, short-lived key for rate limiting (the real IP is never stored or shown anywhere).
const hid = async (request, env) => {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + (env.ADMIN_PASSWORD || "salt")));
  return [...new Uint8Array(h)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
};
// Contact form -> second Discord webhook (DISCORD_CONTACT_WEBHOOK), with image attachments.
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_CONTACT_WEBHOOK) return new Response("The contact form isn't set up yet.", { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response("Forbidden", { status: 403 });

  if (env.TRACKER) {
    try {
      const key = "rl:contact:" + await hid(request, env);
      if (await env.TRACKER.get(key)) return new Response("Please wait a minute before sending another message.", { status: 429 });
      await env.TRACKER.put(key, "1", { expirationTtl: 60 });
    } catch {}
  }

  let fd; try { fd = await request.formData(); } catch { return new Response("Bad request", { status: 400 }); }
  if (fd.get("website")) return new Response("ok");   // honeypot: bots fill this in
  const question = clip(fd.get("question"), 1800);
  if (question.length < 3) return new Response("Please write a question.", { status: 400 });

  const files = fd.getAll("images").filter(x => x && typeof x === "object" && x.size);
  if (files.length > 4) return new Response("Maximum 4 images.", { status: 400 });
  let total = 0;
  for (const x of files) {
    total += x.size;
    if (!EXT[x.type]) return new Response("Images must be PNG, JPG, GIF or WebP.", { status: 415 });
  }
  if (total > 8 * 1024 * 1024) return new Response("Images are over 8 MB in total.", { status: 413 });

  const embed = { title: "❓ New question", color: 0x5b8cff, description: question, timestamp: new Date().toISOString(), fields: [
    { name: "Name", value: clip(fd.get("name"), 100) || "-", inline: true },
    { name: "Reply via", value: clip(fd.get("contact"), 150) || "-", inline: true }] };
  if (files.length) embed.image = { url: "attachment://image0." + EXT[files[0].type] };

  const out = new FormData();
  out.append("payload_json", JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
  files.forEach((x, i) => out.append(`files[${i}]`, x, `image${i}.${EXT[x.type]}`));
  let r; try { r = await fetch(env.DISCORD_CONTACT_WEBHOOK, { method: "POST", body: out }); } catch {}
  return r && r.ok ? new Response("ok") : new Response("Couldn't deliver your message. Try again later.", { status: 502 });
}
