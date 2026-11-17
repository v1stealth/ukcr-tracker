// Point UptimeRobot / Better Stack at /api/health. Returns 500 if storage is broken.
export async function onRequestGet({ env }) {
  try { if (env.TRACKER) await env.TRACKER.get("data"); }
  catch { return new Response("storage error", { status: 500 }); }
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
