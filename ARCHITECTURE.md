# Contributing to Array

## Architecture Overview

Array is an Electron app with a React renderer. The main process handles system operations (stateless), while the renderer owns all application state.

```
Main Process (Node.js)                      Renderer Process (React)
┌───────────────────────┐                   ┌───────────────────────────┐
│  DI Container         │                   │  DI Container             │
│  ├── GitService       │                   │  ├── TRPCClient           │
│  └── ...              │                   │  └── TaskService, ...     │
├───────────────────────┤                   ├───────────────────────────┤
│  tRPC Routers         │ ◄─tRPC(ipcLink)─► │ tRPC Clients              │
│  (use DI services)    │                   │  ├── trpcReact (hooks)    │
├───────────────────────┤                   │  └── trpcVanilla          │
│  System I/O           │                   ├───────────────────────────┤
│  (fs, git, shell)     │                   │  Zustand Stores (state)   │
│  STATELESS            │                   │  ├── taskStore            │
└───────────────────────┘                   │  ├── workspaceStore       │
                                            │  └── ...                  │
                                            ├───────────────────────────┤
                                            │  React UI                 │
                                            └───────────────────────────┘
```

**Key points:**
- Both processes use InversifyJS for DI
- Renderer DI holds services + tRPC client; services can coordinate stores
- Zustand stores own all application state (not in DI)
- Main process is stateless - pure I/O operations only

## Dependency Injection

