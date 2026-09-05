// functions/api/notes.js
export async function onRequestGet({ request, env }) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return Response.json({ error: "missing user" }, { status: 401 });

    const { results } = await env.fluore_notes_db
      .prepare("SELECT id, title, content, color, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC")
      .bind(userId)
      .all();

    return Response.json({ notes: results });
  } catch (error) {
    return Response.json({ error: "DB error: " + error.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return Response.json({ error: "missing user" }, { status: 401 });

    const { title, content, color } = await request.json();
    if (!title) return Response.json({ error: "title required" }, { status: 400 });

    // Generate a UUID for the ID since the database uses TEXT PRIMARY KEY
    const id = crypto.randomUUID();

    const result = await env.fluore_notes_db
      .prepare("INSERT INTO notes (id, user_id, title, content, color) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, title, content ?? "", color ?? null)
      .run();

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: "DB error: " + error.message }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return Response.json({ error: "missing user" }, { status: 401 });

    const { id, title, content, color } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    await env.fluore_notes_db
      .prepare("UPDATE notes SET title = ?, content = ?, color = ? WHERE id = ? AND user_id = ?")
      .bind(title, content ?? "", color ?? null, id, userId)
      .run();

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: "DB error: " + error.message }, { status: 500 });
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return Response.json({ error: "missing user" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    await env.fluore_notes_db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: "DB error: " + error.message }, { status: 500 });
  }
}