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

// Posts a JSON backup file to the DISCORD_WEBHOOK channel (keep that channel private).
const sendBackup = async (env, data, why) => {
  if (!env.DISCORD_WEBHOOK) return false;
  const fd = new FormData();
  fd.append("payload_json", JSON.stringify({ content: `💾 Backup (${why}) · ${(data.WEEKS || []).length} weeks`, allowed_mentions: { parse: [] } }));
  fd.append("files[0]", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
  try { return (await fetch(env.DISCORD_WEBHOOK, { method: "POST", body: fd })).ok; } catch { return false; }
};
const strip = w => { const { updated, ...r } = w; return JSON.stringify(r); };
const sig = b => JSON.stringify({ S: b.SITE, W: b.WEEKS.map(strip), A: b.ABOUT });

export async function onRequestPost({ request, env, waitUntil }) {
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
  // Saved versions: the last 10 previous versions are kept automatically (see below).
  const H = async () => { try { return JSON.parse(await env.TRACKER.get("data:hist")) || []; } catch { return []; } };
  if (body.history) return Response.json((await H()).map(x => ({ t: x.t, weeks: ((x.d && x.d.WEEKS) || []).length })), { headers: { "cache-control": "no-store" } });
  if (body.backup) {
    if (!env.DISCORD_WEBHOOK) return new Response("DISCORD_WEBHOOK isn't set in Cloudflare.", { status: 400 });
    let cur = null; try { cur = JSON.parse(await env.TRACKER.get("data")); } catch {}
    if (!cur) return new Response("Nothing saved yet to back up.", { status: 404 });
    return (await sendBackup(env, cur, "manual")) ? new Response("ok") : new Response("Discord rejected the backup.", { status: 502 });
  }
  if (body.version != null) { const x = (await H())[+body.version]; return x ? Response.json(x.d, { headers: { "cache-control": "no-store" } }) : new Response("No such version", { status: 404 }); }
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
  // Progress history for the home-page chart: one point per day, built here so it can't be faked.
  const ov = b => { const t = (b.WEEKS || []).flatMap(w => w.tasks || []); return t.length ? Math.round(t.reduce((a, x) => a + (+x.progress || 0), 0) / t.length) : 0; };
  const day = x => new Date(x).toISOString().slice(0, 10);
  let hs = prev && Array.isArray(prev.HISTORY) ? prev.HISTORY.slice() : (prev && prev.WEEKS ? [{ t: prev.updatedAt || now, o: ov(prev) }] : []);
  const pt = { t: now, o: ov(body) };
  if (hs.length && day(hs[hs.length - 1].t) === day(now)) hs[hs.length - 1] = pt; else hs.push(pt);
  body.HISTORY = hs.slice(-180);
  // Before overwriting, keep the previous version (only when something really changed).
  if (prev && prev.WEEKS && prev.SITE && sig(prev) !== sig(body)) {
    try { const h = await H(); h.unshift({ t: Date.now(), d: prev }); await env.TRACKER.put("data:hist", JSON.stringify(h.slice(0, 10))); } catch {}
  }
  await env.TRACKER.put("data", JSON.stringify(body));
  try { await caches.default.delete(CK()); } catch {}
  try {   // automatic Discord backup, at most once every 5 minutes
    if (env.DISCORD_WEBHOOK) { const last = +(await env.TRACKER.get("bk:t")) || 0;
      if (Date.now() - last > 300000) { await env.TRACKER.put("bk:t", String(Date.now()), { expirationTtl: 3600 }); const p = sendBackup(env, body, "auto"); try { waitUntil(p); } catch {} } }
  } catch {}
  await hook(env, `✏️ Site edited`);
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
