export async function onRequestGet({ env }) {
  const v = await env.TRACKER.get("data");
  return new Response(v || "null", {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await request.json();
  if (body.check) return new Response("ok");
  if (!body.SITE || !Array.isArray(body.WEEKS)) return new Response("Bad data", { status: 400 });
  await env.TRACKER.put("data", JSON.stringify(body));
  return new Response("ok");
}
