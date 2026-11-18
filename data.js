// Anonymous, short-lived key for rate limiting (the real IP is never stored or shown anywhere).
const hid = async (request, env) => {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + (env.ADMIN_PASSWORD || "salt")));
  return [...new Uint8Array(h)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
};
const hook = (env, content) => env.DISCORD_WEBHOOK ? fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) }).catch(() => {}) : null;

const CK = () => new Request("https://cache.local/api/data");
// Cached ~5s at the edge so lots of open pages polling for live updates don't hammer KV.
export async function onRequestGet({ env, waitUntil }) {
  const h = { "content-type": "application/json", "cache-control": "no-store" };
  try { const c = await caches.default.match(CK()); if (c) return new Response(await c.text(), { headers: h }); } catch {}
  const v = (await env.TRACKER.get("data")) || "null";
  try { waitUntil(caches.default.put(CK(), new Response(v, { headers: { "cache-control": "s-maxage=5" } }))); } catch {}
  return new Response(v, { headers: h });
}

const strip = w => { const { updated, ...r } = w; return JSON.stringify(r); };
const sig = b => JSON.stringify({ S: b.SITE, W: b.WEEKS.map(strip), A: b.ABOUT });

export async function onRequestPost({ request, env }) {
  const fk = "fail:" + await hid(request, env);
  let fails = 0; try { fails = +(await env.TRACKER.get(fk)) || 0; } catch {}
  if (fails >= 8) return new Response("Too many attempts. Try again in 15 minutes.", { status: 429 });

  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    try { await env.TRACKER.put(fk, String(fails + 1), { expirationTtl: 900 }); } catch {}
    await hook(env, `🔐 Failed admin login (attempt ${fails + 1})`);
    return new Response("Unauthorized", { status: 401 });
  }
  if (fails) { try { await env.TRACKER.delete(fk); } catch {} }
  const body = await request.json();
  if (body.check) { await hook(env, `🔑 Admin logged in`); return new Response("ok"); }
  if (!body.SITE || !Array.isArray(body.WEEKS)) return new Response("Bad data", { status: 400 });

  // Stamp "last edited" on every week whose content changed (done here so it can't be faked or forgotten).
  let prev = null; try { prev = JSON.parse(await env.TRACKER.get("data")); } catch {}
  const now = Date.now(), pm = new Map(((prev && prev.WEEKS) || []).map(w => [w.id, w]));
  body.WEEKS = body.WEEKS.map(w => {
    const { updated, ...rest } = w, p = pm.get(w.id);
    if (p && strip(p) === strip(w)) return p.updated ? { ...rest, updated: p.updated } : rest;
    return { ...rest, updated: now };
  });
  body.updatedAt = prev && prev.WEEKS && sig(prev) === sig(body) ? (prev.updatedAt || now) : now;
  await env.TRACKER.put("data", JSON.stringify(body));
  try { await caches.default.delete(CK()); } catch {}
  await hook(env, `✏️ Site edited`);
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
