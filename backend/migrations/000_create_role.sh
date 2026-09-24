#!/bin/bash
set -e

ROLE_NAME="${POSTGRES_USER:?POSTGRES_USER is required}"
ROLE_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$ROLE_NAME') THEN
    CREATE ROLE \"$ROLE_NAME\" WITH LOGIN PASSWORD '$ROLE_PASSWORD' CREATEDB;
  END IF;
END
\$do\$;
"

echo "role $ROLE_NAME ready"
