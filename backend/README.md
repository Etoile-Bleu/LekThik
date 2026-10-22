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
| `APP_BASE_URL` | Public address of the web app, used in invitation email links, defaults to `http://localhost:5173` |

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

Every board query is scoped in SQL to the workspaces the signed in user belongs to
(`workspace_members`), so a foreign identifier answers `404` exactly like a missing one. A member
who lacks the role for an action gets `403`. Creation is capped per level (50 workspaces
per user, 100 boards per workspace, 50 lists per board, 500 cards per list, 30 labels per board),
label colors and priorities are closed sets, request bodies are limited to 64 KB and must be JSON
with no unknown fields, and API responses carry `nosniff`, `no-store`, a strict CSP and a no-referrer
policy.

Boards can start blank (with four priority labels) or from a template. The template catalogue lives
in `domain/src/boards/templates` as static, test-validated data, and is exposed with its lists, sample
cards and labels at `GET /api/templates` so a client can preview it. A workspace template creates
all its boards in one transaction.

## Collaboration

A workspace has members, each with one role:

| Role | Can do |
| --- | --- |
| `reader` | Read boards, lists, cards and labels |
| `writer` | Everything a reader does, plus create and edit boards, lists, cards and labels |
| `admin` | Everything a writer does, plus delete boards, rename the workspace, invite, change roles and remove members ranked below them |
| `owner` | Everything, plus delete the workspace. One per workspace, never assigned, cannot leave |

Role rules live in `domain/src/boards/role.rs`: nobody manages a member of equal or higher rank and
nobody grants a role equal to or above their own. The database enforces the ones that must never
break (a single owner per workspace, the owner row is never removed).

Invitations (`workspace_invitations`) target an email address. The invitee gets an email linking to
`{APP_BASE_URL}/invitations/{id}`, signs in with that address and accepts or declines there or from
the in-app inbox. Only the invited address, once verified, can open or answer an invitation, anybody
else gets `404`. Invitations expire after 7 days, re-inviting an address renews its pending
invitation, and a workspace holds at most 50 members and 50 pending invitations. Registration no
longer asks for a username, one is derived from the email address.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/workspaces/{id}/members` | Members, and pending invitations for admins |
| `PATCH /api/workspaces/{id}/members/{user_id}` | Change a role |
| `DELETE /api/workspaces/{id}/members/{user_id}` | Remove a member, or leave with your own id |
| `POST /api/workspaces/{id}/invitations` | Invite an email address with a role |
| `DELETE /api/workspaces/{id}/invitations/{invitation_id}` | Revoke a pending invitation |
| `GET /api/invitations`, `GET /api/invitations/{id}` | My open invitations |
| `POST /api/invitations/{id}/accept`, `.../decline` | Answer an invitation |
| `GET /api/events` | Live change stream (server-sent events) |

### Real time

`GET /api/events` keeps one server-sent events stream per signed in user. Events carry identifiers
only (`board`, `workspace`, `workspaces`, `members`, `invitations`), never data, so clients refetch
what they display and authorization stays on the read endpoints. A connection only hears about
workspaces its user belongs to, and a membership change refreshes that audience immediately, so a
removed member stops receiving events at once. `resync` tells a client that it missed events.
Writes publish events from a middleware (`notify.rs`) for boards, lists, cards and labels and from
the member and invitation handlers. Clients send an `X-Client-Id` header so the tab that made a
change can skip its own echo.

The event hub (`events.rs`) is the only place that knows how events travel. It is an in-process
broadcast channel today. Running several server instances means replacing it with Postgres
`LISTEN/NOTIFY` or Redis pub/sub behind `publish` and `subscribe`, nothing else changes. New
features, such as image attachments, only have to publish a change for their board.

API docs are served at `/swagger-ui` when the server is running.
