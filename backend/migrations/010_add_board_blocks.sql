-- A board holds panels in one row. A panel is a list of cards, or a block that shows
-- something else (a calendar, an agenda, a note, a counter). Blocks share the lists table, so
-- ordering, renaming, deleting, permissions and live updates are the same as for a list.
ALTER TABLE lists
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'list'
    CHECK (kind IN ('list', 'calendar', 'agenda', 'note', 'counter')),
  ADD COLUMN config JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (pg_column_size(config) <= 16384);
