# Agent Process Lifecycle Bug

## Problem Summary

Multiple interrelated bugs causing:
1. **Duplicate agents** - Multiple agent processes run for same task, causing interleaved responses
2. **App hangs on shutdown** - Cleanup waits indefinitely for unresponsive agent processes
3. **Orphaned processes** - Agent subprocesses not properly terminated

## Root Causes

### Race Condition #1: Renderer (sessionStore.ts:955-1012)
```typescript
if (connectAttempts.has(taskId)) return;  // Line 956 - check
// ... async work ...
connectAttempts.add(taskId);               // Line 1012 - add (too late!)
```
Two rapid calls both pass the check before either adds to the set.

### Race Condition #2: Main Process (service.ts:388-497)
```typescript
const existing = this.sessions.get(taskRunId);  // Line 389 - check
if (existing) return existing;
// ... 100+ lines of async work ...
this.sessions.set(taskRunId, session);          // Line 497 - set (too late!)
```
Also: Sessions keyed by `taskRunId`, not `taskId` - two runs for same task both create agents.

### No Cleanup Timeout (app-lifecycle/service.ts:22-40)
```typescript
await container.unbindAll();  // Line 26 - can hang forever
```
If agent subprocess doesn't respond, cleanup never completes, app never quits.

---

## Key Files

| File | Role |
|------|------|
| `apps/twig/src/main/services/agent/service.ts` | Main process agent management - sessions Map, getOrCreateSession, cleanupSession |
| `apps/twig/src/renderer/features/sessions/stores/sessionStore.ts` | Renderer session management - connectAttempts Set, connectToTask |
| `apps/twig/src/main/services/app-lifecycle/service.ts` | App shutdown - calls container.unbindAll() |
| `packages/agent/src/agent.ts` | Agent wrapper - cleanup() method |
| `packages/agent/src/adapters/acp-connection.ts` | ACP connection - actual cleanup logic |

---

## Fix Plan

### Phase 1: Main Process Mutex + Kill-Before-Create
- Add `sessionsByTaskId` Map to track by taskId (not just taskRunId)
- Add `pendingCreations` Map to prevent race conditions
- Before creating new session, clean up any existing session for same taskId

### Phase 2: Cleanup Timeout
- Race `agent.cleanup()` against 5-second timeout
- Call `forceCleanup()` if timeout

### Phase 3: Force Cleanup Method
- Add `forceCleanup()` to Agent class that aborts the session controller

### Phase 4: App Shutdown Timeout
- Add 10-second overall timeout to `shutdown()`

### Phase 5: Renderer Mutex
- Replace `connectAttempts` Set with Promise-based locking
- Check "connecting" status, not just "connected"

---

## Debug Log Location

When the app hangs on shutdown, check:
```
~/Library/Logs/twig/main.log
```

Or tail it live:
```bash
tail -f ~/Library/Logs/twig/main.log | grep -E "(AGENT_DEBUG|cleanupSession|getOrCreateSession|shutdown)"
```
