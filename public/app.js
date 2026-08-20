// app/app.js

/**
 * ---------------------------------------------------------------------------
 * STORAGE MODE
 * ---------------------------------------------------------------------------
 * This build keeps the browser's localStorage as the EXCLUSIVE store so the app
 * works fully offline with zero backend dependencies. The Cloudflare Worker
 * (src/index.js) + D1 database is already scaffolded and ready as a production
 * backend — flip CLOUD_SYNC_ENABLED to `true` once you have:
 *
 *   1. Provisioned D1:        npm run db:create
 *                              (paste the database_id into wrangler.jsonc)
 *   2. Applied the schema:    npm run db:migrate:remote
 *   3. Set the Clerk vars in  wrangler.jsonc (CLERK_JWKS_URL / CLERK_ISSUER)
 *   4. Deployed:             npm run deploy
 *
 * With CLOUD_SYNC_ENABLED = true, every note is read/written through /api/notes
 * and is strictly scoped to the signed-in user (the Worker verifies the Clerk
 * token and filters all queries by user_id).
 * ---------------------------------------------------------------------------
 */
const CLOUD_SYNC_ENABLED = true;

// Relative origin so the API shares the same host as the static assets.
// Because frontend + API are same-origin, no CORS configuration is required.
const API_BASE = '/api';

const STORAGE_KEY = 'fluore_notes';

let notes = [];
let editingNoteId = null;

const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>`;

function sanitize(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function getAuthHeaders() {
  if (!window.Clerk?.session) {
    throw new Error('Not authenticated');
  }
  // Clerk session token -> sent as a Bearer token so the Worker can verify it
  // and extract the user id. Used by the cloud-sync path (see CLOUD_SYNC_ENABLED).
  const token = await window.Clerk.session.getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// --- Local persistence (exclusive store while CLOUD_SYNC_ENABLED is false) ---
function loadNotesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read notes from localStorage:', err);
    return [];
  }
}

function saveNotesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error('Failed to persist notes to localStorage:', err);
  }
}

async function fetchNotes() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/notes`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch notes');
  }

  notes = await response.json();
  renderNotes();
}

