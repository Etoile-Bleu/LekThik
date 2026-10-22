# LekThik backend

Rust API for LekThik: hexagonal architecture (`domain`, `application`, `adapters`), PostgreSQL
persistence, email/password authentication, and the workspaces, boards, lists, cards and priority
labels of the product.

## Development

```bash
cargo check --workspace
cargo test --workspace
```

`cargo test --workspace` also runs the integration tests, which start a throwaway PostgreSQL
container through testcontainers, so Docker must be running.

Running the server directly needs a Postgres instance and the environment variables below; the
easiest path is `docker compose -f ../docker-compose.dev.yml up` from the repository root, which
runs Postgres, applies migrations, and starts the server with hot reload.

## Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret used to sign session tokens |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins |
| `SMTP_RELAY` | SMTP host used for emails, defaults to `smtp-relay.brevo.com` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP credentials |
| `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Sender address (must be accepted by the SMTP provider) and display name |

## Scripts

| Command | Description |
| --- | --- |
| `cargo check --workspace` | Type-check every crate |
| `cargo clippy --workspace --all-targets` | Lint (unwrap/expect/panic denied outside tests) |
| `cargo fmt` | Format |
| `cargo test --workspace --lib` | Run unit tests only |
| `cargo test --workspace` | Run unit and integration tests (needs Docker) |

## Structure

```
domain/            Entities and repository traits, no framework dependencies
application/        Use cases: accounts (register, login, email codes) and boards
                    (workspaces, boards, lists, cards, labels)
adapters/db/        PostgreSQL implementation of the repository traits
adapters/http/       Axum server: routes, DTOs, JWT, rate limiting, security headers
adapters/mail/       SMTP mail sender (STARTTLS)
migrations/         SQL migrations, applied in order by scripts/migrate.sh
```

## Workspaces and boards

Every board query is scoped to the signed in owner in SQL (`workspace.owner_id`), so a foreign
identifier answers `404` exactly like a missing one. Creation is capped per level (50 workspaces
per user, 100 boards per workspace, 50 lists per board, 500 cards per list, 30 labels per board),
label colors and priorities are closed sets, request bodies are limited to 64 KB and must be JSON
with no unknown fields, and API responses carry `nosniff`, `no-store`, a strict CSP and a no-referrer
policy.

Boards can start blank (with four priority labels) or from a template. The template catalogue lives
in `domain/src/boards/templates` as static, test-validated data, and is exposed with its lists, sample
cards and labels at `GET /api/templates` so a client can preview it. A workspace template creates
all its boards in one transaction.

API docs are served at `/swagger-ui` when the server is running.
