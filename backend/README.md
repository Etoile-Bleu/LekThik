# LekThik backend

Rust API for LekThik: hexagonal architecture (`domain`, `application`, `adapters`), PostgreSQL
persistence, and email/password authentication.

## Development

```bash
cargo check --workspace
cargo test --workspace --lib
```

Running the server directly needs a Postgres instance and the environment variables below; the
easiest path is `docker compose -f ../docker-compose.dev.yml up` from the repository root, which
runs Postgres, applies migrations, and starts the server with hot reload.

## Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret used to sign session tokens |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins |

## Scripts

| Command | Description |
| --- | --- |
| `cargo check --workspace` | Type-check every crate |
| `cargo clippy --workspace --all-targets` | Lint (unwrap/expect/panic denied outside tests) |
| `cargo fmt` | Format |
| `cargo test --workspace --lib` | Run unit tests |

## Structure

```
domain/            Entities and repository traits, no framework dependencies
application/        Use cases (register, login)
adapters/db/        PostgreSQL implementation of the repository traits
adapters/http/       Axum server: routes, DTOs, JWT, rate limiting
migrations/         SQL migrations, applied in order by scripts/migrate.sh
```

API docs are served at `/swagger-ui` when the server is running.
