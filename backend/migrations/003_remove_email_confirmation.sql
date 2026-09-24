DROP INDEX IF EXISTS idx_users_confirmation_token;
ALTER TABLE users DROP COLUMN confirmation_token;
ALTER TABLE users DROP COLUMN confirmed_at;
