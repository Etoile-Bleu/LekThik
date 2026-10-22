CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL CHECK (pg_column_size(data) <= 32768),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE boards
  ADD COLUMN background VARCHAR(16) NOT NULL DEFAULT 'default'
    CHECK (background IN ('default', 'mist', 'sage', 'sand', 'blush', 'lilac', 'slate', 'dusk')),
  ADD COLUMN accent VARCHAR(16) NOT NULL DEFAULT 'teal'
    CHECK (accent IN ('teal', 'blue', 'violet', 'rose', 'orange', 'graphite'));
