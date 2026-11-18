// Real uptime from UptimeRobot. Needs the UPTIMEROBOT_KEY secret (use the READ-ONLY API key).
export async function onRequestGet({ env }) {
  if (!env.UPTIMEROBOT_KEY) return Response.json({ ok: false });
  try {
    const r = await fetch("https://api.uptimerobot.com/v2/getMonitors", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: env.UPTIMEROBOT_KEY, format: "json", custom_uptime_ratios: "1-7-30", all_time_uptime_ratio: "1" }) });
    const m = ((await r.json()).monitors || [])[0];
    if (!m) return Response.json({ ok: false });
    const [d1, d7, d30] = String(m.custom_uptime_ratio || "").split("-");
    return Response.json({ ok: true, status: m.status, d1, d7, d30, all: m.all_time_uptime_ratio }, { headers: { "cache-control": "public, max-age=300" } });
  } catch { return Response.json({ ok: false }); }
}
