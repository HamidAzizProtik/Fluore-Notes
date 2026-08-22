/**
 * Fluore Notes — Cloudflare Worker (D1-only, no localStorage fallback)
 *
 * Serves static frontend from ./public and exposes /api/notes.
 * Every request is authenticated with a Clerk session token.
 * Every D1 query is scoped to the authenticated user_id.
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const createNoteSchema = z.object({
	title: z.string().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
	content: z.string().max(10000, 'Content must be under 10,000 characters').default(''),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').nullable().optional(),
});

const updateNoteSchema = z.object({
	title: z.string().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
	content: z.string().max(10000, 'Content must be under 10,000 characters').default(''),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').nullable().optional(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NOTES_PREFIX = '/api/notes';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...extraHeaders,
		},
	});
}

async function getUserId(request, env) {
	const auth = request.headers.get('Authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	const token = auth.slice('Bearer '.length).trim();
	try {
		const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(env.CLERK_JWKS_URL)), {
			issuer: env.CLERK_ISSUER,
		});
		return payload.sub ?? null;
	} catch (err) {
		console.error('Clerk token verification failed:', err);
		return null;
	}
}

function parsePagination(url) {
	const params = new URL(url).searchParams;
	let limit = parseInt(params.get('limit') || String(DEFAULT_LIMIT), 10);
	let offset = parseInt(params.get('offset') || '0', 10);

	if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
	if (isNaN(offset) || offset < 0) offset = 0;
	if (limit > MAX_LIMIT) limit = MAX_LIMIT;

	return { limit, offset };
}

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400',
	};
}

// ---------------------------------------------------------------------------
// D1 CRUD — parameterized, scoped to user_id
// ---------------------------------------------------------------------------
async function listNotes(env, userId, limit, offset) {
	const { results } = await env.DB.prepare(
		`SELECT id, user_id, title, content, color, created_at, updated_at
		 FROM notes
		 WHERE user_id = ?
		 ORDER BY updated_at DESC, id DESC
		 LIMIT ? OFFSET ?`
	)
		.bind(userId, limit + 1, offset)
		.all();

	const hasMore = results.length > limit;
	const notes = hasMore ? results.slice(0, limit) : results;

	return json({
		notes,
		pagination: { limit, offset, hasMore },
	});
}

async function createNote(env, userId, body) {
	const validated = createNoteSchema.parse(body);
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await env.DB.prepare(
		`INSERT INTO notes (id, user_id, title, content, color, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(id, userId, validated.title, validated.content, validated.color, now, now)
		.run();

	return json(
		{
			id,
			user_id: userId,
			title: validated.title,
			content: validated.content,
			color: validated.color,
			created_at: now,
			updated_at: now,
		},
		201
	);
}

async function updateNote(env, userId, id, body) {
	const validated = updateNoteSchema.parse(body);
	const updatedAt = new Date().toISOString();

	const { meta } = await env.DB.prepare(
		`UPDATE notes SET title = ?, content = ?, color = ?, updated_at = ?
		 WHERE id = ? AND user_id = ?`
	)
		.bind(validated.title, validated.content, validated.color, updatedAt, id, userId)
		.run();

	if (meta.changes === 0) {
		return json({ error: 'Note not found' }, 404);
	}

	// Fetch the complete updated row to return created_at
	const { results } = await env.DB.prepare(
		`SELECT id, user_id, title, content, color, created_at, updated_at
		 FROM notes WHERE id = ? AND user_id = ?`
	)
		.bind(id, userId)
		.all();

	const note = results[0];
	return json(note);
}

async function deleteNoteById(env, userId, id) {
	const { meta } = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.run();

	if (meta.changes === 0) {
		return json({ error: 'Note not found' }, 404);
	}
	return json({ success: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders() });
		}

		// --- API routes ---
		if (url.pathname === NOTES_PREFIX || url.pathname.startsWith(NOTES_PREFIX + '/')) {
			const userId = await getUserId(request, env);
			if (!userId) {
				return json({ error: 'Unauthorized' }, 401, corsHeaders());
			}

			// Collection: /api/notes
			if (url.pathname === NOTES_PREFIX) {
				if (request.method === 'GET') {
					const { limit, offset } = parsePagination(url.href);
					return listNotes(env, userId, limit, offset);
				}
				if (request.method === 'POST') {
					if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
						return json({ error: 'Payload too large' }, 413, corsHeaders());
					}
					let body;
					try {
						body = await request.json();
					} catch {
						return json({ error: 'Invalid JSON body' }, 400, corsHeaders());
					}
					return createNote(env, userId, body);
				}
				return json({ error: 'Method not allowed' }, 405, corsHeaders());
			}

			// Item: /api/notes/:id
			const id = decodeURIComponent(url.pathname.slice(NOTES_PREFIX.length + 1));
			if (!id) {
				return json({ error: 'Missing note id' }, 400, corsHeaders());
			}

			if (request.method === 'PUT') {
				if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
					return json({ error: 'Payload too large' }, 413, corsHeaders());
				}
				let body;
				try {
					body = await request.json();
				} catch {
					return json({ error: 'Invalid JSON body' }, 400, corsHeaders());
				}
				return updateNote(env, userId, id, body);
			}
			if (request.method === 'DELETE') {
				return deleteNoteById(env, userId, id);
			}
			return json({ error: 'Method not allowed' }, 405, corsHeaders());
		}

		// --- Public health check ---
		if (url.pathname === '/api/health') {
			return json({ status: 'ok' });
		}

		// --- Static assets ---
		return env.ASSETS.fetch(request);
	},
};
