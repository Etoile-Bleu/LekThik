# LekThik frontend

React homepage for LekThik, built with Vite, TypeScript, and plain CSS (design tokens as CSS
custom properties, no utility framework).

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
    pages/          Route-level pages
    components/     Reusable components, each with a co-located CSS file
```

Path aliases (`@`, `@components`, `@pages`, `@lib`, `@hooks`, `@types`) are configured in
`vite.config.ts` and `tsconfig.json`.

## Docker

`docker compose -f docker-compose.dev.yml up` runs this alongside Postgres and the API, with hot
reload via a bind mount. See the repository root README for the full stack.
