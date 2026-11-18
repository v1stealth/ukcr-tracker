// Real uptime from UptimeRobot. Needs the UPTIMEROBOT_KEY secret (use the READ-ONLY API key).
// Optional: UPTIMEROBOT_MONITOR_ID = the ID of the one monitor to show (recommended if you have more than one monitor).
export async function onRequestGet({ env }) {
  if (!env.UPTIMEROBOT_KEY) return Response.json({ ok: false });
  try {
    const params = { api_key: env.UPTIMEROBOT_KEY, format: "json", custom_uptime_ratios: "1-7-30", all_time_uptime_ratio: "1" };
    const id = String(env.UPTIMEROBOT_MONITOR_ID || "").trim();
    if (id) params.monitors = id;
    const r = await fetch("https://api.uptimerobot.com/v2/getMonitors", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
    const list = (await r.json()).monitors || [];
    // With no ID set, ignore any monitor named like "admin" and use the first remaining one.
    const m = id ? list[0] : (list.find(x => !/admin/i.test(x.friendly_name || "")) || list[0]);
    if (!m) return Response.json({ ok: false });
    const [d1, d7, d30] = String(m.custom_uptime_ratio || "").split("-");
    return Response.json({ ok: true, status: m.status, d1, d7, d30, all: m.all_time_uptime_ratio }, { headers: { "cache-control": "public, max-age=300" } });
  } catch { return Response.json({ ok: false }); }
}
