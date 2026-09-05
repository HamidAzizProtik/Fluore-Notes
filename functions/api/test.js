// functions/api/test.js
export async function onRequestGet({ request, env }) {
  return Response.json({ message: "API is working", env: Object.keys(env) });
}