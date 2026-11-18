// Anonymous, short-lived key for rate limiting (the real IP is never stored or shown anywhere).
const hid = async (request, env) => {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + (env.ADMIN_PASSWORD || "salt")));
  return [...new Uint8Array(h)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
};
// GET: is the site on (and the maintenance message)?  POST {on:true|false, message?} (admin password): turn it on/off.
async function authed(request, env) {
  const fk = "fail:" + await hid(request, env);
  let fails = 0; try { fails = +(await env.TRACKER.get(fk)) || 0; } catch {}
  if (fails >= 8) return 429;
  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    try { await env.TRACKER.put(fk, String(fails + 1), { expirationTtl: 900 }); } catch {}
    return 401;
  }
  return 200;
}
export async function onRequestGet({ env }) {
  const [v, m] = await Promise.all([env.TRACKER.get("site:on"), env.TRACKER.get("site:msg")]);
  return Response.json({ on: v !== "0", message: m || "" }, { headers: { "cache-control": "no-store" } });
}
export async function onRequestPost({ request, env }) {
  const st = await authed(request, env);
  if (st !== 200) return new Response(st === 429 ? "Too many attempts" : "Unauthorized", { status: st });
  const { on, message } = await request.json().catch(() => ({}));
  if (typeof on !== "boolean") return new Response("Bad data", { status: 400 });
  if (message != null && typeof message !== "string") return new Response("Bad data", { status: 400 });
  const msg = on ? "" : String(message || "").trim().slice(0, 200);
  await env.TRACKER.put("site:on", on ? "1" : "0");
  if (msg) await env.TRACKER.put("site:msg", msg); else await env.TRACKER.delete("site:msg");
  if (env.DISCORD_WEBHOOK) await fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: on ? "✅ Site turned **ON** (admin panel)" : "🛑 Site turned **OFF** (admin panel)" + (msg ? `\nMessage: ${msg}` : ""), allowed_mentions: { parse: [] } }) }).catch(() => {});
  return Response.json({ on, message: msg });
}
