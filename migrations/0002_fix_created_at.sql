CREATE TABLE notes_new (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    color       TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT INTO notes_new (id, user_id, title, content, color, created_at)
SELECT id, user_id, title, content, color, COALESCE(created_at, strftime('%s','now'))
FROM notes;

DROP TABLE notes;

ALTER TABLE notes_new RENAME TO notes;

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, created_at DESC);