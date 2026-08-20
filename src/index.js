/**
 * Fluore Notes — Cloudflare Worker
 *
 * Serves the static frontend from ./public (via the ASSETS binding) and exposes
 * a notes API under /api/notes. Every API request is authenticated with a Clerk
 * session token and every D1 query is scoped to the authenticated user_id.
 *
 * This is a blank-slate backend: the frontend currently stores notes in
 * localStorage (see public/app.js -> CLOUD_SYNC_ENABLED). Flip that flag to
 * `true` once you have provisioned the D1 database and Clerk environment vars
 * to make the frontend talk to these routes.
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';

/**
 * @typedef {Object} Env
 * @property {Fetcher} ASSETS
 * @property {D1Database} DB
 * @property {string} CLERK_JWKS_URL
 * @property {string} CLERK_ISSUER
 */

const NOTES_PREFIX = '/api/notes';

// One RemoteJWKSet instance for the lifetime of the Worker (cold-start cached).
let jwks = null;
function getJWKS(env) {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL));
	}
	return jwks;
}

/**
 * Extract and verify the Clerk Bearer token, returning the user id (`sub`).
 * Returns null when the header is missing/invalid or verification fails.
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<string|null>}
 */
async function getUserId(request, env) {
	const auth = request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Bearer ')) {
		return null;
	}
	const token = auth.slice('Bearer '.length).trim();
	try {
		const { payload } = await jwtVerify(token, getJWKS(env), {
			issuer: env.CLERK_ISSUER,
		});
		return payload.sub ?? null;
	} catch (err) {
		console.error('Clerk token verification failed:', err);
		return null;
	}
}

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

// ---------------------------------------------------------------------------
// D1 CRUD — all statements are parameterized and scoped to `user_id`.
// ---------------------------------------------------------------------------

async function listNotes(env, userId) {
	const { results } = await env.DB.prepare(
		`SELECT id, user_id, title, content, color, created_at, updated_at
		 FROM notes WHERE user_id = ?
		 ORDER BY updated_at DESC`
	)
		.bind(userId)
		.all();
	return json(results);
}

async function createNote(env, userId, body) {
	const title = typeof body?.title === 'string' ? body.title.trim() : '';
	if (!title) {
		return json({ error: 'Title is required' }, 400);
	}
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const content = typeof body?.content === 'string' ? body.content : '';
	const color = typeof body?.color === 'string' ? body.color : null;

	await env.DB.prepare(
		`INSERT INTO notes (id, user_id, title, content, color, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(id, userId, title, content, color, now, now)
		.run();

	return json(
		{ id, user_id: userId, title, content, color, created_at: now, updated_at: now },
		201
	);
}

async function updateNote(env, userId, id, body) {
	const title = typeof body?.title === 'string' ? body.title.trim() : '';
	if (!title) {
		return json({ error: 'Title is required' }, 400);
	}
	const content = typeof body?.content === 'string' ? body.content : '';
	const color = typeof body?.color === 'string' ? body.color : null;
	const updatedAt = new Date().toISOString();

	const { meta } = await env.DB.prepare(
		`UPDATE notes SET title = ?, content = ?, color = ?, updated_at = ?
		 WHERE id = ? AND user_id = ?`
	)
		.bind(title, content, color, updatedAt, id, userId)
		.run();

	if (meta.changes === 0) {
		return json({ error: 'Note not found' }, 404);
	}
	return json({ id, user_id: userId, title, content, color, updated_at: updatedAt });
}

async function deleteNoteById(env, userId, id) {
	const { meta } = await env.DB.prepare(
		'DELETE FROM notes WHERE id = ? AND user_id = ?'
	)
		.bind(id, userId)
		.run();

	if (meta.changes === 0) {
		return json({ error: 'Note not found' }, 404);
	}
	return json({ success: true });
}

export default {
	/**
	 * @param {Request} request
	 * @param {Env} env
	 */
	async fetch(request, env) {
		const url = new URL(request.url);

		// --- API routes ---
		if (url.pathname === NOTES_PREFIX || url.pathname.startsWith(NOTES_PREFIX + '/')) {
			const userId = await getUserId(request, env);
			if (!userId) {
				return json({ error: 'Unauthorized' }, 401);
			}

			// Collection: /api/notes
			if (url.pathname === NOTES_PREFIX) {
				if (request.method === 'GET') return listNotes(env, userId);
				if (request.method === 'POST') {
					let body;
					try {
						body = await request.json();
					} catch {
						return json({ error: 'Invalid JSON body' }, 400);
					}
					return createNote(env, userId, body);
				}
				return json({ error: 'Method not allowed' }, 405);
			}

			// Item: /api/notes/:id
			const id = decodeURIComponent(url.pathname.slice(NOTES_PREFIX.length + 1));
			if (!id) {
				return json({ error: 'Missing note id' }, 400);
			}

			if (request.method === 'PUT') {
				let body;
				try {
					body = await request.json();
				} catch {
					return json({ error: 'Invalid JSON body' }, 400);
				}
				return updateNote(env, userId, id, body);
			}
			if (request.method === 'DELETE') {
				return deleteNoteById(env, userId, id);
			}
			return json({ error: 'Method not allowed' }, 405);
		}

		// --- Public health check (handy for uptime monitors) ---
		if (url.pathname === '/api/health') {
			return json({ status: 'ok' });
		}

		// --- Static assets (served from the same origin as the API, so no
		//     CORS configuration is required for the production app) ---
		return env.ASSETS.fetch(request);
	},
};
