-- An optional work in progress limit per list. It warns, it never blocks.
ALTER TABLE lists
  ADD COLUMN wip_limit SMALLINT CHECK (wip_limit BETWEEN 1 AND 99);

-- "My cards" reads by assignee, then orders by due date.
CREATE INDEX idx_cards_due_date ON cards(due_date) WHERE due_date IS NOT NULL;
