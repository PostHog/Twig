# Implementation Plan: Inline Editable Plan Tab

## Overview

Transform the planning workflow from a separate multi-step process into a single continuous session where:
1. The plan is a visible, editable document in a dedicated Plan tab
2. Users can modify the plan by prompting in the main chat (with full conversation context)
3. Claude writes/updates `plan.md` using tools, keeping everything in one session

## Current State

- **Multi-step workflow**: Research → Plan → Build → Finalize (each step can halt)
- **Separate sessions**: Each step runs `query()` which creates fresh context
- **Plan is invisible**: Generated text captured and written to file, not streamed to UI
- **No plan tab**: Plan only visible if you open `.posthog/{taskId}/plan.md` manually

## Target State

- **Single continuous session**: One Claude session from start to finish
- **Plan tab**: Dedicated tab showing `plan.md` with real-time updates
- **Bidirectional editing**: User can edit directly OR prompt Claude to update
- **Full context**: "Update the plan to add error handling" works because Claude has full chat history

---

## Implementation Phases

### Phase 1: Add Plan Tab to UI (No Claude changes)

**Goal**: Create a Plan tab that displays and allows editing of `plan.md`

**Changes**:
1. Add `"plan"` to `TabData` union in `panelTypes.ts`
2. Add `PLAN: "plan"` to `DEFAULT_TAB_IDS` in `panelConstants.ts`
3. Create `TaskPlanPanel.tsx` component (wrapper around existing `PlanEditor`)
4. Add `case "plan"` to `TabContentRenderer.tsx`
5. Add `openPlan(taskId)` action to `panelLayoutStore.ts`
6. Auto-open Plan tab when task is selected (alongside Chat tab)

**Test**:
- Open a task → Plan tab appears
- Edit text in Plan tab → saves to `.posthog/{taskId}/plan.md`
- Reload → edits persist

**Files to modify**:
- `apps/array/src/renderer/features/panels/store/panelTypes.ts`
- `apps/array/src/renderer/features/panels/constants/panelConstants.ts`
- `apps/array/src/renderer/features/task-detail/components/TaskPlanPanel.tsx` (new)
- `apps/array/src/renderer/features/task-detail/components/TabContentRenderer.tsx`
- `apps/array/src/renderer/features/panels/store/panelLayoutStore.ts`

---

### Phase 2: Real-time Plan File Watching

**Goal**: Plan tab updates live when `plan.md` changes on disk (from Claude or external edits)

**Changes**:
1. Add IPC handler `watchPlanFile(repoPath, taskId)` that uses `fs.watch`
2. Add IPC handler `unwatchPlanFile(repoPath, taskId)` for cleanup
3. Add `onPlanFileChange(callback)` to electron API
4. Update `TaskPlanPanel` to subscribe to file changes
5. Invalidate react-query cache when file changes externally

**Test**:
- Open Plan tab
- Manually edit `.posthog/{taskId}/plan.md` in external editor
- Plan tab updates automatically

**Files to modify**:
- `apps/array/src/main/services/fs.ts` (add watch handlers)
- `apps/array/src/preload.ts` (expose watch API)
- `apps/array/src/renderer/types/electron.d.ts` (types)
- `apps/array/src/renderer/features/task-detail/components/TaskPlanPanel.tsx`

---

### Phase 3: Add WritePlan Tool to Agent

**Goal**: Give Claude a dedicated tool to write/update the plan file

**Changes**:
1. Add `WritePlan` tool definition in `packages/agent/src/tools/registry.ts`
2. Add tool type in `packages/agent/src/tools/types.ts`
3. Implement tool handler in `packages/agent/src/adapters/claude/tools.ts`
4. Tool writes to `.posthog/{taskId}/plan.md` via file manager
5. Include `WritePlan` in allowed tools for the session

**Tool Schema**:
```typescript
{
  name: "WritePlan",
  description: "Write or update the implementation plan. Use this to create initial plans or modify existing ones based on user feedback.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The full plan content in markdown" },
      mode: {
        type: "string",
        enum: ["replace", "append"],
        description: "replace: overwrite entire plan, append: add to end"
      }
    },
    required: ["content"]
  }
}
```

**Test**:
- In a session, Claude calls `WritePlan` → file is created/updated
- Plan tab shows the new content (via Phase 2 file watching)

**Files to modify**:
- `packages/agent/src/tools/registry.ts`
- `packages/agent/src/tools/types.ts`
- `packages/agent/src/adapters/claude/tools.ts`
- `packages/agent/src/adapters/claude/claude.ts` (add to allowed tools)

---

### Phase 4: Add ReadPlan Tool to Agent

**Goal**: Let Claude read the current plan (including user edits) before modifying

**Changes**:
1. Add `ReadPlan` tool definition
2. Implement handler that reads `.posthog/{taskId}/plan.md`
3. Returns current content or empty string if no plan exists

**Tool Schema**:
```typescript
{
  name: "ReadPlan",
  description: "Read the current implementation plan. Use this before making modifications to understand what exists.",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

**Test**:
- User edits plan in Plan tab
- User prompts "What's in the current plan?"
- Claude calls `ReadPlan` and sees user's edits

**Files to modify**:
- `packages/agent/src/tools/registry.ts`
- `packages/agent/src/tools/types.ts`
- `packages/agent/src/adapters/claude/tools.ts`

---

### Phase 5: Unified System Prompt for Single-Session Mode

**Goal**: Create a system prompt that handles planning + execution in one session

**Changes**:
1. Create `packages/agent/src/agents/unified.ts` with combined prompt
2. Prompt instructs Claude to:
   - Use `WritePlan` to create/update implementation plans
   - Use `ReadPlan` before modifying to respect user edits
   - Transition from planning to implementation when user approves
   - Reference the plan during implementation
3. Include guidance on when to update plan vs execute

**System Prompt Key Points**:
```markdown
You are working on a software task. Your workflow:

