CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id, created_at);

CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boards_workspace ON boards(workspace_id, created_at);

CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lists_board ON lists(board_id, position);

CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cards_list ON cards(list_id, position);

CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL CHECK (char_length(btrim(name)) > 0),
  color VARCHAR(16) NOT NULL CHECK (
    color IN ('slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink')
  ),
  priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_labels_board ON labels(board_id, priority DESC, created_at);

CREATE TABLE card_labels (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE INDEX idx_card_labels_label ON card_labels(label_id);
