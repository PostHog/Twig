# Twig Development Guide

## Project Structure

- Monorepo with pnpm workspaces and turbo
- `apps/twig` - Twig Electron desktop app (React + Vite)
- `packages/agent` - TypeScript agent framework wrapping Claude Agent SDK

## Commands

- `pnpm install` - Install all dependencies
- `pnpm dev` - Run both agent (watch) and twig app via mprocs
- `pnpm dev:agent` - Run agent package in watch mode only
- `pnpm dev:twig` - Run twig desktop app only
- `pnpm build` - Build all packages (turbo)
- `pnpm typecheck` - Type check all packages
- `pnpm lint` - Lint and auto-fix with biome
- `pnpm format` - Format with biome
- `pnpm test` - Run tests across all packages

### Twig App Specific

- `pnpm --filter twig test` - Run vitest tests
- `pnpm --filter twig typecheck` - Type check twig app
- `pnpm --filter twig package` - Package electron app
- `pnpm --filter twig make` - Make distributable

### Agent Package Specific

- `pnpm --filter agent build` - Build agent with tsup
- `pnpm --filter agent dev` - Watch mode build
- `pnpm --filter agent typecheck` - Type check agent

## Code Style

- Prefer writing our own solution over adding external packages when the fix is simple
- Keep functions focused with single responsibility
- Biome for linting and formatting (not ESLint/Prettier)
- 2-space indentation, double quotes
- No `console.*` in source - use logger instead (logger files exempt)
- Path aliases required in renderer code - no relative imports
  - `@features/*`, `@components/*`, `@stores/*`, `@hooks/*`, `@utils/*`, `@renderer/*`, `@shared/*`, `@api/*`
- Main process path aliases: `@main/*`, `@api/*`, `@shared/*`
- TypeScript strict mode enabled
- Tailwind CSS classes should be sorted (biome `useSortedClasses` rule)

### Avoid Barrel Files

- Do not make use of index.ts

Barrel files:

- Break tree-shaking
- Create circular dependency risks
- Hide the true source of imports
- Make refactoring harder

Import directly from source files instead.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed patterns (DI, services, tRPC, state management).

### Electron App (apps/twig)

- **Main process** (`src/main/`) - Stateless services, tRPC routers, system I/O
- **Renderer process** (`src/renderer/`) - React app, all application state
- **IPC**: tRPC over Electron IPC (type-safe)
- **DI**: InversifyJS in both processes (`src/main/di/`, `src/renderer/di/`)
- **State**: Zustand stores in renderer only - main is stateless
- **Testing**: Vitest with React Testing Library

### Agent Package (packages/agent)

- Wraps `@anthropic-ai/claude-agent-sdk`
- Git worktree management in `worktree-manager.ts`
- PostHog API integration in `posthog-api.ts`
- Task execution and session management

### CLI Package (packages/cli)

- **Dumb shell, imperative core**: CLI commands should be thin wrappers that call `@twig/core`
- All business logic belongs in `@twig/core`, not in CLI command files
- CLI only handles: argument parsing, calling core, formatting output
- No data transformation, tree building, or complex logic in CLI

### Core Package (packages/core)

- Shared business logic for jj/GitHub operations

## Agent Integration Guidelines

- **No rawInput**: Don't use Claude Code SDK's `rawInput` - only use Zod validated meta fields. This keeps us agent agnostic and gives us a maintainable, extensible format for logs.
- **Use ACP SDK types**: Don't roll your own types for things available in the ACP SDK. Import types directly from `@anthropic-ai/claude-agent-sdk` TypeScript SDK.
- **Permissions via tool calls**: If something requires user input/approval, implement it through a tool call with a permission instead of custom methods + notifications. Avoid patterns like `_array/permission_request`.

## Key Libraries

- React 18, Radix UI Themes, Tailwind CSS
- TanStack Query for data fetching
- xterm.js for terminal emulation
- CodeMirror for code editing
- Tiptap for rich text
- Zod for schema validation

## Environment Variables

- Copy `.env.example` to `.env`

TODO: Update me

## Testing

- `pnpm test` - Run tests across all packages
- Twig app: Vitest with jsdom, helpers in `apps/twig/src/test/`
