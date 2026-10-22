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

Path aliases (`@`, `@components`, `@pages`, `@lib`, `@hooks`, `@types`) are configured in
`vite.config.ts` and `tsconfig.json`.

## Docker

`docker compose -f docker-compose.dev.yml up` runs this alongside Postgres and the API, with hot
reload via a bind mount. See the repository root README for the full stack.
