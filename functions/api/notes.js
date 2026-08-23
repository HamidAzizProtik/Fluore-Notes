export async function onRequestGet(context) {
    // context.env.DB matches the binding name in wrangler.toml
    const { results } = await context.env.DB.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
    return Response.json(results);
}

export async function onRequestPost(context) {
    const body = await context.request.json();
    await context.env.DB.prepare("INSERT INTO notes (content) VALUES (?)").bind(body.content).run();
    return new Response(JSON.stringify({ message: "Note created" }), { 
        status: 201, 
        headers: { "Content-Type": "application/json" }
    });
}