// Admin-only image upload. Images are stored in the TRACKER KV namespace and served at /api/img/<id>.
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!TYPES[type]) return new Response("Only PNG, JPG, GIF or WebP images.", { status: 415 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 5 * 1024 * 1024) return new Response("Image is over 5 MB.", { status: 413 });
  const id = crypto.randomUUID().replace(/-/g, "") + "." + TYPES[type];
  await env.TRACKER.put("img:" + id, buf, { metadata: { type } });
  return Response.json({ url: "/api/img/" + id });
}
