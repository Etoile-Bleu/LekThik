ALTER TABLE cards ADD COLUMN list_entered_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE cards ADD COLUMN blocked_at TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN blocked_reason VARCHAR(200);

CREATE INDEX idx_cards_list_entered_at ON cards (list_id, list_entered_at);

ALTER TABLE boards ADD COLUMN done_list_id UUID REFERENCES lists(id) ON DELETE SET NULL;

ALTER TABLE card_activity DROP CONSTRAINT card_activity_kind_check;
ALTER TABLE card_activity ADD CONSTRAINT card_activity_kind_check CHECK (kind IN (
  'created', 'renamed', 'described', 'due_set', 'due_cleared', 'moved',
  'label_added', 'label_removed', 'assigned', 'unassigned', 'blocked', 'unblocked'
));
