// Site on/off switch. When the flag "site:on" is "0", visitors get a maintenance page (HTTP 503).
// The optional "site:msg" value is shown on that page (set with /site off message:"Back at 6pm" or from the Edit page).
let cache = { t: 0, on: true, msg: "" };
async function state(env) {
  if (!env.TRACKER) return { on: true, msg: "" };
  if (Date.now() - cache.t < 5000) return cache;
  try {
    const [v, m] = await Promise.all([env.TRACKER.get("site:on"), env.TRACKER.get("site:msg")]);
    cache = { t: Date.now(), on: v !== "0", msg: m || "" };
  } catch {}
  return cache;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = msg => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back soon</title>
<style>:root{color-scheme:dark;--bg:#07090f;--text:#e8ecf5;--muted:#9aa4b8;--field:#0e1220;--line:#243051;--ok:#2ee6a0}
@media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#f3f5fb;--text:#141a2b;--muted:#566077;--field:#fff;--line:#c9d1e4;--ok:#12b57f}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;text-align:center;padding:20px}
h1{margin:0 0 8px}p{color:var(--muted)}.why{color:var(--text);font-size:1.15rem;max-width:32ch;margin:14px auto 0;overflow-wrap:anywhere}details{margin-top:40px;color:var(--muted);font-size:.85rem}
input,button{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--field);color:var(--text)}button{cursor:pointer;border-color:var(--ok)}</style></head>
<body><div><h1>We’ll be back soon</h1>${msg ? `<p class="why">${esc(msg)}</p>` : `<p>The site is temporarily offline.</p>`}
<details><summary>Owner login</summary><p><input id="p" type="password" placeholder="Admin password"> <button id="b">Turn site on</button></p><p id="m"></p></details></div>
<script>document.getElementById("b").onclick=async()=>{const m=document.getElementById("m");m.textContent="Working...";
const r=await fetch("/api/site",{method:"POST",headers:{"content-type":"application/json","x-admin-password":document.getElementById("p").value},body:JSON.stringify({on:true})}).catch(()=>null);
if(r&&r.ok){m.textContent="Site is back on. Reloading...";setTimeout(()=>location.reload(),6000)}else m.textContent=r?(r.status===401?"Wrong password.":"Error "+r.status):"Network error"}</script></body></html>`;

export async function onRequest({ request, env, next }) {
  const s = await state(env);
  if (s.on) return next();
  const path = new URL(request.url).pathname;
  if (["/api/site", "/api/discord", "/api/health"].includes(path)) return next();
  if (path.startsWith("/api/")) return new Response("Site is offline", { status: 503 });
  return new Response(page(s.msg), { status: 503, headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } });
}
