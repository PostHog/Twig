# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a TypeScript-based agent framework that wraps the Anthropic Claude Agent SDK, providing plan-and-execute capabilities for PostHog's Array desktop app and future backend services. It uses a Git-based workflow with file system storage for task artifacts.

## Essential Commands

```bash
# Install dependencies
pnpm install

# Run example usage (demonstrates all features)
pnpm run example-usage.ts
```

Note: No test, lint, or build scripts are currently defined in package.json.

## Architecture

### Core Components

1. **Agent Class** (`src/agent.ts`):
   - Main interface to Claude API using `@anthropic-ai/claude-agent-sdk`
   - Supports three execution modes: PLAN_AND_BUILD, PLAN_ONLY, BUILD_ONLY
   - Git-based workflow with branch creation and commits
   - Event streaming with Array-compatible event format
   - Default model: claude-4-5-sonnet

2. **PostHog API Client** (`src/posthog-api.ts`):
   - Fetches existing tasks from PostHog Django backend
   - Authenticates using API keys and team resolution
   - Does not create tasks - only reads existing ones

3. **File Manager** (`src/file-manager.ts`):
   - Manages .posthog/{taskId}/ folder structure
   - Stores plans, context files, and supporting documents
   - Handles gitignore configuration for PostHog folders

4. **Git Manager** (`src/git-manager.ts`):
   - Creates task-specific branches for planning and implementation
   - Commits plans and implementations with descriptive messages
   - Branch naming: posthog/task-{id}-planning, posthog/task-{id}-implementation

5. **Template Manager** (`src/template-manager.ts`):
   - Generates standardized plan and context files from templates
   - Supports variable substitution in markdown templates
   - Creates consistent .posthog/ folder structures

6. **Task Manager** (`src/task-manager.ts`):
   - Tracks execution state (running, completed, failed, canceled)
   - Manages timeouts and cancellation
   - Does not store task data - only execution state

3. **Event System** (`src/event-transformer.ts`):
   - Maps Claude SDK events to Array's expected format
   - Supports: token, status, tool_call, tool_result, diff, file_write, metric, artifact, error, done

4. **System Prompts** (`src/agents/` directory):
   - `planning.ts`: System prompt for planning mode (read-only analysis)
   - `execution.ts`: System prompt for execution mode (implementation)
   - `ENGINEER.md`: Legacy prompt template (kept for reference)

5. **Entry Point** (`index.ts`):
   - Re-exports all public APIs from src
   - Clean import interface for consumers

### Key Patterns

- **Git-Based Workflow**: Plans and implementations are committed to separate branches
- **Plan-and-Execute Workflow**: Planning phase generates plans stored in .posthog/ folders
- **File System Storage**: Task artifacts stored in .posthog/{taskId}/ directories
- **PostHog Integration**: Fetches existing tasks from PostHog API, doesn't create new ones
- **Event Streaming**: Real-time event streaming compatible with Array app
- **Permission Modes**: Support for plan, default, acceptEdits, bypassPermissions

### Project Structure

```
/
├── example-usage.ts            # Comprehensive usage examples
├── tsconfig.json               # TypeScript configuration
└── src/                        # Source code
    ├── agent.ts                # Main Agent class
    ├── types.ts                # TypeScript interfaces and enums
    ├── posthog-api.ts          # PostHog API client
    ├── file-manager.ts         # .posthog/ folder management
    ├── git-manager.ts          # Git operations and branch management
    ├── template-manager.ts     # Plan and context templates
    ├── task-manager.ts         # Execution state tracking
    ├── event-transformer.ts    # Event mapping logic
    ├── agents/                 # System prompts
    │   ├── planning.ts         # Planning mode system prompt
    │   └── execution.ts        # Execution mode system prompt
    └── templates/              # Template files
        ├── plan-template.md    # Plan generation template
        └── context-template.md # Context file template
```

## Usage Patterns

### Basic Task Execution with PostHog
```typescript
const agent = new Agent({ 
    workingDirectory: "/path/to/repo",
    posthogApiUrl: "https://app.posthog.com",
    posthogApiKey: process.env.POSTHOG_API_KEY,
    posthogProjectId: 1
});

// Fetch existing PostHog task
const task = await agent.fetchTask("task_abc123");
const result = await agent.runTask(task, ExecutionMode.PLAN_AND_BUILD);
```

### Progress Updates
```typescript
const posthogClient = agent.getPostHogClient();
const poller = setInterval(async () => {
    const progress = await posthogClient?.getTaskProgress(taskId);
    if (progress?.has_progress) {
        updateUI(progress.status, progress.current_step, progress.completed_steps, progress.total_steps);
    }
}, 3000);

try {
    await agent.runWorkflow(taskId, workflowId, {
        repositoryPath: selectedRepoPath,
        permissionMode: PermissionMode.DEFAULT,
        autoProgress: true,
    });
} finally {
    clearInterval(poller);
}
```

> The agent still emits transformed events via the `onEvent` callback, so UI layers can combine streaming updates with periodic polling if desired.

```typescript
// Handle the hook provided when constructing the Agent
import type { AgentEvent } from '@posthog/agent';

private handleLiveEvent(event: AgentEvent) {
    switch (event.type) {
        case 'status':
            this.updateUI(event.phase, event.stage);
            break;
        case 'error':
            this.showError(event.message);
            break;
    }
}
```

