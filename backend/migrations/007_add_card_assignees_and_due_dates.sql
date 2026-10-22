ALTER TABLE cards ADD COLUMN due_date DATE;

CREATE TABLE card_assignees (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, user_id)
);

CREATE INDEX idx_card_assignees_user ON card_assignees(user_id);
