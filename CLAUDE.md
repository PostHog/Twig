# Array Development Guide

## Project Structure

- Monorepo with pnpm workspaces and turbo
- `apps/array` - Electron desktop app (React + Vite)
- `packages/agent` - TypeScript agent framework wrapping Claude Agent SDK

## Commands

- `pnpm install` - Install all dependencies
- `pnpm dev` - Run both agent (watch) and array app via mprocs
- `pnpm dev:agent` - Run agent package in watch mode only
- `pnpm dev:array` - Run array desktop app only
- `pnpm build` - Build all packages (turbo)
- `pnpm typecheck` - Type check all packages
- `pnpm lint` - Lint and auto-fix with biome
- `pnpm format` - Format with biome
- `pnpm test` - Run tests across all packages

### Array App Specific

- `pnpm --filter array test` - Run vitest tests
- `pnpm --filter array typecheck` - Type check array app
- `pnpm --filter array package` - Package electron app
- `pnpm --filter array make` - Make distributable

### Agent Package Specific

- `pnpm --filter agent build` - Build agent with tsup
- `pnpm --filter agent dev` - Watch mode build
- `pnpm --filter agent typecheck` - Type check agent

## Code Style

- Biome for linting and formatting (not ESLint/Prettier)
- 2-space indentation, double quotes
- No `console.*` in source - use logger instead (logger files exempt)
- Path aliases required in renderer code - no relative imports
  - `@features/*`, `@components/*`, `@stores/*`, `@hooks/*`, `@utils/*`, `@renderer/*`, `@shared/*`, `@api/*`
- Main process path aliases: `@main/*`, `@api/*`, `@shared/*`
- TypeScript strict mode enabled
- Tailwind CSS classes should be sorted (biome `useSortedClasses` rule)

## Architecture

### Electron App (apps/array)

- Main process: `src/main/` - Node.js, IPC handlers, services
- Renderer process: `src/renderer/` - React app
- Preload script: `src/main/preload.ts`
- IPC bridge pattern between main/renderer
- State management: Zustand stores in `src/renderer/stores/`
- Testing: Vitest with React Testing Library

### Agent Package (packages/agent)

- Wraps `@anthropic-ai/claude-agent-sdk`
- Git worktree management in `worktree-manager.ts`
- PostHog API integration in `posthog-api.ts`
- Task execution and session management

## Key Libraries

- React 18, Radix UI Themes, Tailwind CSS
- TanStack Query for data fetching
- xterm.js for terminal emulation
- CodeMirror for code editing
- Tiptap for rich text
- Zod for schema validation

## Environment Variables

- Copy `.env.example` to `.env`
- `ANTHROPIC_API_KEY` - Required for agent
- `OPENAI_API_KEY` - Optional
- `VITE_POSTHOG_*` - PostHog tracking config

## Testing

- Tests use vitest with jsdom environment
- Test helpers in `src/test/`
- Run specific test: `pnpm --filter array test -- path/to/test`
