# Contributing to LekThik

Thank you for your interest in contributing to LekThik. This document provides guidelines for participating in the project.

## Git Workflow

### Branch Naming

Create branches with clear, descriptive names:

- `feature/<feature-name>` - New features or enhancements
- `fix/<bug-description>` - Bug fixes
- `docs/<doc-name>` - Documentation changes
- `refactor/<scope>` - Code refactoring without changing behavior
- `test/<test-scope>` - Adding or modifying tests
- `chore/<task>` - Dependencies, configuration, build changes

Examples:

```
feature/card-drag-and-drop
fix/board-assignment-bug
docs/zamsync-integration-guide
test/list-reorder-validation
chore/update-eslint-config
```

### Creating a Pull Request

1. Push your branch to GitHub
2. Open a PR with a clear title matching commit format (see below)
3. Reference related issues: `Fixes #123` or `Related to #456`
4. Fill out the PR template completely
5. Ensure all checks pass (lint, tests, type-check)
6. Request review from at least one team member

The PR title must follow the commit message format. Example:

```
feat(cards): add drag and drop between lists
fix(auth): correct session expiration check
docs(zamsync): document the /submit event contract
```

### Branch Protection Rules

The main branch has the following protections:

- Direct pushes are blocked (PRs only)
- At least 1 approval required before merge
- All GitHub Actions checks must pass
- Branch must be up to date with main

## Commit Conventions

Commit messages follow the conventional commits format: `<type>(<scope>): <subject>`

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code formatting or style changes (no logic changes)
- `refactor` - Code refactoring without changing behavior
- `test` - Adding or modifying tests
- `chore` - Dependency, config, build, or tooling changes
- `perf` - Performance improvements

### Scope (optional)

Indicates the affected module:

- `board` - Boards management
- `list` - Lists within a board
- `card` - Cards, assignment, due dates
- `auth` - Authentication and sessions
- `sync` - ZamSync integration and event emission
- `api` - REST API (Rust backend)
- `db` - Database schema or queries (PostgreSQL)
- `deploy` - Deployment, Cloudflare Tunnel, infrastructure

### Subject

- Use imperative mood: "add filter" not "added filter"
- Do not capitalize first letter
- Do not end with a period
- Limit to 50 characters
- Be specific and descriptive

### Examples

```
feat(card): add due date field with overdue indicator
fix(sync): correct HLC ordering on reconnect
docs(api): document the POST /submit event contract
refactor(board): extract list column into its own component
test(card): add drag and drop validation tests
chore(deps): upgrade React to 18.2.0
```

### Body and Footer (optional)

If the commit needs more explanation, add a blank line followed by the body:

```
feat(card): add due date field with overdue indicator

Cards now support an optional due date. Overdue cards are
highlighted in the board view with a red badge.

Fixes #42
```

## Code Standards

### Frontend (React, TypeScript)

All code must be properly typed. Avoid `any` types.

```typescript
// Good
interface Card {
  id: string;
  title: string;
  listId: string;
  dueDate?: string;
}

// Avoid
const card: any = { ... };
```

Run these before committing:

```bash
npm run lint:fix    # Auto-fix ESLint issues
npm run format      # Format with Prettier
npm run type-check  # Verify TypeScript
```

- Use functional components with hooks
- Keep components focused and single-responsibility
- Extract custom hooks for shared logic
- Use TypeScript for prop types

### Backend (Rust)

Run these before committing:

```bash
cargo fmt            # Format
cargo clippy -- -D warnings   # Lint, warnings are errors
cargo test            # Run tests
```

- No `unwrap()`, `expect()`, or `panic!()` outside of tests
- Propagate errors with `Result` and `thiserror`
- Every mutation that should reach ZamSync emits its event explicitly, do not rely on implicit hooks

### Testing

- Write tests for new features and bug fixes
- Aim for meaningful coverage, not line coverage
- Use descriptive test names

Linting and type checking are enforced in CI. Code that doesn't pass will fail the build.

## Submitting Changes

1. Ensure all tests pass locally (frontend and backend)
2. Verify TypeScript and Clippy are clean
3. Commit with proper message format
4. Push to your branch
5. Open PR and wait for review

## PR Review Checklist

Before requesting review, verify:

- [ ] Branch name follows convention
- [ ] Commits have proper format
- [ ] All code changes are intentional (no accidentally committed debug code)
- [ ] Tests added or updated for new code
- [ ] No `console.log`, `dbg!`, or debug code left
- [ ] Documentation updated if needed
- [ ] All CI checks pass
- [ ] Branch is up to date with main

## Questions or Issues

If you have questions about contributing, open a discussion or ask in the team chat. We're here to help.

Thank you for contributing to LekThik!
