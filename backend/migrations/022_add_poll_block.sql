ALTER TABLE lists DROP CONSTRAINT lists_kind_check;
ALTER TABLE lists ADD CONSTRAINT lists_kind_check
  CHECK (kind IN ('list', 'calendar', 'agenda', 'note', 'counter', 'image', 'embed', 'link', 'progress', 'overdue', 'chart', 'snippet', 'table', 'clocks', 'timer', 'poll'));

CREATE TABLE poll_votes (
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL CHECK (option_id ~ '^[a-z0-9]{1,12}$'),
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);

CREATE INDEX poll_votes_by_option ON poll_votes (list_id, option_id);
