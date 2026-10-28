ALTER TABLE lists DROP CONSTRAINT lists_kind_check;
ALTER TABLE lists ADD CONSTRAINT lists_kind_check
  CHECK (kind IN ('list', 'calendar', 'agenda', 'note', 'counter', 'image', 'embed', 'link', 'progress'));