### Working with Task Files
```typescript
// Add context files to task folder
await agent.writeTaskFile(taskId, "requirements.md", 
    "Must be backwards compatible...", "context");

// Read plan after planning phase
const plan = await agent.readPlan(taskId);

// All files are in .posthog/{taskId}/ and version controlled
```

### Git Workflow
```typescript
// Plan-only mode creates planning branch and commits plan
const planResult = await agent.runTask(taskId, ExecutionMode.PLAN_ONLY);
// Creates branch: posthog/task-{id}-planning
// Commits: .posthog/{taskId}/plan.md

// Build-only mode creates implementation branch
const buildResult = await agent.runTask(taskId, ExecutionMode.BUILD_ONLY);
// Creates branch: posthog/task-{id}-implementation  
// Commits: all implementation changes
```

## Development Notes

- Replaces the previous `@posthog/code-agent` package  
- Designed for both Array app and future backend integration
- Uses Claude SDK's native plan mode for proper planning workflow
- Git-based artifact storage replaces database-backed supporting files
- All task artifacts (.posthog/ folders) are version controlled alongside code
- PostHog tasks are read-only - SDK doesn't create tasks, only executes existing ones
- Event system compatible with existing Array app expectations

## File System Layout

When working with tasks, the agent creates this structure:

```
your-repo/
├── .posthog/
│   ├── README.md              # Auto-generated documentation
│   ├── .gitignore             # Controls what gets committed
│   └── {task-id}/             # Per-task folder
│       ├── plan.md            # Generated implementation plan
│       ├── context.md         # Additional context (optional)
│       └── *.md               # Other supporting files
└── (your regular code)
```

## Git Workflow

Each task execution creates specific Git branches:

1. **Planning Phase**: `posthog/task-{id}-planning`
   - Contains .posthog/{id}/ folder with plan files
   - Committed after plan generation
   - Ready for review before implementation

2. **Implementation Phase**: `posthog/task-{id}-implementation`  
   - Contains actual code changes
   - Includes updated .posthog/ files if needed
   - Ready for PR creation and code review

## Workflow Examples

### Complete Task Execution Flow

```typescript
// 1. Initialize agent with PostHog credentials
const agent = new Agent({
    workingDirectory: "/path/to/repo",
    posthogApiUrl: "https://app.posthog.com",
    posthogApiKey: process.env.POSTHOG_API_KEY,
    posthogProjectId: 1
});

// 2. Fetch existing task from PostHog
const task = await agent.fetchTask("task_abc123");

// 3. Add context files before execution (optional)
await agent.writeTaskFile(task.id, "requirements.md", 
    "- Maintain backwards compatibility\n- Add comprehensive tests", 
    "context"
);

// 4. Execute with PLAN_AND_BUILD mode and rely on PostHog polling for progress
const result = await agent.runWorkflow(task.id, workflowId, {
    repositoryPath: "/path/to/repo",
    permissionMode: PermissionMode.DEFAULT,
    autoProgress: true,
});

// 5. Review results
console.log("Planning branch:", `posthog/task-${task.id}-planning`);
console.log("Implementation branch:", `posthog/task-${task.id}-implementation`);
console.log("Plan location:", `.posthog/${task.id}/plan.md`);
```

### Array App Integration Pattern

```typescript
class ArrayTaskExecution {
    async executeTask(taskId: string, workflowId: string, repoPath: string) {
        const poller = setInterval(() => this.pollProgress(taskId), 3000);
        try {
            await this.agent.runWorkflow(taskId, workflowId, {
                repositoryPath: repoPath,
                permissionMode: PermissionMode.DEFAULT,
                autoProgress: true,
            });
        } finally {
            clearInterval(poller);
        }

        this.showBranchesForReview(taskId);
    }

    private async pollProgress(taskId: string) {
        const client = this.agent.getPostHogClient();
        if (!client) {
            return;
        }

        const progress = await client.getTaskProgress(taskId);
        if (progress.has_progress) {
            this.updateProgressBar({
                status: progress.status,
                currentStep: progress.current_step,
                completed: progress.completed_steps,
                total: progress.total_steps,
            });
        }
    }
}
```

### File System Operations

```typescript
// Working with task files
await agent.writeTaskFile(taskId, "context.md", contextContent, "context");
await agent.writeTaskFile(taskId, "requirements.md", requirements, "reference");

// Reading files
const plan = await agent.readPlan(taskId);
const files = await agent.getTaskFiles(taskId);

// Files are stored in .posthog/{taskId}/ and committed to Git
```

## Error Handling Patterns

```typescript
try {
    const result = await agent.runTask(taskId, ExecutionMode.PLAN_AND_BUILD);
} catch (error) {
    if (error.message.includes('Git command failed')) {
        // Handle Git-related errors (branch conflicts, etc.)
    } else if (error.message.includes('PostHog API')) {
        // Handle API-related errors (authentication, task not found)
    } else if (error.message.includes('File system')) {
        // Handle file permission or disk space issues
    }
}
```

## Performance Considerations

- **Branch Creation**: Fast Git operations using local commands
- **File I/O**: Efficient `.posthog/` folder management with minimal disk usage
- **API Calls**: Cached PostHog task data to minimize network requests
- **Event Streaming**: Real-time updates without blocking execution
- **Template Processing**: Lazy-loaded templates with variable substitution
