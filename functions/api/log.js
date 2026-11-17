// Cloudflare Pages Function: posts visit + error logs to Discord.
// The webhook URL lives in the DISCORD_WEBHOOK secret, never in the page.
const clip = (s, n) => String(s ?? "").slice(0, n) || "-";

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_WEBHOOK) return new Response("ok");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response("forbidden", { status: 403 });
  let b; try { b = await request.json(); } catch { return new Response("bad request", { status: 400 }); }

  const type = b.type === "error" ? "error" : "visit";
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const cf = request.cf || {};

  // Spam guard: one visit log per IP per 30 min, one error log per IP per minute (needs the TRACKER KV binding)
  if (env.TRACKER) {
    try {
      const key = `rl:${type}:${ip}`;
      if (await env.TRACKER.get(key)) return new Response("ok");
      await env.TRACKER.put(key, "1", { expirationTtl: type === "visit" ? 1800 : 60 });
    } catch {}
  }

  const where = [cf.city, cf.country].filter(Boolean).join(", ") || "unknown";
  const ua = clip(request.headers.get("user-agent"), 200);
  const embed = type === "error"
    ? { title: "⚠️ Site JavaScript error", color: 0xff5b6e, fields: [
        { name: "Message", value: clip(b.message, 500) },
        { name: "Source", value: clip(b.source, 200) },
        { name: "Page", value: clip(b.path, 200) },
        { name: "Visitor", value: `${ip} · ${where}` },
        { name: "Browser", value: ua } ] }
    : { title: "👀 New visit", color: 0x35e08a, fields: [
        { name: "Page", value: clip(b.path, 200), inline: true },
        { name: "Came from", value: clip(b.ref, 200), inline: true },
        { name: "Visitor", value: `${ip} · ${where}` },
        { name: "Browser", value: ua } ] };
  embed.timestamp = new Date().toISOString();

  try {
    await fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }) });
  } catch {}
  return new Response("ok");
}
