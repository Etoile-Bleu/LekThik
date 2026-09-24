#!/bin/bash
set -e

export PGHOST="${POSTGRES_HOST:-postgres}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGPASSWORD="${POSTGRES_PASSWORD}"
DB_NAME="${POSTGRES_DB:-lekthik}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

until pg_isready -U postgres -d postgres >/dev/null 2>&1; do
  echo "waiting for postgres"
  sleep 1
done

psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT now()
  );
"

for migration in $(ls "$MIGRATIONS_DIR" | sort); do
  path="$MIGRATIONS_DIR/$migration"
  already_applied=$(psql -U postgres -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$migration'")

  if [ "$already_applied" = "1" ]; then
    echo "skipping $migration, already applied"
    continue
  fi

  echo "applying $migration"
  if [[ "$migration" == *.sh ]]; then
    bash "$path"
  else
    psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$path"
  fi

  psql -U postgres -d "$DB_NAME" -c "INSERT INTO schema_migrations (filename) VALUES ('$migration')" >/dev/null
done

APP_ROLE="${POSTGRES_USER:?POSTGRES_USER is required}"

psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$APP_ROLE\";
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$APP_ROLE\";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$APP_ROLE\";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"$APP_ROLE\";
"

echo "granted table and sequence privileges on $DB_NAME to $APP_ROLE"
echo "all migrations applied"
