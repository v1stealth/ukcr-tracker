// GET: is the site on?  POST {on:true|false} (admin password): turn it on/off.
async function authed(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown", fk = "fail:" + ip;
  let fails = 0; try { fails = +(await env.TRACKER.get(fk)) || 0; } catch {}
  if (fails >= 8) return 429;
  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    try { await env.TRACKER.put(fk, String(fails + 1), { expirationTtl: 900 }); } catch {}
    return 401;
  }
  return 200;
}
export async function onRequestGet({ env }) {
  return Response.json({ on: (await env.TRACKER.get("site:on")) !== "0" }, { headers: { "cache-control": "no-store" } });
}
export async function onRequestPost({ request, env }) {
  const st = await authed(request, env);
  if (st !== 200) return new Response(st === 429 ? "Too many attempts" : "Unauthorized", { status: st });
  const { on } = await request.json().catch(() => ({}));
  if (typeof on !== "boolean") return new Response("Bad data", { status: 400 });
  await env.TRACKER.put("site:on", on ? "1" : "0");
  if (env.DISCORD_WEBHOOK) await fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: on ? "✅ Site turned **ON** (admin panel)" : "🛑 Site turned **OFF** (admin panel)", allowed_mentions: { parse: [] } }) }).catch(() => {});
  return Response.json({ on });
}
