export async function onRequestGet({ params, env }) {
  const { value, metadata } = await env.TRACKER.getWithMetadata("img:" + params.id, "arrayBuffer");
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, { headers: {
    "content-type": (metadata && metadata.type) || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff" } });
}