async function saveNoteToApi(note) {
  const headers = await getAuthHeaders();
  const method = note._isEdit ? 'PUT' : 'POST';
  const url = note._isEdit
    ? `${API_BASE}/notes/${encodeURIComponent(note.id)}`
    : `${API_BASE}/notes`;

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({
      title: note.title,
      content: note.content,
      color: note.color,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to save note');
  }

  if (method === 'POST') {
    const saved = await response.json();
    return saved;
  }
  return note;
}

async function deleteNoteFromApi(noteId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to delete note');
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function saveNote(event) {
  event.preventDefault();

  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const color = document.getElementById('noteColor').value;

  const isEdit = editingNoteId !== null;
  const note = {
    id: editingNoteId || generateId(),
    title,
    content,
    color,
    _isEdit: isEdit,
  };

  try {
    if (isEdit) {
      const index = notes.findIndex((n) => n.id === editingNoteId);
      if (index !== -1) {
        notes[index] = { ...notes[index], title, content, color };
      }
    } else {
      notes.unshift(note);
    }

    if (CLOUD_SYNC_ENABLED) {
      const saved = await saveNoteToApi(note);
      if (!isEdit && saved && saved.id) {
        const index = notes.findIndex((n) => n.id === note.id);
        if (index !== -1) {
          notes[index] = saved;
        }
      }
    } else {
      saveNotesToStorage();
    }

    closeNoteDialog();
    renderNotes();
  } catch (err) {
    console.error('Failed to save note:', err);
    alert('Failed to save note. Please try again.');
    if (CLOUD_SYNC_ENABLED) {
      if (isEdit) {
        await fetchNotes();
      } else {
        notes = notes.filter((n) => n.id !== note.id);
        renderNotes();
      }
    }
  }
}

async function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;

  try {
    notes = notes.filter((note) => note.id !== noteId);
    renderNotes();

    if (CLOUD_SYNC_ENABLED) {
      await deleteNoteFromApi(noteId);
    } else {
      saveNotesToStorage();
    }
  } catch (err) {
    console.error('Failed to delete note:', err);
    alert('Failed to delete note. Please try again.');
    if (CLOUD_SYNC_ENABLED) {
      await fetchNotes();
    }
  }
}

function renderNotes(searchTerm = '') {
  const notesContainer = document.getElementById('notesContainer');
  if (!notesContainer) return;

  if (notes.length === 0) {
    notesContainer.innerHTML = `
      <div class="empty-state">
        <h2>Ready to plan your next step?</h2>
        <button class="add-note-btn" onclick="openNoteDialog()">+ Add your first note</button>
      </div>
    `;
    return;
  }

  const cleanSearch = searchTerm.trim();
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(cleanSearch.toLowerCase())
  );

  if (filteredNotes.length === 0) {
    const suggestedNote = notes.find(
      (note) =>
        note.title.toLowerCase().startsWith(cleanSearch.charAt(0).toLowerCase()) ||
        note.content.toLowerCase().includes(cleanSearch.toLowerCase())
    );

    const suggestionHTML = suggestedNote
      ? `<p>Did you mean <strong>"${sanitize(suggestedNote.title)}"</strong>?</p>`
      : `<p>Check for typos or try searching with a different keyword.</p>`;

    notesContainer.innerHTML = `
      <div class="empty-state">
        <h2>No notes found for "${sanitize(cleanSearch)}"</h2>
        ${suggestionHTML}
        <button class="add-note-btn" style="margin-top: 1rem;" onclick="openNoteDialog()">+ Create "${sanitize(cleanSearch)}"</button>
      </div>
    `;
    return;
  }

  notesContainer.innerHTML = filteredNotes
    .map(
      (note) => `
      <div class="note-card" style="background-color: ${sanitize(note.color) || 'var(--surface-color)'};">
        <h3 class="note-title">${sanitize(note.title)}</h3>
        <p class="note-content">${sanitize(note.content)}</p>
        <div class="note-actions">
          <button class="edit-btn" onclick="openNoteDialog('${sanitize(note.id)}')" title="Edit Note">
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M216-216h51l375-375-51-51-375 375v51Zm-72 72v-153l498-498q11-11 23.84-16 12.83-5 27-5 14.16 0 27.16 5t24 16l51 51q11 11 16 24t5 26.54q0 14.45-5.02 27.54T795-642L297-144H144Zm600-549-51-51 51 51Zm-127.95 76.95L591-642l51 51-25.95-25.05Z"/>
            </svg>
          </button>
          <button class="delete-btn" onclick="deleteNote('${sanitize(note.id)}')" title="Delete Note">
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="m291-240-51-51 189-189-189-189 51-51 189 189 189-189 51 51-189 189 189 189-51 51-189-189-189 189Z"/>
            </svg>
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function openNoteDialog(noteId = null) {
  const dialog = document.getElementById('noteDialog');
  const titleInput = document.getElementById('noteTitle');
  const contentInput = document.getElementById('noteContent');
  const colorSelect = document.getElementById('noteColor');

  if (noteId) {
    const noteToEdit = notes.find((note) => note.id === noteId);
    editingNoteId = noteId;
    document.getElementById('dialogTitle').textContent = 'Edit Note';
    titleInput.value = noteToEdit.title;
    contentInput.value = noteToEdit.content;
    colorSelect.value = noteToEdit.color || '';
  } else {
    editingNoteId = null;
    document.getElementById('dialogTitle').textContent = 'Add New Note';
    titleInput.value = '';
    contentInput.value = '';
    colorSelect.value = '';
  }

  dialog.showModal();
  titleInput.focus();
}

function closeNoteDialog() {
  document.getElementById('noteDialog').close();
}

function ToggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.getElementById('themeToggleBtn').innerHTML = isDark ? sunIcon : moonIcon;

  if (window.Clerk && window.Clerk.user) {
    window.Clerk.mountUserButton(document.getElementById('userButton'), {
      afterSignOutUrl: window.location.href,
      appearance: {
        variables: getThemeSync(),
        elements: getThemeElements(),
      },
    });
  }
}

function applyStoredTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.innerHTML = sunIcon;
  } else {
    if (themeToggleBtn) themeToggleBtn.innerHTML = moonIcon;
  }
}

async function initNotesApp() {
  if (CLOUD_SYNC_ENABLED) {
    try {
      await fetchNotes();
    } catch (err) {
      console.error('Failed to load notes:', err);
      notes = [];
      renderNotes();
    }
  } else {
    notes = loadNotesFromStorage();
    renderNotes();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  applyStoredTheme();

  const noteForm = document.getElementById('noteForm');
  if (noteForm) {
    noteForm.addEventListener('submit', saveNote);
  }

  document.getElementById('themeToggleBtn').addEventListener('click', ToggleTheme);

  const noteDialog = document.getElementById('noteDialog');
  if (noteDialog) {
    noteDialog.addEventListener('click', function (event) {
      if (event.target === this) {
        closeNoteDialog();
      }
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function (event) {
      renderNotes(event.target.value);
    });
  }
});
