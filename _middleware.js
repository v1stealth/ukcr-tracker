// Site on/off switch. When the flag "site:on" is "0", visitors get a maintenance page (HTTP 503).
let cache = { t: 0, on: true };
async function isOn(env) {
  if (!env.TRACKER) return true;
  if (Date.now() - cache.t < 5000) return cache.on;
  try { cache = { t: Date.now(), on: (await env.TRACKER.get("site:on")) !== "0" }; } catch {}
  return cache.on;
}
const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back soon</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07090f;color:#e8ecf5;font-family:system-ui,sans-serif;text-align:center;padding:20px}
h1{margin:0 0 8px}p{color:#9aa4b8}details{margin-top:40px;color:#9aa4b8;font-size:.85rem}
input,button{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid #243051;background:#0e1220;color:#e8ecf5}button{cursor:pointer;border-color:#2ee6a0}</style></head>
<body><div><h1>We’ll be back soon</h1><p>The site is temporarily offline.</p>
<details><summary>Owner login</summary><p><input id="p" type="password" placeholder="Admin password"> <button id="b">Turn site on</button></p><p id="m"></p></details></div>
<script>document.getElementById("b").onclick=async()=>{const m=document.getElementById("m");m.textContent="Working...";
const r=await fetch("/api/site",{method:"POST",headers:{"content-type":"application/json","x-admin-password":document.getElementById("p").value},body:JSON.stringify({on:true})}).catch(()=>null);
if(r&&r.ok){m.textContent="Site is back on. Reloading...";setTimeout(()=>location.reload(),6000)}else m.textContent=r?(r.status===401?"Wrong password.":"Error "+r.status):"Network error"}</script></body></html>`;

export async function onRequest({ request, env, next }) {
  if (await isOn(env)) return next();
  const path = new URL(request.url).pathname;
  if (["/api/site", "/api/discord", "/api/health"].includes(path)) return next();
  if (path.startsWith("/api/")) return new Response("Site is offline", { status: 503 });
  return new Response(PAGE, { status: 503, headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } });
}
