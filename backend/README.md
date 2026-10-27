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
invitation, and a workspace holds at most 50 members and 50 pending invitations. Registration
requires a username of 3 to 32 characters, unique across accounts.

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

### Assignees and due dates

A card can carry a due date (a calendar day, `YYYY-MM-DD`, no time zone, validated in
`domain/src/boards/due_date.rs`) and up to 10 assignees. Only members of the card's workspace can be
assigned, readers cannot change either, and leaving or being removed from a workspace clears that
person's assignments there. The board view returns the workspace members (id and username only, no
emails) so a client can draw avatars without another request.

| Endpoint | Purpose |
| --- | --- |
| `PATCH /api/cards/{id}` with `due_date` | Set a day, send `null` to clear it, leave it out to keep it |
| `PUT /api/cards/{id}/assignees` | Replace the assignees of a card |
| `GET /api/users/me/cards` | Cards assigned to me across workspaces, soonest due first |
| `POST /api/boards/{id}/blocks` | Add a calendar, agenda, note, counter or progress block |
| `PUT /api/blocks/{id}/image` | Set the picture of an image block (the file as the body) |
| `GET /api/blocks/{id}/image` | The picture of an image block, for members only |
| `PUT /api/blocks/{id}/config` | Change the settings of a block, the kind must match |
| `PUT /api/lists/{id}/wip-limit` | Set a list's work in progress limit (1 to 99), or `null` to remove it |
| `POST /api/cards/{id}/duplicate` | Copy a card right after the original, with its description, date, labels and assignees |
| `POST /api/lists/{id}/duplicate` | Copy a list with its cards, or a block with its settings and picture |
| `PUT /api/boards/{id}/layout` | Place lists and blocks on the free layout grid, shared with the board |

### Preferences and board look

Each person has one preferences object (`GET` and `PUT /api/users/me/preferences`, stored as JSON in
`user_preferences`): theme, density, text size, reading font, letter spacing, colour vision, label
shapes, strong focus, large targets, plain backgrounds, reduce motion, announcing teammates, what a
card shows, and per board choices for at most 200 boards. A save replaces the whole object, unknown
fields and values are refused, and someone who never saved gets the defaults. The types live in
`domain/src/preferences.rs`, so adding a setting is a field with a default and nothing breaks for
people who saved before.

The same object holds how a person lays out their boards: for each board a view (`board`, `list` or
`calendar`), a column width and the lists folded into a rail, and one card dialog layout (the order of
the properties and which are hidden, every property listed once). These are personal, so they never
change what teammates see. At most 50 lists can be folded per board.

A progress block (migration `013_add_progress_block.sql`) keeps a style (`ring` or `bar`), an optional
label and the done list it measures, which must be a list of the same board, exactly like a counter.

A list can carry a work in progress limit from 1 to 99 (`PUT /api/lists/{id}/wip-limit`, writers and
above, `null` removes it). It is shared with the board, returned in the board view, and only warns:
adding or moving cards past it still works. The field must be present, so an empty body can never
clear a limit by accident.

The free layout of a board is stored on its panels: four nullable columns on `lists` (`grid_x`,
`grid_y`, `grid_w`, `grid_h`, set together or not at all, with a check constraint, migration
`012_add_list_layout.sql`) on a grid 12 columns wide. `PUT /api/boards/{id}/layout` takes the tiles to
place (writers and above), refuses anything outside the grid (a tile stays inside the 12 columns and the
first 400 rows and is at most 100 rows tall), a panel named twice, a panel of another board and an empty
list, and stores the whole call in one transaction, so a refused tile changes nothing. Panels left out
keep their place, and a panel never placed comes back with `layout: null` so clients lay it out
themselves. It is shared with everyone on the board and refreshed live like any other board change.
The `canvas` view is one more value of the per board view preference.

A board holds panels in one row, and a panel is either a list of cards or a block that shows
something about them: `calendar`, `agenda`, `note`, `counter` or `progress`. Blocks live in the `lists` table with a
`kind` and a JSON `config`, so moving, renaming, deleting, permissions, the 50 panel limit and live
updates are the ones lists already have. `POST /api/boards/{id}/blocks` adds one and
`PUT /api/blocks/{id}/config` changes its settings (writers and above). Settings are checked per kind
(`domain/src/boards/block.rs`): unknown fields and values are refused, a note holds at most 5000
characters without control characters, a counter measuring the share done must name a list of the same
board, and a block never changes kind. Cards can only be added to, or moved into, lists. Every list in
the board view carries its `kind` and `config`.

Three more kinds of block hold content that needs care. `image` keeps a picture: it is uploaded with
`PUT /api/blocks/{id}/image` (the raw file, at most 5 MB, on a route of its own with a larger body limit)
and read with `GET /api/blocks/{id}/image`. The `adapters/image` crate decodes the upload and writes a
new picture from its pixels, which drops every piece of metadata, applies the camera orientation first,
caps the pixels and the stored size, and accepts only real PNG, JPEG and WebP judged by their bytes, never
SVG. The result is stored in `block_images` (a row per block, `ON DELETE CASCADE`, so it goes with its
block, board or workspace), served only to members with the stored type and `nosniff`, and the board view
carries an `image_version` so clients fetch it again only when it changes. Who may upload is checked
before anything is decoded. `embed` keeps a provider (YouTube, Vimeo or Google Calendar) and an
identifier recognised from an address by `domain/src/boards/embed.rs`, never the address itself, so the
frame built from it can only point at that provider. `link` keeps a plain `http` or `https` address
(`web_url.rs`: no credentials, no odd hosts) and nothing is fetched from it. See `docs/privacy.md`.

`GET /api/users/me/cards` lists every card assigned to the signed in person in the workspaces they
still belong to, soonest due date first and undated cards last, with the list, board and workspace
each one lives in (at most 500). Grouping by urgency happens in the browser, against the viewer's own
local day.

A board also has a shared look, a background tint and an accent colour picked from fixed presets
(`PUT /api/boards/{id}/look`, writers and above). Presets, not free colours, so contrast stays
guaranteed in every theme. The board view returns the look and a short description preview per card.

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