1. PLANNING PHASE
   - Analyze the task and codebase
   - Use WritePlan to create an implementation plan
   - Wait for user approval before implementing

2. USER INTERACTION
   - User may edit the plan directly (use ReadPlan to see changes)
   - User may ask you to modify the plan via chat
   - When user says "looks good" or "implement", proceed to execution

3. EXECUTION PHASE
   - Follow the plan step by step
   - Update the plan if scope changes
   - Use TodoWrite to track progress
```

**Test**:
- Start new task → Claude creates plan via WritePlan
- Edit plan in UI → prompt "I updated step 2, please review"
- Claude calls ReadPlan, sees changes, acknowledges

**Files to create/modify**:
- `packages/agent/src/agents/unified.ts` (new)

---

### Phase 6: Single-Session Execution Mode

**Goal**: Replace multi-step workflow with single continuous session for local mode

**Changes**:
1. Add new method `runTaskUnified()` in `packages/agent/src/agent.ts`
2. Uses unified system prompt from Phase 5
3. Single `query()` call with full tool access
4. No workflow steps - Claude manages phases via tools
5. Maintains conversation context throughout

**Key Implementation**:
```typescript
async runTaskUnified(taskId: string, taskRunId: string, options: TaskExecutionOptions) {
  const prompt = buildUnifiedPrompt(task);

  const response = query({
    prompt,
    options: {
      model: "claude-sonnet-4-5",
      cwd: this.workingDirectory,
      permissionMode: options.permissionMode ?? "default",
      allowedTools: [
        // Read-only tools
        "Read", "Glob", "Grep", "WebFetch", "WebSearch",
        // Plan tools
        "ReadPlan", "WritePlan", "TodoWrite",
        // Implementation tools
        "Edit", "Write", "Bash", "Task",
        // MCP
        "ListMcpResources", "ReadMcpResource",
      ],
    }
  });

  // Stream events to session store
  for await (const message of response) {
    // ... handle messages, emit to UI
  }
}
```

**Test**:
- Start task in unified mode
- Claude creates plan → visible in Plan tab
- Say "implement" → Claude begins coding
- Say "wait, add logging to step 2" → Claude updates plan and continues

**Files to modify**:
- `packages/agent/src/agent.ts`
- `packages/agent/index.ts` (export new method)

---

### Phase 7: Wire Up Unified Mode in Electron App

**Goal**: Connect the new unified execution mode to the UI

**Changes**:
1. Update `agentStart` IPC handler to support unified mode
2. Add option to session store for execution mode selection
3. Default to unified mode for new tasks
4. Keep multi-step mode available as fallback

**Test**:
- Create new task → starts in unified mode
- Full flow: plan created → user edits → user approves → implementation
- All in single session with shared context

**Files to modify**:
- `apps/array/src/main/services/session-manager.ts`
- `apps/array/src/renderer/features/sessions/stores/sessionStore.ts`
- `apps/array/src/preload.ts` (if new IPC params needed)

---

### Phase 8: Plan Tab Polish

**Goal**: Enhance Plan tab UX for the new workflow

**Changes**:
1. Add "Generating..." indicator when Claude is writing plan
2. Add "Approve & Implement" button that sends approval prompt
3. Show plan status: Draft / Approved / Implementing
4. Add diff view option to see what changed
5. Keyboard shortcut to send "implement this plan" from Plan tab

**Test**:
- Plan generates → "Generating..." shown
- Click "Approve" → sends prompt, implementation starts
- During implementation, plan shows "Implementing" status

**Files to modify**:
- `apps/array/src/renderer/features/task-detail/components/TaskPlanPanel.tsx`
- `apps/array/src/renderer/features/editor/components/PlanEditor.tsx`

---

## Dependency Graph

```
Phase 1 (Plan Tab UI)
    ↓
Phase 2 (File Watching)
    ↓
Phase 3 (WritePlan Tool) ←→ Phase 4 (ReadPlan Tool)
    ↓
Phase 5 (Unified Prompt)
    ↓
Phase 6 (Single-Session Mode)
    ↓
Phase 7 (Electron Wiring)
    ↓
Phase 8 (Polish)
```

Phases 1-2 can be tested independently with manual file edits.
Phases 3-4 can be tested in isolation with direct agent calls.
Phases 5-7 require previous phases.
Phase 8 is pure UI enhancement.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Long sessions may hit context limits | Rely on Claude SDK's automatic summarization |
| User edits conflict with Claude's writes | ReadPlan before WritePlan pattern; file watching for UI |
| Permission mode complexity (plan vs edit) | Unified mode uses "default" - Claude asks for confirmation |
| Breaking existing workflow | Keep multi-step mode as fallback; feature flag |

---

## Success Criteria

1. User can see plan in dedicated tab as it's being generated
2. User can edit plan directly and Claude respects those edits
3. User can prompt "add error handling to step 3" and Claude updates plan
4. Single continuous conversation from planning through implementation
5. No loss of context when asking Claude to modify the plan



## External Edit Test
This line was added from the terminal at Wed Dec 10 11:49:19 GMT 2025
