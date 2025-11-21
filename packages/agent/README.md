# PostHog Agent SDK

TypeScript agent framework that wraps the Claude Agent SDK for PostHog's Array desktop app. Features a Git-based task execution system that stores task artifacts alongside your code.

## Quick Start

```bash
pnpm install
pnpm run example
```

## Key Features

- **Git-Based Task Execution**: Plans and artifacts stored in `.posthog/` folders and committed to Git
- **PostHog Integration**: Fetches existing tasks from PostHog API
- **3-Phase Execution**: Research → Plan → Build with automatic progression
- **Branch Management**: Automatic branch creation for planning and implementation
- **Progress Tracking**: Execution status stored in PostHog `TaskRun` records for easy polling

## Usage

```typescript
import { Agent, PermissionMode } from '@posthog/agent';
import type { AgentEvent } from '@posthog/agent';

const agent = new Agent({
    workingDirectory: "/path/to/repo",
    posthogApiUrl: "https://app.posthog.com",
    posthogApiKey: process.env.POSTHOG_API_KEY, // Used for both API and MCP
    posthogProjectId: 1,
    onEvent: (event) => {
      // Streamed updates for responsive UIs
      if (event.type !== 'token') {
        handleLiveEvent(event);
      }
    },
});

// Run a task
const taskId = "task_abc123";
const task = await agent.getPostHogClient()?.fetchTask(taskId);

await agent.runTask(task, {
  repositoryPath: "/path/to/repo",
  permissionMode: PermissionMode.ACCEPT_EDITS,
  isCloudMode: false,
  createPR: true, // Optional: create PR after build. This setting has no effect if running in cloud mode.
  autoProgress: true,
});
```

For local MCP development:

```typescript
const agent = new Agent({
  workingDirectory: "/path/to/repo",
  posthogMcpUrl: 'http://localhost:8787/mcp',
});
```

## Task Execution

Each task execution creates Git branches and follows a 3-phase approach:

1. **Research Phase**: Analyzes the codebase and may generate clarifying questions
2. **Planning Phase**: Creates an implementation plan in `.posthog/{id}/plan.md` on branch `posthog/task-{id}-planning`
3. **Build Phase**: Implements code changes on branch `posthog/task-{id}-implementation`

## File System

```
your-repo/
├── .posthog/
│   ├── README.md
│   ├── .gitignore
│   └── {task-id}/
│       ├── plan.md
│       ├── questions.json (if research phase generated questions)
│       └── context.md (optional)
└── (your code)
```

## Progress Updates

Progress for each task execution is persisted to PostHog's `TaskRun` model, so UIs can poll for updates without relying on streaming hooks:

```typescript
const agent = new Agent({
  workingDirectory: repoPath,
  posthogApiUrl: "https://app.posthog.com",
  posthogApiKey: process.env.POSTHOG_KEY,
  posthogProjectId: 1,
});

const poller = setInterval(async () => {
  const client = agent.getPostHogClient();
  const runs = await client?.listTaskRuns(taskId);
  const latestRun = runs?.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  
  if (latestRun) {
    // Fetch logs from S3 using presigned URL
    const logs = await client?.fetchTaskRunLogs(latestRun);
    renderProgress(latestRun.status, logs || []);
  }
}, 3000);

try {
  await agent.runTask(task, { repositoryPath: repoPath });
} finally {
  clearInterval(poller);
}

// Live stream still available through the onEvent hook
function handleLiveEvent(event: AgentEvent) {
  switch (event.type) {
    case 'status':
      // optimistic UI update
      break;
    case 'error':
      notifyError(event.message);
      break;
    default:
      break;
  }
}
```

> Prefer streaming updates? Pass an `onEvent` handler when constructing the agent to keep receiving real-time events while progress is also written to PostHog.

## Requirements

- PNPM
- Git repository
- PostHog API access
- Claude API access via `@anthropic-ai/claude-agent-sdk`

## Configuration Options

You can customize behavior using `TaskExecutionOptions`:

```ts
await agent.runTask(task, {
  repositoryPath: "/path/to/repo",
  permissionMode: PermissionMode.ACCEPT_EDITS, // or PLAN, DEFAULT, BYPASS
  isCloudMode: false, // local execution with pauses between phases
  autoProgress: true, // automatically progress through phases
  queryOverrides: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7
  }
});
```

## Fine-Grained Permissions

For advanced control over agent actions, you can provide a `canUseTool` callback that intercepts every tool use during the **build phase** (for task execution) or **direct run calls**. This allows you to implement custom approval flows, logging, or restrictions.

See the [Claude Agent SDK Permissions docs](https://docs.claude.com/en/api/agent-sdk/permissions) for more details.

### Per-Agent Configuration

Apply the same permission hook to all task executions and direct runs:

```typescript
import { Agent } from '@posthog/agent';
import type { PermissionResult } from '@posthog/agent';

const agent = new Agent({
  workingDirectory: "/path/to/repo",
  posthogApiUrl: "https://app.posthog.com",
  posthogApiKey: process.env.POSTHOG_API_KEY,
  posthogProjectId: 1,
  canUseTool: async (toolName, input, { signal, suggestions }) => {
    // Block destructive commands
    if (toolName === 'Bash' && input.command?.includes('rm -rf')) {
      return {
        behavior: 'deny',
        message: 'Destructive rm -rf commands are not allowed',
        interrupt: true
      };
    }

    // Allow everything else
    return {
      behavior: 'allow',
      updatedInput: input
    };
  }
});
```

### Per-Task Configuration

Override permissions for specific tasks (only applied during build phase):

```typescript
await agent.runTask(task, {
  repositoryPath: "/path/to/repo",
  permissionMode: PermissionMode.DEFAULT,
  canUseTool: async (toolName, input, { signal, suggestions }) => {
    // Custom approval UI
    const approved = await showApprovalDialog({
      tool: toolName,
      input: input,
      suggestions: suggestions // Permission updates for "always allow"
    });

    if (approved.action === 'allow') {
      return {
        behavior: 'allow',
        updatedInput: approved.modifiedInput || input,
        updatedPermissions: approved.rememberChoice ? suggestions : undefined
      };
    }

    return {
      behavior: 'deny',
      message: approved.reason || 'User denied permission',
      interrupt: !approved.continueWithGuidance
    };
  }
});
```

### Direct Run Example

For one-off queries with custom permissions:

```typescript
const result = await agent.run("Fix the authentication bug", {
  repositoryPath: "/path/to/repo",
  permissionMode: PermissionMode.DEFAULT,
  canUseTool: async (toolName, input, { signal }) => {
    console.log(`Agent wants to use ${toolName}:`, input);

    // Simple approval logic
    if (toolName === 'Write' || toolName === 'Edit') {
      const allowedFiles = ['src/', 'tests/'];
      const filePath = input.file_path || input.path;
      const isAllowed = allowedFiles.some(prefix => filePath?.startsWith(prefix));

      if (!isAllowed) {
        return {
          behavior: 'deny',
          message: `Can only modify files in: ${allowedFiles.join(', ')}`
        };
      }
    }

    return { behavior: 'allow', updatedInput: input };
  }
});
```

### Available Tool Names

The `canUseTool` callback receives one of these tool names:
- **Read-only**: `Read`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `ListMcpResources`, `ReadMcpResource`
- **Modifications**: `Write`, `Edit`, `NotebookEdit`
- **Execution**: `Bash`, `BashOutput`, `KillBash`, `Task`
- **Planning**: `ExitPlanMode`, `TodoWrite`

**Note**: Research and planning phases have fixed, read-only tool sets. The `canUseTool` hook only applies to the build phase and direct run calls.
