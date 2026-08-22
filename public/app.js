// ============================================================================
// Fluore Notes — D1-only frontend (no localStorage fallback)
// ============================================================================

const API_BASE = '/api';
const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let notes = [];
let currentOffset = 0;
let hasMore = false;
let isLoading = false;
let error = null;
let editingNoteId = null;
let searchQuery = '';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
  const token = await window.Clerk.session.getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function setLoading(loading) {
  isLoading = loading;
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.disabled = loading;
    saveBtn.textContent = loading ? 'Saving...' : 'Save Note';
  }
}

function showError(message) {
  error = message;
  const container = document.getElementById('notesContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <h2 style="color: #ff5252;">Error</h2>
      <p>${sanitize(message)}</p>
      <button class="add-note-btn" onclick="clearErrorAndReload()">Retry</button>
    </div>
  `;
}

function clearErrorAndReload() {
  error = null;
  initNotesApp();
}

// ---------------------------------------------------------------------------
// API calls — all notes are persisted in D1, no localStorage fallback
// ---------------------------------------------------------------------------
async function fetchNotes(reset = true) {
  if (isLoading) return;
  isLoading = true;

  try {
    const headers = await getAuthHeaders();
    const url = reset
      ? `${API_BASE}/notes?limit=${PAGE_SIZE}&offset=0`
      : `${API_BASE}/notes?limit=${PAGE_SIZE}&offset=${currentOffset}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (reset) {
      notes = data.notes || [];
      currentOffset = 0;
    } else {
      notes = [...notes, ...(data.notes || [])];
      currentOffset += (data.notes || []).length;
    }

    hasMore = data.pagination?.hasMore || false;
    renderNotes();
  } catch (err) {
    console.error('Failed to fetch notes:', err);
    showError(err.message || 'Failed to load notes from server.');
  } finally {
    isLoading = false;
  }
}

async function loadMore() {
  if (!hasMore || isLoading) return;
  await fetchNotes(false);
}

async function saveNoteToApi(note) {
  const headers = await getAuthHeaders();
  const method = editingNoteId ? 'PUT' : 'POST';
  const url = editingNoteId
    ? `${API_BASE}/notes/${encodeURIComponent(note.id)}`
    : `${API_BASE}/notes`;

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({
      title: note.title,
      content: note.content,
      color: note.color || null,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

async function deleteNoteFromApi(noteId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// CRUD operations — server-authoritative, no optimistic local mutations
// ---------------------------------------------------------------------------
async function handleSave(event) {
  event.preventDefault();

  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const color = document.getElementById('noteColor').value;

  if (!title) {
    alert('Title is required.');
    return;
  }

  setLoading(true);
  error = null;

  try {
    const note = {
      id: editingNoteId || crypto.randomUUID(),
      title,
      content,
      color: color || null,
    };

    const saved = await saveNoteToApi(note);

    if (editingNoteId) {
      // Update existing note in local state
      const index = notes.findIndex((n) => n.id === editingNoteId);
      if (index !== -1) {
        notes[index] = { ...notes[index], ...saved };
      }
    } else {
      // Prepend new note from server response
      notes.unshift(saved);
    }

    closeNoteDialog();
    renderNotes();
  } catch (err) {
    console.error('Failed to save note:', err);
    alert(`Failed to save note: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleDelete(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;

  try {
    // Optimistically remove from UI
    notes = notes.filter((n) => n.id !== noteId);
    renderNotes();

    await deleteNoteFromApi(noteId);
  } catch (err) {
    console.error('Failed to delete note:', err);
    alert(`Failed to delete note: ${err.message}`);
    // Re-fetch to restore correct state
    await fetchNotes(true);
  }
}

// ---------------------------------------------------------------------------
// UI Rendering
// ---------------------------------------------------------------------------
function renderNotes(searchTerm = '') {
  const container = document.getElementById('notesContainer');
  if (!container) return;

  if (error) {
    showError(error);
    return;
  }

  if (notes.length === 0 && !searchTerm) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Ready to plan your next step?</h2>
        <button class="add-note-btn" onclick="openNoteDialog()">+ Add your first note</button>
      </div>
    `;
    renderPagination();
    return;
  }

  const cleanSearch = searchTerm.trim().toLowerCase();
  const filtered = cleanSearch
    ? notes.filter((n) => n.title.toLowerCase().includes(cleanSearch))
    : notes;

  if (filtered.length === 0 && cleanSearch) {
    const suggested = notes.find(
      (n) =>
        n.title.toLowerCase().startsWith(cleanSearch.charAt(0)) ||
        n.content.toLowerCase().includes(cleanSearch)
    );

    container.innerHTML = `
      <div class="empty-state">
        <h2>No notes found for "${sanitize(searchTerm.trim())}"</h2>
        ${suggested ? `<p>Did you mean <strong>"${sanitize(suggested.title)}"</strong>?</p>` : '<p>Check for typos or try searching with a different keyword.</p>'}
        <button class="add-note-btn" style="margin-top: 1rem;" onclick="openNoteDialog()">+ Create "${sanitize(searchTerm.trim())}"</button>
      </div>
    `;
    renderPagination();
    return;
  }

  container.innerHTML = filtered
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
          <button class="delete-btn" onclick="handleDelete('${sanitize(note.id)}')" title="Delete Note">
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="m291-240-51-51 189-189-189-189 51-51 189 189 189-189 51 51-189 189 189 189-51 51-189-189-189 189Z"/>
            </svg>
          </button>
        </div>
      </div>
    `
    )
    .join('');

  renderPagination();
}

function renderPagination() {
  // Remove existing load-more button if any
  const existing = document.getElementById('loadMoreContainer');
  if (existing) existing.remove();

  if (!hasMore || notes.length === 0) return;

  const div = document.createElement('div');
  div.id = 'loadMoreContainer';
  div.style.cssText = 'grid-column: 1 / -1; display: flex; justify-content: center; margin-top: 1rem;';
  div.innerHTML = `
    <button class="add-note-btn" onclick="loadMore()" ${isLoading ? 'disabled' : ''}>
      ${isLoading ? 'Loading...' : 'Load More'}
    </button>
  `;
  document.getElementById('notesContainer').appendChild(div);
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
function openNoteDialog(noteId = null) {
  const dialog = document.getElementById('noteDialog');
  const titleInput = document.getElementById('noteTitle');
  const contentInput = document.getElementById('noteContent');
  const colorSelect = document.getElementById('noteColor');

  if (noteId) {
    const noteToEdit = notes.find((n) => n.id === noteId);
    if (!noteToEdit) return;
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
  editingNoteId = null;
}

// ---------------------------------------------------------------------------
// Theme — localStorage is acceptable for UI preferences, not app data
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Initialization — D1 only, no localStorage fallback
// ---------------------------------------------------------------------------
async function initNotesApp() {
  error = null;
  await fetchNotes(true);
}

// ---------------------------------------------------------------------------
// Global error handling — prevent blank screens from unhandled rejections
// ---------------------------------------------------------------------------
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  applyStoredTheme();

  const noteForm = document.getElementById('noteForm');
  if (noteForm) {
    noteForm.addEventListener('submit', handleSave);
  }

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', ToggleTheme);
  }

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
