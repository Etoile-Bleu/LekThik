CREATE TABLE card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX idx_card_comments_card ON card_comments (card_id, created_at DESC);
CREATE INDEX idx_card_comments_author ON card_comments (author_id, created_at DESC);

CREATE TABLE card_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN (
    'created', 'renamed', 'described', 'due_set', 'due_cleared', 'moved',
    'label_added', 'label_removed', 'assigned', 'unassigned'
  )),
  subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  from_text VARCHAR(200),
  to_text VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_activity_card ON card_activity (card_id, created_at DESC);
