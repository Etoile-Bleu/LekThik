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

Path aliases (`@`, `@components`, `@pages`, `@lib`, `@hooks`, `@types`) are configured in
`vite.config.ts` and `tsconfig.json`.

## Docker

`docker compose -f docker-compose.dev.yml up` runs this alongside Postgres and the API, with hot
reload via a bind mount. See the repository root README for the full stack.
