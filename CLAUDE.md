# Twig Development Guide

## Project Structure

- Monorepo with pnpm workspaces and turbo
- `apps/twig` - Twig Electron desktop app (React + Vite)
- `apps/cli` - CLI tool (thin wrapper around @twig/core)
- `apps/mobile` - React Native mobile app (Expo)
- `packages/agent` - TypeScript agent framework wrapping Claude Agent SDK
- `packages/core` - Shared business logic for jj/GitHub operations
- `packages/electron-trpc` - Custom tRPC package for Electron IPC

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
- **IPC**: tRPC over Electron IPC (type-safe via @posthog/electron-trpc)
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

- React 19, Radix UI Themes, Tailwind CSS
- TanStack Query for data fetching
- xterm.js for terminal emulation
- CodeMirror for code editing
- Tiptap for rich text
- Zod for schema validation
- InversifyJS for dependency injection
- Sonner for toast notifications

## Code Patterns

### React Components

Components are functional with hooks. Props typed with interfaces:

```typescript
interface AgentMessageProps {
  content: string;
}

export function AgentMessage({ content }: AgentMessageProps) {
  return (
    <Box className="py-1 pl-3">
      <MarkdownRenderer content={content} />
    </Box>
  );
}
```

Complex components organize hooks by concern (data, UI state, side effects):

```typescript
export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskId = initialTask.id;
  useTaskData({ taskId, initialTask });  // Data fetching

  const workspace = useWorkspaceStore((state) => state.workspaces[taskId]);  // Store
  const [filePickerOpen, setFilePickerOpen] = useState(false);  // Local state

  useHotkeys("mod+p", () => setFilePickerOpen(true), {...});  // Effects
  useFileWatcher(effectiveRepoPath ?? null, taskId);
  // ...
}
```

### Zustand Stores

Stores separate state and actions with persistence middleware:

```typescript
interface SidebarStoreState {
  open: boolean;
  width: number;
}

interface SidebarStoreActions {
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

type SidebarStore = SidebarStoreState & SidebarStoreActions;

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      open: false,
      width: 256,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
    }),
    {
      name: "sidebar-storage",
      partialize: (state) => ({ open: state.open, width: state.width }),
    }
  )
);
```

### tRPC Routers (Main Process)

Routers get services from DI container per-request:

```typescript
const getService = () => container.get<GitService>(MAIN_TOKENS.GitService);

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(detectRepoInput)
    .output(detectRepoOutput)
    .query(({ input }) => getService().detectRepo(input.directoryPath)),

  onCloneProgress: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(GitServiceEvent.CloneProgress, { signal: opts.signal })) {
      yield data;
    }
  }),
});
```

### Services (Main Process)

Services are injectable, stateless, and can emit events:

```typescript
@injectable()
export class GitService extends TypedEventEmitter<GitServiceEvents> {
  public async detectRepo(directoryPath: string): Promise<DetectRepoResult | null> {
    if (!directoryPath) return null;
    const remoteUrl = await this.getRemoteUrl(directoryPath);
    // ...
  }
}
```

### Custom Hooks

Hooks extract store subscriptions into cleaner interfaces:

```typescript
export function useConnectivity() {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const check = useConnectivityStore((s) => s.check);
  return { isOnline, check };
}
```

### Logger Usage

Use scoped logger instead of console:

```typescript
const log = logger.scope("navigation-store");

export const useNavigationStore = create<NavigationStore>()(
  persist((set, get) => {
    log.info("Folder path is stale, redirecting...", { folderId: folder.id });
    // ...
  })
);
```

## Testing Patterns

### Test File Location

Tests are colocated with source code using `.test.ts` or `.test.tsx` extension.

### Store Testing

```typescript
describe("store", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ /* reset state */ });
  });

  it("action changes state", () => {
    useStore.getState().action();
    expect(useStore.getState().property).toBe(expectedValue);
  });

  it("persists to localStorage", () => {
    useStore.getState().action();
    const persisted = localStorage.getItem("store-key");
    expect(JSON.parse(persisted).state).toEqual(expectedState);
  });
});
```

### Mocking Patterns

**Hoisted mocks for complex modules:**
```typescript
const mockPty = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node-pty", () => mockPty);
```

**Simple module mocks:**
```typescript
vi.mock("@renderer/lib/analytics", () => ({ track: vi.fn() }));
```

**Global fetch stubbing:**
```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
mockFetch.mockResolvedValueOnce(ok());
```

### Test Helpers

Test utilities are in `src/test/`:
- `setup.ts` - Global test setup with localStorage mock
- `utils.tsx` - `renderWithProviders()` for component tests
- `fixtures.ts` - Mock data factories
- `panelTestHelpers.ts` - Domain-specific assertions

## Directory Structure

```
apps/twig/src/
├── main/
│   ├── di/                   # InversifyJS container + tokens
│   ├── services/             # Stateless services (git, shell, workspace, etc.)
│   ├── trpc/
│   │   ├── router.ts         # Root router combining all routers
│   │   └── routers/          # Individual routers per service
│   └── lib/logger.ts
├── renderer/
│   ├── di/                   # Renderer DI container
│   ├── features/             # Feature modules (sessions, tasks, terminal, etc.)
│   ├── stores/               # Zustand stores (21+ stores)
│   ├── hooks/                # Custom React hooks
│   ├── components/           # Shared components
│   ├── trpc/client.ts        # tRPC client setup
│   └── lib/
│       ├── analytics.ts      # PostHog integration
│       └── logger.ts
├── shared/                   # Shared between main & renderer
│   ├── types.ts              # Shared type definitions
│   └── constants.ts
├── api/                      # PostHog API client
└── test/                     # Test utilities
```

## Environment Variables

- Copy `.env.example` to `.env`

## Testing

- `pnpm test` - Run tests across all packages
- Twig app: Vitest with jsdom, helpers in `apps/twig/src/test/`
- E2E: Playwright in `tests/e2e/`
