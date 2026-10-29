ALTER TABLE users ADD COLUMN calendar_token VARCHAR(64);

CREATE UNIQUE INDEX idx_users_calendar_token ON users (calendar_token)
  WHERE calendar_token IS NOT NULL;
