// Visit / error / leave logs -> Discord. Webhook stays in the DISCORD_WEBHOOK secret.
const clip = (s, n = 300) => String(s ?? "").slice(0, n) || "-";
const f = (name, value, inline = true) => ({ name, value: clip(value), inline });

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_WEBHOOK) return new Response("ok");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response("forbidden", { status: 403 });
  let b; try { b = await request.json(); } catch { return new Response("bad request", { status: 400 }); }

  const type = ["error", "leave"].includes(b.type) ? b.type : "visit";
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const cf = request.cf || {};

  if (env.TRACKER) {   // spam guard
    try {
      const key = `rl:${type}:${ip}`;
      if (await env.TRACKER.get(key)) return new Response("ok");
      await env.TRACKER.put(key, "1", { expirationTtl: type === "visit" ? 1800 : 60 });
    } catch {}
  }

  const where = [cf.city, cf.region, cf.country].filter(Boolean).join(", ") || "unknown";
  const ua = request.headers.get("user-agent");
  const d = b.d || {};
  let embed;
  if (type === "error") {
    embed = { title: "⚠️ Site JavaScript error", color: 0xff5b6e, fields: [
      f("Message", b.message, false), f("Source", b.source, false), f("Page", b.path), f("Visitor", `${ip} · ${where}`), f("Browser", ua, false)] };
  } else if (type === "leave") {
    embed = { title: "👋 Visitor left", color: 0x5b8cff, fields: [
      f("Time on site", `${b.secs ?? "?"} seconds`), f("Pages viewed", b.pages), f("Visitor", `${ip} · ${where}`), f("Trail", b.trail, false)] };
  } else {
    const mismatch = d.tz && cf.timezone && d.tz !== cf.timezone ? "⚠️ Browser timezone ≠ IP timezone (possible VPN/proxy)" : "Matches";
    embed = { title: "👀 New visit", color: 0x35e08a, fields: [
      f("Page", b.path), f("Came from", b.ref), f("Visitor type", d.returning ? "Returning" : "First visit"),
      f("IP address", ip), f("Location (from IP)", where), f("Timezone", `${d.tz || "-"} · IP says ${cf.timezone || "-"}`),
      f("VPN hint", mismatch, false),
      f("Network / ISP", `${cf.asOrganization || "-"} (AS${cf.asn || "?"})`, false),
      f("Device", d.device), f("Screen", `${d.screen || "-"} · viewport ${d.viewport || "-"} · ${d.dpr || "?"}x`), f("Language", d.lang),
      f("Theme", d.theme), f("Connection", d.conn), f("Hardware", d.hw),
      f("Edge / protocol", `${cf.colo || "-"} · ${cf.httpProtocol || "-"} · ${cf.tlsVersion || "-"}`),
      f("Link query (UTM etc.)", d.query),
      f("Browser", ua, false)] };
  }
  embed.timestamp = new Date().toISOString();
  try {
    await fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }) });
  } catch {}
  return new Response("ok");
}
