-- Image, embed and link blocks. An image is kept in the database, never at a public address, so
-- it is served only to members of the workspace and is deleted with its block, board or
-- workspace. Only re-encoded JPEG and PNG pictures are stored.
ALTER TABLE lists DROP CONSTRAINT lists_kind_check;
ALTER TABLE lists ADD CONSTRAINT lists_kind_check
  CHECK (kind IN ('list', 'calendar', 'agenda', 'note', 'counter', 'image', 'embed', 'link'));

-- Notes may now hold up to 10000 characters of Markdown.
ALTER TABLE lists DROP CONSTRAINT lists_config_check;
ALTER TABLE lists ADD CONSTRAINT lists_config_check CHECK (pg_column_size(config) <= 65536);

CREATE TABLE block_images (
  block_id UUID PRIMARY KEY REFERENCES lists(id) ON DELETE CASCADE,
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
  bytes BYTEA NOT NULL CHECK (octet_length(bytes) <= 3145728),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
