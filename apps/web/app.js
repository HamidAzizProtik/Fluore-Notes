let notes = [];
let editingNoteId = null

const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>`;

function loadNotes() {
    const savedNotes = localStorage.getItem("fluoreNotes");
    return savedNotes ? JSON.parse(savedNotes) : []
}

function saveNote(event) {
    event.preventDefault();

    const title = document.getElementById("noteTitle").value.trim();
    const content = document.getElementById("noteContent").value.trim();
    const color = document.getElementById("noteColor").value;

    if(editingNoteId) {
        // update existing note

        const noteIndex = notes.findIndex(note => note.id === editingNoteId)
        notes[noteIndex] = {
            ...notes[noteIndex],
            title:title,
            content: content,
            color: color
        }
    }

    else {
        notes.unshift({
            id: generateId(),
            title: title,
            content: content,
            color: color
        })
    }

    closeNoteDialog()
    saveNotes();
    renderNotes(); // re-renders notes so that we dont have to refresh after making a note
}

function generateId() {
    return Date.now().toString()
}

function saveNotes() {
    localStorage.setItem("fluoreNotes", JSON.stringify(notes))
}

function deleteNote(noteId) {
    notes = notes.filter(note => note.id !== noteId);
    saveNotes();
    renderNotes();
}

function renderNotes(searchTerm = "") {
    const notesContainer = document.getElementById("notesContainer");

    if(notes.length === 0) {
        notesContainer.innerHTML = `
        <div class="empty-state">
            <h2>Ready to plan your next step?</h2>
            <button class="add-note-btn" onclick="openNoteDialog()">+ Add your first note</button>
        </div>
        `;
        return;
    }

    const cleanSearch = searchTerm.trim();

    const filteredNotes = notes.filter(note => 
        note.title.toLowerCase().includes(cleanSearch.toLowerCase())
    );

    if(filteredNotes.length === 0) {
        const suggestedNote = notes.find(note => 
            note.title.toLowerCase().startsWith(cleanSearch.charAt(0).toLowerCase()) ||
            note.content.toLowerCase().includes(cleanSearch.toLowerCase())
        );

        const suggestionHTML = suggestedNote 
            ? `<p>Did you mean <strong>"${suggestedNote.title}"</strong>?</p>`
            : `<p>Check for typos or try searching with a different keyword.</p>`;

        notesContainer.innerHTML = `
        <div class="empty-state">
            <h2>No notes found for "${cleanSearch}"</h2>
            ${suggestionHTML}
            <button class="add-note-btn" style="margin-top: 1rem;" onclick="openNoteDialog()">+ Create "${cleanSearch}"</button>
        </div>
        `;
        return;
    }

    notesContainer.innerHTML = filteredNotes.map(note => `
        <div class="note-card" style="background-color: ${note.color || 'var(--surface-color)'};">
            <h3 class="note-title">${note.title}</h3>
            <p class="note-content">${note.content}</p>
            <div class="note-actions">
                <button class="edit-btn" onclick="openNoteDialog('${note.id}')" title="Edit Note">
                    <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M216-216h51l375-375-51-51-375 375v51Zm-72 72v-153l498-498q11-11 23.84-16 12.83-5 27-5 14.16 0 27.16 5t24 16l51 51q11 11 16 24t5 26.54q0 14.45-5.02 27.54T795-642L297-144H144Zm600-549-51-51 51 51Zm-127.95 76.95L591-642l51 51-25.95-25.05Z"/>
                    </svg>
                </button>
                <button class="delete-btn" onclick="deleteNote('${note.id}')" title="Delete Note">
                    <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="m291-240-51-51 189-189-189-189 51-51 189 189 189-189 51 51-189 189 189 189-51 51-189-189-189 189Z"/>
                    </svg>
                </button>
            </div>
        </div>
        `).join('');
}

// note dialog code
function openNoteDialog(noteId = null) {
    const dialog = document.getElementById("noteDialog");
    const titleInput = document.getElementById("noteTitle");
    const contentInput = document.getElementById("noteContent");
    const colorSelect = document.getElementById("noteColor");

    if(noteId) {
        // edit note
        const noteToEdit = notes.find(note => note.id === noteId)
        editingNoteId = noteId
        document.getElementById('dialogTitle').textContent = 'Edit Note'
        titleInput.value = noteToEdit.title
        contentInput.value = noteToEdit.content

        colorSelect.value = noteToEdit.color || "";
    }
    else {
        // add note
        editingNoteId = null
        document.getElementById('dialogTitle').textContent = 'Add New Note'
        titleInput.value = ''
        contentInput.value = ''

        colorSelect.value = "";
    }

    dialog.showModal();
    titleInput.focus(); // making dialog 
}

function closeNoteDialog() {
    document.getElementById("noteDialog").close();
}

function ToggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('themeToggleBtn').innerHTML = isDark ? sunIcon : moonIcon;
}

function applyStoredTheme() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggleBtn.innerHTML = sunIcon;
    } else {
        themeToggleBtn.innerHTML = moonIcon;
    }
}

//* updates
document.addEventListener("DOMContentLoaded", function() {

    applyStoredTheme()

    notes = loadNotes() // loads notes
    renderNotes() //* updates note rendering function

    document.getElementById("noteForm").addEventListener("submit", saveNote)
    document.getElementById('themeToggleBtn').addEventListener('click', ToggleTheme)

    document.getElementById("noteDialog").addEventListener("click", function(event) {
        if(event.target === this) {    // makes sure dialog closes if clicked in whitespace
            closeNoteDialog();
        }
    });

    document.getElementById("searchInput").addEventListener("input", function(event) {
        renderNotes(event.target.value); 
    });
});