# LekThik frontend

React app for LekThik (homepage, accounts, workspaces, boards), built with Vite, TypeScript, and
plain CSS (design tokens as CSS custom properties, no utility framework).

## Development

```bash
pnpm install
pnpm run dev
```

The dev server runs on [http://localhost:5173](http://localhost:5173) and proxies `/api` to the
Rust backend at `http://localhost:8080`.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm run dev` | Start the Vite dev server |
| `pnpm run build` | Type-check and build for production into `dist/` |
| `pnpm run preview` | Preview the production build locally |
| `pnpm run lint` | Run ESLint |
| `pnpm run format` | Format with Prettier |
| `pnpm run type-check` | Run the TypeScript project build without emitting JS |
| `pnpm run test` | Run tests with Vitest |
| `pnpm run ci` | Run the full check suite (type-check, lint, format check, test, build) |

## Structure

```
src/
  App.tsx           Router shell
  main.tsx          Entry point
  index.css         Design tokens and global styles
  ui/
    pages/          Route-level pages (homepage, auth, workspaces, board)
    components/     Components, each with a co-located CSS file:
      ui/           Accessible primitives (dialog, menu, inline edit, composer, toasts)
      app/          Application shell, sidebar and user menu
      board/        Lists, cards, drag and drop canvas, card and label dialogs
      templates/    Template picker with live previews
      collab/       Members dialog, invitation inbox and card, live status, avatars
      appearance/   The board's Display popover and the look swatches
      settings/     The settings page: rows, sections, live preview, theme tiles
    lib/            API client, zustand stores and pure board logic
    hooks/          Small shared hooks
    styles/         Shared button and form styles
```

Drag and drop uses `@dnd-kit` with mouse, touch and keyboard sensors, screen reader announcements,
and a menu based alternative to dragging. Motion is limited to transforms and opacity and is
disabled by `prefers-reduced-motion`.

Collaboration: `lib/realtime.ts` opens the server-sent events stream while the app shell is mounted
and turns each notification into a refetch (debounced, and deferred while this tab still has writes
in flight, so remote changes never overwrite an optimistic move). The UI follows the signed in
user's role (`lib/roles.ts`): readers get a view only board with no composers, drag handles or
menus. Links from invitation emails keep their destination through login and signup with a
validated `next` parameter (`lib/nextPath.ts`).

Assignees and due dates: cards show an avatar stack and a due badge. The badge states its meaning
with wording (Today, Yesterday, a date), an icon (a warning triangle once overdue) and a sentence for
screen readers, never colour alone. Due dates are plain calendar days compared with the viewer's
local day (`lib/dueDate.ts`), and badges turn overdue at midnight on their own. The card dialog uses
a native date input, so keyboard, screen readers and mobile pickers work, with quick picks for today,
tomorrow and next week. The filter bar adds "My cards" and "Overdue", combined with the label
filters.

Appearance and accessibility live on the Settings page (`/settings`, sections in the address). It
has a rail of sections, the section, and a live preview built with the real card component. One save
model for the whole page: every change applies at once, saves by itself, and says so. Each setting is
an attribute on `<html>` (`data-theme`, `data-density`, `data-text`, `data-font`, `data-spacing`,
`data-cvd`, `data-shapes`, `data-focus`, `data-targets`, `data-flat`, `data-motion`), written by an
inline script before the first paint so there is no flash, and kept in step by `lib/appearance.ts`.
Themes only recolour the signed in app (`.shell`), through tokens in `styles/themes.css`; the
remaining accessibility rules are in `styles/access.css`.

- Themes: light, dark, high contrast and system. An explicit choice wins over the system, a system
  asking for more contrast gets high contrast, and `forced-colors` keeps every state readable
  without relying on a fill.
- Density changes spacing only. Text size goes up to 150%, with an optional font made for reading
  (Atkinson Hyperlegible or Lexend, fetched only when chosen) and wider letter and word spacing.
  Layouts reflow with container queries measured in `rem`, so they give way as text grows.
- Colour vision: red-green and blue-yellow palettes whose label colours are checked apart under
  simulated protanopia, deuteranopia and tritanopia (`lib/colorVision.test.ts`), and labels carry a
  shape as well as a colour. Accent presets are checked against WCAG ratios.
- Controls: larger targets, a thick two tone focus ring, plain board backgrounds, reduce motion, and
  spoken announcements when teammates change the board. Notifications wait while you read them.

Views and layout. A board is shown as columns, a free canvas, a sortable table or a calendar, chosen with
a switcher beside the filters and remembered per board and per person. They share the filters and stay
in sync with the live stream.

- Table (`BoardTable`): a real `<table>`, a button inside each sortable heading, `aria-sort` on the
  sorted column only, a glyph that changes shape (not just colour), the sort announced, and rows that
  glide to their place with the View Transitions API where it exists. Cards without a date or an
  assignee always sort last. The list cell is a select, which moves a card without dragging.
- Calendar (`BoardCalendar`): a month grid that is one tab stop, with arrows, Home and End, Page Up and
  Page Down (`lib/calendar.ts`), the first day of the week taken from the locale. Picking a day lists
  its cards beside the grid, and cards without a date wait in a tray where a button gives them the
  chosen day, so planning never needs a drag. Dates are strings, never parsed as `Date`.
- Canvas (`BoardGrid`, `lib/grid.ts`): every list and block is a tile on a 12 column grid of fixed height
  rows, placed and sized freely. The layout is shared with the board (not personal) and saved in one
  call (`PUT /api/boards/{id}/layout`), so it follows the live stream like everything else. A tile is
  taken by its name, resized from its edges and corner, and while it is held the others glide aside
  (FLIP), a dashed outline shows where it will land and the cells are drawn faintly. Gravity keeps
  tiles from floating and from overlapping, whatever was stored (`settle`). Nothing needs a drag: on
  the move button `Space` picks a tile up, the arrows move it, `Shift` with them resizes it, `Enter`
  drops it and `Esc` cancels, each step announced, and the tile menu has "Position and size", a form
  with numbers and a small picture of the grid (WCAG 2.5.7, 2.1.1). "Fit" lays everything out in the
  most readable way: the reading order is kept, tiles take the size their content asks for, rows are
  filled edge to edge with as few gaps as a small partition search finds, and "Undo fit" restores the
  previous layout. A panel nobody placed yet takes the first free spot, the same one on every client.
  Under 720px tiles stack in reading order at the height they were given.
- Columns: a list folds into a slim rail that keeps its name and count, three widths, and an optional
  work in progress limit that warns with an icon and words when exceeded and never blocks
  (`lib/wipLimit.ts`). Folding and width are personal; the limit is shared.
- My cards (`/my-cards`): everything assigned to you across workspaces, grouped overdue, today, next
  seven days, later, no date (`lib/myCards.ts`). Each row is a link that opens the card on its board.
- Card dialog layout: Settings, Card dialog. Properties are reordered with move buttons and hidden
  with switches, a preview follows, and each change is announced. Hidden properties stay one click
  away in the dialog.

Selecting, the hand and the right click (`hooks/useBackdropGestures.ts`, `lib/selectionStore.ts`,
`components/ui/ContextMenu.tsx`). Dragging on the background of the board or the canvas draws a rectangle that picks
the lists and blocks it touches, or the cards when it starts in the empty part of a list, with no text selected on the
way and the view scrolling when the pointer reaches an edge. Shift or Ctrl with a click, `X` on a focused card,
`Ctrl+A` and the menus add to the selection, and a bar offers Duplicate, Move to, Due date, Assign to me and Delete
for all of it, one call after the other so permissions and live updates are those of a single action. The hand
(`Free navigation`, `H`, Space held or the middle button) moves the view in every direction instead, and the
two tools sit in one dock at the bottom right with the full screen buttons. The right click is replaced in the work
area by a menu that knows what is under the pointer and acts on the whole selection when the target is part of it
(`components/board/boardContextMenu.tsx`): open, copy link, duplicate, due date, assign, labels, move, delete for
cards; add a card, rename, duplicate, card limit, move all cards, position for lists; and add a list or a block, fit,
select all, free navigation, view and full screen on the background. It follows the ARIA menu pattern with
submenus, typeahead and checks, opens on the focused item from the menu key or `Shift+F10`, on a long press on touch,
keeps the browser's menu in text fields, on selected text and with `Shift`, and sits inside the themed app area.

Full screen. A button in the top bar, and "Enter full screen" in the palette, ask the browser for full screen
(`lib/fullscreenStore.ts`) and hide the top bar and the menu, so only the page is left. The menu waits off
screen and slides in over the page when the pointer reaches the left edge (a strip with a thin line that
shows itself once), when the Navigation button at the bottom right is pressed, or when it takes the keyboard
focus, and slides out when the pointer leaves. Exit full screen sits beside it, `Esc` and `F11` end it and
the app follows through `fullscreenchange`. Where the browser refuses full screen (an iPhone, a frame) the
page still hides its chrome. Motion is skipped when reduced.

Command palette. `Ctrl+K` or `Cmd+K`, or the search button in the top bar, opens one field to jump
anywhere and do anything (`components/command/`, `lib/commandStore.ts`, `lib/fuzzy.ts`). It is a
combobox: focus stays in the field and `aria-activedescendant` follows the arrow keys, results are
grouped under headings, the match is highlighted, and the count is announced once typing pauses. The
search is fuzzy (letters in order, accents and case ignored, word starts and runs rank higher) over
cards, boards, pages and actions, with recent commands first when nothing is typed and kept in this
browser only. An action that needs details asks one question at a time, a list to choose from or a
text, with the trail shown above the field, `Backspace` on an empty field and `Esc` stepping back, and
a due date can be typed the way people say it (`tomorrow`, `friday`, `+3d`, `2026-03-14`, `none`). Each
screen offers its own actions through `useCommandSource`, so the board adds its cards, "Add a card",
"Move a card to a list", "Fit the layout" and the rest, and readers are only offered what they may do.
Every action goes through the same store calls as the buttons, so the live stream shows it to everyone.

Blocks. A board's row can hold blocks next to its lists, added from "Add a block" in a picker that
shows a drawing of each. A block is a panel with a kind, so it moves, folds, renames and deletes like a
list, and it draws on the cards of the board, so it follows the live stream with no request of its own.
Calendar is a small month with a dot on days that have cards due and the day's cards below. Agenda lists
what is due today or over seven days, late cards first, optionally only mine. Note is plain text: it is
never read as markup, and only http and https addresses become links, opened in a new tab without
handing over the page (`lib/blocks.ts`, `linkify`). Counter shows one number (late cards, share done,
days left, total) with an icon and words besides colour, and counts up unless motion is reduced. Blocks
are regions named by their title, unique by default ("Note", "Note 2"), and a card can be dropped on a
list but never on a block.

Writing. Notes, and card descriptions, are Markdown (CommonMark and GitHub tables, checklists and
strikethrough, single line breaks kept) through `react-markdown` without raw HTML, so text is never read
as markup. Links keep only web and mail addresses, pictures from other sites are never loaded (they show
as a link, since loading them would hand the reader's address to a stranger), tables and code scroll in
regions a keyboard can reach, and the boxes of a checklist can be ticked from the note or the card, which
saves it. LaTeX formulas (`$x^2$`, or a block between `$$`) are drawn by KaTeX as HTML for the eye and
MathML for screen readers, with `trust` off and size limits. Code is highlighted with a palette checked
for contrast in every theme and has a copy button. Mermaid diagrams are drawn in strict mode, with the
result cleaned by DOMPurify, the diagram source kept as text underneath as its alternative, and the
`accTitle` and `accDescr` of the source read out. The Markdown, KaTeX, highlighting and Mermaid code each
load only when a text needs them (`components/richtext/`), so the board stays light. The editor has a
formatting toolbar that is one tab stop, a preview tab, shortcuts and a help list.

Pictures, videos and links. An image block shows a picture fetched with the session and kept as a local
address, with the description required when it is added as its alternative text. An embed block shows a
placeholder and requests nothing from the provider until someone presses its button, and says who would
receive what; a choice to remember it is kept in this browser only (`lib/embedConsent.ts`) and withdrawn in
Settings, Privacy. The frame address is built from a checked provider and identifier
(`lib/embeds.ts`), never from a typed address, and the frame is sandboxed and titled. A link block shows
the real site and fetches nothing. `docs/privacy.md` has the full account.

Path aliases (`@`, `@components`, `@pages`, `@lib`, `@hooks`, `@types`) are configured in
`vite.config.ts` and `tsconfig.json`.

## Docker

`docker compose -f docker-compose.dev.yml up` runs this alongside Postgres and the API, with hot
reload via a bind mount. See the repository root README for the full stack.
