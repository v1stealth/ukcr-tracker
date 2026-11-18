// /api/health: "ok" only when storage and the admin password are configured. UptimeRobot checks this too.
export async function onRequestGet({ env }) {
  if (!env.TRACKER) return new Response("PROBLEM: the TRACKER KV binding is missing", { status: 500 });
  if (!env.ADMIN_PASSWORD) return new Response("PROBLEM: the ADMIN_PASSWORD variable is missing", { status: 500 });
  try { await env.TRACKER.get("data"); } catch { return new Response("PROBLEM: storage error", { status: 500 }); }
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
