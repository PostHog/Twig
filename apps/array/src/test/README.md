# Test Utilities

This directory contains shared test utilities and fixtures for the Array application.

## Test Harness

### ServiceTestHarness

A reusable test harness for testing services that depend on external modules like `child_process` and `fs`. This harness provides a clean interface for mocking system calls.

#### Features

- Mock `exec`, `execFile`, and `spawn` from `child_process`
- Mock file system operations from `fs.promises`
- Configure responses for specific commands and arguments
- Handle both success and error cases
- Support for multiple sequential mock responses
- TypeScript-first design with full type safety

#### Basic Usage

```typescript
import { ServiceTestHarness } from "../../../test/service-test-harness.js";

const harness = new ServiceTestHarness();

describe("MyService", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("calls git command", async () => {
    harness.setExecFileResponse(
      "git",
      ["status"],
      "On branch main\n"
    );

    // Your test code here
  });
});
```

#### Creating Custom Mocks with vi.hoisted()

For services that use dependency injection or need complex mocking, use `vi.hoisted()` to create mocks that work with Vitest's hoisting mechanism:

```typescript
const { mockExec, mockSpawn } = vi.hoisted(() => {
  const mockExec = vi.fn();
  mockExec.mockResolvedValue({ stdout: "", stderr: "" });
  
  return { mockExec, mockSpawn: vi.fn() };
});

vi.mock("node:child_process", () => ({
  exec: mockExec,
  spawn: mockSpawn,
}));
```

## Test Patterns

### Testing Services with DI

When testing services that use InversifyJS dependency injection:

1. Create the service directly in tests (no container needed for unit tests)
2. Mock external dependencies using the test harness
3. Verify behavior through assertions on mock calls and return values

```typescript
import { GitService } from "./service.js";

describe("GitService", () => {
  let service: GitService;

  beforeEach(() => {
    service = new GitService();
  });

  it("detects repository", async () => {
    setExecFileResponse("git", ["remote", "get-url", "origin"], "https://github.com/org/repo.git\n");
    
    const result = await service.detectRepo("/path");
    
    expect(result).toEqual({ organization: "org", repository: "repo" });
  });
});
```

### Testing with Multiple Mock Responses

When a test needs multiple different responses from the same mock:

```typescript
// Set up multiple responses that will match in order
setExecFileResponse("git", ["branch", "--show-current"], "main\n");
setExecFileResponse("git", ["remote", "get-url", "origin"], "https://github.com/org/repo.git\n");

// Both commands will return their respective responses
```

### Testing Error Cases

```typescript
it("handles errors gracefully", async () => {
  harness.setExecFileError("git", ["status"], "fatal: not a git repository");
  
  const result = await service.getStatus();
  
  expect(result).toBeNull();
});
```

### Testing Spawn Processes

For testing `spawn` calls that use streams:

```typescript
it("handles clone progress", async () => {
  const mockProcess = harness.createMockSpawnProcess();
  harness.mockSpawn.mockReturnValue(mockProcess);

  const promise = service.clone("https://github.com/org/repo.git");

  // Emit events
  mockProcess.stderr.emit("data", Buffer.from("Cloning..."));
  
  // Complete the process
  mockProcess.on.mock.calls.find(([event]) => event === "close")?.[1](0);

  await expect(promise).resolves.toBeDefined();
});
```

## Best Practices

1. **Always reset mocks between tests** - Use `harness.reset()` in `beforeEach`
2. **Test both success and error paths** - Ensure comprehensive coverage
3. **Use specific command matching** - Match exact arguments when possible
4. **Keep tests isolated** - Each test should set up its own mocks
5. **Mock at the module boundary** - Mock `node:child_process`, not the service
6. **Verify mock calls** - Check that mocks were called with expected arguments

## Examples

See the following files for complete examples:

- `src/main/services/git/service.test.ts` - Comprehensive GitService tests with 64 test cases
- `src/main/services/updates/service.test.ts` - UpdatesService tests with electron mocks
- `src/main/services/workspace/configSchema.test.ts` - Schema validation tests

## Running Tests

```bash
# Run all tests
pnpm --filter array test

# Run specific test file
pnpm --filter array test src/main/services/git/service.test.ts

# Run with coverage
pnpm --filter array test --coverage

# Run in watch mode
pnpm --filter array test --watch
```
