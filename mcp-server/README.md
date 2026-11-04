# LekThik MCP server

Lets Claude create and edit workspaces, boards, lists, blocks, cards and labels in a real
LekThik account, the same way the web app does: by calling its own HTTP API, signed in as one
account. There is no separate database, no separate permissions model and nothing cached: every
tool call is a live request, and everything it touches shows up in the web app at once.

## What it is for

The use case this was built for: you are in a Claude Code session, working on something else
entirely, and you think "I should set up a workspace for this" or "add a card for that". Instead
of switching to the browser, you ask Claude, and it calls this server's tools directly against
your account.

It is not a general LekThik API client library, and it does not expose every endpoint the backend
has: see [What is not covered](#what-is-not-covered).

## Setup

1. **Install its dependencies and build it** (from this directory):

   ```bash
   corepack pnpm install
   corepack pnpm run build
   ```

2. **Copy `.env.example` to `.env`** and fill in the account to act as:

   ```bash
   cp .env.example .env
   ```

   ```ini
   LEKTHIK_API_URL=http://localhost:8080   # or your deployed backend's address
   LEKTHIK_EMAIL=you@example.com
   LEKTHIK_PASSWORD=your-password
   ```

   Everything these tools do happens as this account. Use one you are comfortable with an agent
   acting as, and change its password if that ever stops being true.

3. **Point your MCP client at it.** The server itself only reads `LEKTHIK_EMAIL` and
   `LEKTHIK_PASSWORD` from its process environment, not from `.env` directly; `.env` is there so
   you have one place to keep them while you copy them into whichever client below you use.

   **Claude Code**, from the repo root, with `-s local` so the account and password are kept in
   your own, private `~/.claude.json`, never in a file this repo could commit:

   ```bash
   claude mcp add lekthik -s local \
     -e LEKTHIK_API_URL=http://localhost:8080 \
     -e LEKTHIK_EMAIL=you@example.com \
     -e LEKTHIK_PASSWORD=your-password \
     -- node mcp-server/dist/index.js
   ```

   **Claude Desktop**, in its MCP server settings (or directly in
   `claude_desktop_config.json`), add:

   ```json
   {
     "mcpServers": {
       "lekthik": {
         "command": "node",
         "args": ["<full path to>/mcp-server/dist/index.js"],
         "env": {
           "LEKTHIK_API_URL": "http://localhost:8080",
           "LEKTHIK_EMAIL": "you@example.com",
           "LEKTHIK_PASSWORD": "your-password"
         }
       }
     }
   }
   ```

   Either way, the password ends up in a config file on your own machine, never in this repo:
   do not add an `-s project` server or a root level `.mcp.json` with it filled in, since that
   file is meant to be shared and committed.

4. **Ask for something.** "Create a workspace called Launch, add a board, a To do and a Done
   list, and a counter block for late cards" is a reasonable first thing to try.

## What it can do

33 tools, grouped the way the web app itself is:

- **Account** — `whoami`.
- **Workspaces** — `list_workspaces`, `create_workspace`, `rename_workspace`,
  `delete_workspace`, `list_templates`.
- **Boards** — `create_board`, `get_board` (the full state of one board: its lists, blocks,
  cards, labels and members, in one call), `rename_board`, `delete_board`, `set_board_look`,
  `set_done_list` (picks which list means done, for cycle time).
- **Lists and blocks** — `create_list`, `create_block` (calendar, agenda, note, counter,
  progress, overdue, chart, snippet, table, clocks or timer), `set_block_config`, `rename_list`,
  `delete_list`, `move_list`, `set_wip_limit`.
- **Cards** — `create_card`, `get_card`, `update_card`, `move_card`, `duplicate_card`,
  `delete_card`, `set_card_labels`, `set_card_assignees`, `set_card_blocked`, `add_card_comment`.
- **Labels** — `create_label`, `update_label`, `delete_label`.
- **Members** — `list_members`, `invite_member`.

Every tool that deletes something is marked `destructiveHint: true` and says in its own
description that there is no undo; every tool that only reads is marked `readOnlyHint: true`.
These are hints for whichever model is calling them, not guardrails this server enforces itself,
which is why the descriptions themselves also say so in words, not only in the annotation.

## What is not covered

Left out on purpose, to keep this server's surface matched to what an agent is actually asked to
do, rather than mirroring the API one to one (the API itself has about twice as many routes):

- **Pictures.** Setting an image block's picture takes raw bytes as the request body, an awkward
  shape for a tool call, and a URL to fetch from would mean this server fetching arbitrary
  external content on your behalf.
- **Presence and the calendar feed.** Who is looking at a board right now, and the private `.ics`
  address of your assigned cards, are personal and momentary; there is no "add a card to someone's
  calendar feed" request to make.
- **Custom fields and polls.** Both have enough shape of their own (field kinds and options, poll
  tallies and anonymity) to deserve their own pass rather than a rushed one here.
- **Comment editing and deletion, and responding to invitations.** `add_card_comment` covers the
  common case; editing your own words or someone else's invitation is a narrower need.
- **The live event stream and account export or deletion.** Not requests an agent should be
  making on your behalf.

## How it is built

- `src/client.ts` — logs in once with `LEKTHIK_EMAIL`/`LEKTHIK_PASSWORD`, keeps the session
  cookie in memory, and transparently logs in again if the server ever says the session expired.
  The password and the cookie are never written to a log or a file.
- `src/types.ts` — the handful of response fields the tools below read, copied by hand from the
  backend's own OpenAPI document (`GET /api-docs/openapi.json` on a running server), not
  generated, since the full schema is much larger than what an agent needs back.
- `src/tools/*.ts` — one file per area of the app, each tool a `zod` input schema and a
  multi-sentence description written for a model deciding whether to use it, not for a human
  reading API docs: what it does, what it needs, and anything it should know before calling it
  (a label id comes from `get_board`, a delete has no undo, and so on).
- A tool callback either returns its result or throws; the SDK turns a thrown error into a
  proper tool error the calling model sees and can react to, so none of the tools above catch
  anything themselves.

## Developing

```bash
corepack pnpm run dev         # tsc --watch
corepack pnpm run typecheck   # tsc --noEmit, no build
```

There is no test suite checked in; verifying a tool means running the built server against a
real LekThik account (the local dev stack, `docker compose -f docker-compose.dev.yml up`, with
one of its demo accounts, is the obvious one) and watching what it actually does to a real
workspace.
