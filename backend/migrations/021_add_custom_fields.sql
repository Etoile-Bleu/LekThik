CREATE TABLE board_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('text', 'number', 'date', 'select', 'checkbox', 'url')),
  position INTEGER NOT NULL DEFAULT 0,
  show_on_card BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_board_fields_name ON board_fields (board_id, lower(name));
CREATE INDEX idx_board_fields_board ON board_fields (board_id, position, created_at);

CREATE TABLE field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES board_fields(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  color VARCHAR(10) NOT NULL CHECK (color IN (
    'slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'
  )),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_field_options_name ON field_options (field_id, lower(name));
CREATE INDEX idx_field_options_field ON field_options (field_id, position, created_at);

CREATE TABLE card_field_values (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES board_fields(id) ON DELETE CASCADE,
  text_value VARCHAR(1000),
  number_value NUMERIC CHECK (abs(number_value) < 1000000000000),
  date_value DATE,
  bool_value BOOLEAN,
  option_id UUID REFERENCES field_options(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, field_id),
  CHECK (num_nonnulls(text_value, number_value, date_value, bool_value, option_id) = 1)
);

CREATE INDEX idx_card_field_values_field ON card_field_values (field_id);
CREATE INDEX idx_card_field_values_option ON card_field_values (option_id) WHERE option_id IS NOT NULL;
