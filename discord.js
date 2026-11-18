// Discord slash-command endpoint (set it as the "Interactions Endpoint URL" in the Discord Developer Portal).
const hex = h => Uint8Array.from(h.match(/../g).map(b => parseInt(b, 16)));
async function verify(env, request, body) {
  const sig = request.headers.get("x-signature-ed25519"), ts = request.headers.get("x-signature-timestamp");
  const pk = String(env.DISCORD_PUBLIC_KEY || "").trim();
  if (!sig || !ts || !/^[0-9a-f]{64}$/i.test(pk)) return false;
  const data = new TextEncoder().encode(ts + body);
  for (const alg of [{ name: "Ed25519" }, { name: "NODE-ED25519", namedCurve: "NODE-ED25519" }]) {
    try {
      const key = await crypto.subtle.importKey("raw", hex(pk), alg, false, ["verify"]);
      return await crypto.subtle.verify(alg, key, hex(sig), data);
    } catch {}
  }
  return false;
}
const reply = (content, priv) => Response.json({ type: 4, data: { content: String(content).slice(0, 1900), flags: priv ? 64 : 0, allowed_mentions: { parse: [] } } });
const avg = w => w.tasks.length ? Math.round(w.tasks.reduce((a, t) => a + (+t.progress || 0), 0) / w.tasks.length) : 0;

// Open /api/discord in a browser to see whether the setup looks right (no secrets are shown).
export async function onRequestGet({ env }) {
  const k = String(env.DISCORD_PUBLIC_KEY || "").trim();
  return Response.json({ endpoint: "deployed", publicKey: !k ? "MISSING" : /^[0-9a-f]{64}$/i.test(k) ? "looks correct" : `WRONG FORMAT (length ${k.length}; it must be 64 letters/numbers)`,
    adminIds: env.DISCORD_ADMIN_IDS ? "set" : "MISSING", storage: env.TRACKER ? "connected" : "MISSING" }, { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  if (!(await verify(env, request, body))) return new Response("Bad signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return Response.json({ type: 1 });          // Discord's PING check
  if (it.type !== 2) return new Response("Unsupported", { status: 400 });

  const uid = ((it.member && it.member.user) || it.user || {}).id;
  const admins = (env.DISCORD_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!admins.includes(uid)) return reply("⛔ You’re not allowed to use this.", true);

  const o = Object.fromEntries((it.data.options || []).map(x => [x.name, x.value]));
  const name = it.data.name;

  if (name === "site") {
    if (o.action === "status") {
      if ((await env.TRACKER.get("site:on")) !== "0") return reply("🟢 The site is ON.", true);
      const m = await env.TRACKER.get("site:msg");
      return reply("🔴 The site is OFF (maintenance page)." + (m ? `\nVisitors see: “${m}”` : ""), true);
    }
    if (o.action === "on") {
      await env.TRACKER.put("site:on", "1"); await env.TRACKER.delete("site:msg");
      return reply(`✅ Site turned **ON** by <@${uid}> (live within a few seconds).`);
    }
    const m = String(o.message || "").trim().slice(0, 200);
    await env.TRACKER.put("site:on", "0");
    if (m) await env.TRACKER.put("site:msg", m); else await env.TRACKER.delete("site:msg");
    return reply(`🛑 Site turned **OFF** by <@${uid}>. Visitors see a maintenance page${m ? `: “${m}”` : ""}. Use \`/site on\` to bring it back.`);
  }

  const raw = await env.TRACKER.get("data");
  if (!raw) return reply("Save the site once from the Edit page first, then try again.", true);
  const D = JSON.parse(raw), find = id => D.WEEKS.find(w => +w.id === +id), save = () => env.TRACKER.put("data", JSON.stringify(D));

  if (name === "weeks") return reply(D.WEEKS.map(w => `**#${w.id}** ${w.title} · ${avg(w)}%${w.archived ? " · past" : ""}`).join("\n") || "No weeks yet.", true);
  if (name === "week") {
    const w = find(o.id); if (!w) return reply("No week with that number. Use /weeks.", true);
    return reply(`**${w.title}** (${w.dates})${w.archived ? " · past" : ""}\n` + (w.tasks.map((t, i) => `${i + 1}. ${t.name} — ${t.progress}%`).join("\n") || "No tasks."), true);
  }
  if (name === "progress") {
    const w = find(o.week), t = w && w.tasks[o.task - 1];
    if (!t) return reply("Couldn’t find that week/task. Use /week to see task numbers.", true);
    t.progress = Math.min(100, Math.max(0, +o.percent || 0)); await save();
    return reply(`✅ ${w.title}: **${t.name}** set to ${t.progress}%`);
  }
  if (name === "archive") {
    const w = find(o.week); if (!w) return reply("No week with that number. Use /weeks.", true);
    w.archived = o.past !== false; await save();
    return reply(`✅ **${w.title}** moved to ${w.archived ? "past weeks" : "current weeks"}.`);
  }
  if (name === "addweek") {
    const id = Math.max(0, ...D.WEEKS.map(w => +w.id)) + 1;
    D.WEEKS.push({ id, title: String(o.title).slice(0, 100), dates: String(o.dates || "").slice(0, 60), summary: "", tasks: [], notes: "", archived: false, images: [] });
    await save(); return reply(`✅ Added week **#${id}**. Add tasks and details from the Edit page.`);
  }
  return reply("Unknown command.", true);
}