Both processes use [InversifyJS](https://inversify.io/) for dependency injection with singleton scope.

| Process  | Container          | Holds                                |
|----------|--------------------|------------------------------------- |
| Main     | `src/main/di/`     | Stateless services (GitService, etc.)|
| Renderer | `src/renderer/di/` | Services + TRPCClient                |

### Defining a Service

```typescript
// src/main/services/my-service/service.ts (or src/renderer/services/)
import { injectable } from "inversify";

@injectable()
export class MyService {
  doSomething() {
    // ...
  }
}
```

### Registering a Service

```typescript
// src/main/di/container.ts (or src/renderer/di/container.ts)
container.bind<MyService>(TOKENS.MyService).to(MyService);
```

```typescript
// src/main/di/tokens.ts (or src/renderer/di/tokens.ts)
export const MAIN_TOKENS = Object.freeze({
  MyService: Symbol.for("Main.MyService"),
});
```

### Injecting Dependencies

Services should declare dependencies via constructor injection:

```typescript
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../di/tokens";

@injectable()
export class MyService {
  constructor(
    @inject(MAIN_TOKENS.OtherService)
    private readonly otherService: OtherService,
  ) {}

  doSomething() {
    return this.otherService.getData();
  }
}
```

### Using Services in tRPC Routers

tRPC routers resolve services from the container:

```typescript
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";

const getService = () => container.get<MyService>(MAIN_TOKENS.MyService);

export const myRouter = router({
  getData: publicProcedure.query(() => getService().getData()),
});
```

### Testing with Mocks

Constructor injection makes testing straightforward:

```typescript
// Direct instantiation with mock
const mockOtherService = { getData: vi.fn().mockReturnValue("test") };
const service = new MyService(mockOtherService as OtherService);

// Or rebind in container for integration tests
container.snapshot();
container.rebind(MAIN_TOKENS.OtherService).toConstantValue(mockOtherService);
// ... run tests ...
container.restore();
```

## IPC via tRPC

We use [tRPC](https://trpc.io/) with [trpc-electron](https://github.com/jsonnull/electron-trpc) for type-safe communication between main and renderer. The `ipcLink()` handles serialization over Electron IPC.

### Creating a Router (Main Process)

```typescript
// src/main/trpc/routers/my-router.ts
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  getDataInput,
  getDataOutput,
  updateDataInput,
} from "../../services/my-service/schemas";
import { router, publicProcedure } from "../trpc";

const getService = () => container.get<MyService>(MAIN_TOKENS.MyService);

export const myRouter = router({
  getData: publicProcedure
    .input(getDataInput)
    .output(getDataOutput)
    .query(({ input }) => getService().getData(input.id)),

  updateData: publicProcedure
    .input(updateDataInput)
    .mutation(({ input }) => getService().updateData(input.id, input.value)),
});
```

### Registering the Router

```typescript
// src/main/trpc/router.ts
import { myRouter } from "./routers/my-router";

export const trpcRouter = router({
  my: myRouter,
  // ...
});
```

### Using tRPC in Renderer

**React hooks:**

```typescript
import { trpcReact } from "@renderer/trpc/client";

function MyComponent() {
  // Queries
  const { data } = trpcReact.my.getData.useQuery({ id: "123" });

  // Mutations
  const mutation = trpcReact.my.updateData.useMutation();
  const handleUpdate = () => mutation.mutate({ id: "123", value: "new" });
}
```

**Outside React (vanilla client):**

```typescript
import { trpcVanilla } from "@renderer/trpc/client";

const data = await trpcVanilla.my.getData.query({ id: "123" });
```

## State Management

**All application state lives in the renderer.** Main process services should be stateless/pure.

| Layer | State | Role |
|-------|-------|------|
| **Renderer** | Zustand stores | Owns all application state |
| **Main** | Stateless | Pure operations (file I/O, git, shell, etc.) |

This keeps state predictable, easy to debug, and naturally supports patterns like undo/rollback.

### Example

```typescript
// ❌ Bad - main service with state
@injectable()
class TaskService {
  private currentTask: Task | null = null;  // Don't do this
}

// ✅ Good - main service is pure
@injectable()
class TaskService {
  async readTask(id: string): Promise<Task> { /* ... */ }
  async writeTask(task: Task): Promise<void> { /* ... */ }
}

// ✅ Good - state lives in renderer
// src/renderer/stores/task-store.ts
const useTaskStore = create<TaskState>((set) => ({
  currentTask: null,
  setCurrentTask: (task) => set({ currentTask: task }),
}));
```

## Services

Services encapsulate business logic and exist in both processes:

- **Main services** (`src/main/services/`) - System operations (file I/O, git, shell)
- **Renderer services** (`src/renderer/services/`) - UI logic, API calls

Main services should be:

- **Injectable**: Decorated with `@injectable()` for DI
- **Stateless**: No mutable instance state, pure operations only
- **Single responsibility**: One concern per service

### Service Structure

```
src/main/services/
├── my-service/
│   ├── service.ts      # The injectable service class
│   ├── schemas.ts      # Zod schemas for tRPC input/output
│   └── types.ts        # Internal types (not exposed via tRPC)

src/renderer/services/
├── my-service.ts       # Renderer-side service
```

### Zod Schemas

All tRPC inputs and outputs use Zod schemas as the single source of truth. Types are inferred from schemas.

```typescript
// src/main/services/my-service/schemas.ts
import { z } from "zod";

export const getDataInput = z.object({
  id: z.string(),
});

export const getDataOutput = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export type GetDataInput = z.infer<typeof getDataInput>;
export type GetDataOutput = z.infer<typeof getDataOutput>;
```

```typescript
// src/main/trpc/routers/my-router.ts
import { getDataInput, getDataOutput } from "../../services/my-service/schemas";

export const myRouter = router({
  getData: publicProcedure
    .input(getDataInput)
    .output(getDataOutput)
    .query(({ input }) => getService().getData(input.id)),
});
```

```typescript
// src/main/services/my-service/service.ts
import type { GetDataInput, GetDataOutput } from "./schemas";

@injectable()
export class MyService {
  async getData(id: string): Promise<GetDataOutput> {
    // ...
  }
}
```

This pattern provides:
- Runtime validation of inputs and outputs
- Single source of truth for types
- Explicit API contracts between main and renderer

## Adding a New Feature

1. **Create the service** in `src/main/services/`
2. **Add DI token** in `src/main/di/tokens.ts`
3. **Register service** in `src/main/di/container.ts`
4. **Create tRPC router** in `src/main/trpc/routers/`
5. **Add router** to `src/main/trpc/router.ts`
6. **Use in renderer** via `trpcReact` hooks

## Code Style

See [CLAUDE.md](./CLAUDE.md) for linting, formatting, and import conventions.

Key points:
- Use path aliases (`@main/*`, `@renderer/*`, etc.)
- No barrel files - import directly from source
- Use `logger` instead of `console.*`
