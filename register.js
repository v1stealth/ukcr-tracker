// POST (admin password): registers the Discord slash commands. Needs DISCORD_APP_ID + DISCORD_BOT_TOKEN (and optionally DISCORD_GUILD_ID).
const req = (type, name, description, extra = {}) => ({ type, name, description, required: true, ...extra });
const CMDS = [
  { name: "site", description: "Turn the website on or off, or check its status", options: [req(3, "action", "What to do", { choices: ["on", "off", "status"].map(v => ({ name: v, value: v })) })] },
  { name: "weeks", description: "List all weeks" },
  { name: "week", description: "Show one week's tasks", options: [req(4, "id", "Week number")] },
  { name: "progress", description: "Set a task's progress", options: [req(4, "week", "Week number"), req(4, "task", "Task number (see /week)", { min_value: 1 }), req(4, "percent", "0 to 100", { min_value: 0, max_value: 100 })] },
  { name: "archive", description: "Move a week to past weeks (or back to current)", options: [req(4, "week", "Week number"), req(5, "past", "true = past weeks, false = current", { required: false })] },
  { name: "addweek", description: "Add a new week", options: [req(3, "title", "Week title"), req(3, "dates", "Dates, e.g. 17 - 23 Nov", { required: false })] }
];
export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown", fk = "fail:" + ip;
  let fails = 0; try { fails = +(await env.TRACKER.get(fk)) || 0; } catch {}
  if (fails >= 8) return new Response("Too many attempts", { status: 429 });
  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    try { await env.TRACKER.put(fk, String(fails + 1), { expirationTtl: 900 }); } catch {}
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.DISCORD_APP_ID || !env.DISCORD_BOT_TOKEN) return new Response("Add the DISCORD_APP_ID and DISCORD_BOT_TOKEN secrets in Cloudflare first, then redeploy.", { status: 400 });
  const url = `https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/` + (env.DISCORD_GUILD_ID ? `guilds/${env.DISCORD_GUILD_ID}/commands` : "commands");
  const r = await fetch(url, { method: "PUT", headers: { authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json" }, body: JSON.stringify(CMDS) });
  return new Response(r.ok ? `Registered ${CMDS.length} commands. Try /site status in Discord.` : `Discord said ${r.status}: ${(await r.text()).slice(0, 200)}`, { status: r.ok ? 200 : 502 });
}
