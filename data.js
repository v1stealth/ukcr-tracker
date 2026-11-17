const hook = (env, content) => env.DISCORD_WEBHOOK ? fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) }).catch(() => {}) : null;

export async function onRequestGet({ env }) {
  const v = await env.TRACKER.get("data");
  return new Response(v || "null", { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const fk = "fail:" + ip;
  let fails = 0; try { fails = +(await env.TRACKER.get(fk)) || 0; } catch {}
  if (fails >= 8) return new Response("Too many attempts. Try again in 15 minutes.", { status: 429 });

  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    try { await env.TRACKER.put(fk, String(fails + 1), { expirationTtl: 900 }); } catch {}
    await hook(env, `🔐 Failed admin login from ${ip} (attempt ${fails + 1})`);
    return new Response("Unauthorized", { status: 401 });
  }
  if (fails) { try { await env.TRACKER.delete(fk); } catch {} }
  const body = await request.json();
  if (body.check) { await hook(env, `🔑 Admin logged in from ${ip}`); return new Response("ok"); }
  if (!body.SITE || !Array.isArray(body.WEEKS)) return new Response("Bad data", { status: 400 });
  await env.TRACKER.put("data", JSON.stringify(body));
  await hook(env, `✏️ Site edited from ${ip}`);
  return new Response("ok");
}
