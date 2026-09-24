ALTER TABLE users ADD COLUMN username VARCHAR(32);

UPDATE users SET username = 'user_' || substr(id::text, 1, 8) WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
