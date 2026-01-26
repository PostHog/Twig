# Cloud Mode Architecture

## The Challenge

Cloud coding agents face a fundamental tension: you want them to feel like your laptop, but they're not. You want the experience of running locally—real-time feedback, files on your disk, your IDE, full control—but the convenience of interacting from your phone or Slack while you're away.

This creates two distinct experiences:

**Interactive Mode** — "I'm watching"

- Real-time feedback as the agent works
- You can interrupt, redirect, answer questions
- Feels like pair programming

**Background Mode** — "Wake me when it's done"

- Agent works autonomously
- You check in when you're ready
- Review changes, pull them locally, continue
- Feels like delegating to a colleague

Most cloud agent implementations force you to choose one or the other. The goal here is to support both seamlessly—and let you switch between them without friction.

### Key Goals

1. **Seamless handoff** — Move sessions between local and cloud without losing state
2. **Local-first feel** — Edit in Twig or your IDE, changes sync automatically
3. **Survive disconnection** — Close your laptop, agent keeps working
4. **Seamless resume** — Reconnect and catch up instantly
5. **Multiple clients** — Laptop, phone, Slack, API—all work
6. **Simple recovery** — If sandbox dies, state is recoverable
7. **Resume anywhere** — Stop on cloud, resume on local (or vice versa)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│    Twig Desktop    │    Slack Bot    │    API    │    Mobile App       │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Streamable HTTP (SSE + POST)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTHOG BACKEND                                  │
│                                                                          │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │   Sync API      │    │    Temporal     │    │   Storage       │    │
│   │   (FastAPI)     │◄──►│    Workflow     │◄──►│                 │    │
│   └─────────────────┘    └─────────────────┘    │  - ClickHouse   │    │
│          │                      │               │    (events)     │    │
│          │                      │               │  - S3 (trees)   │    │
│          ▼                      │               │  - Kafka        │    │
│   ┌─────────────────┐           │               └─────────────────┘    │
│   │  Redis Pub/Sub  │           │                       ▲               │
│   │  (real-time)    │           │                       │               │
│   └─────────────────┘           │               append_log API          │
│          │                      │                       │               │
└──────────┼──────────────────────┼───────────────────────┼───────────────┘
           │                      │                       │
           │ SSE (commands)       │ provision_sandbox     │
           ▼                      ▼                       │
┌─────────────────────────────────────────────────────────────────────────┐
│                    SANDBOX (Docker/Modal)                                │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                   @posthog/agent-server                          │   │
│   │                   (packages/agent-server/)                       │   │
│   │                                                                  │   │
│   │   AgentServer class:                                             │   │
│   │     - SSE connection to backend (GET /sync) for commands         │   │
│   │     - ACP connection to Claude CLI subprocess                    │   │
│   │     - TreeTracker for capturing file state                       │   │
│   │     - Events persisted via POST /append_log ─────────────────────┼───┘
│   │                                                                  │   │
│   └───────────────────────────┬──────────────────────────────────────┘   │
│                               │                                          │
│                               │ ACP (Agent Client Protocol)              │
│                               ▼                                          │
│                    ┌─────────────────────┐                               │
│                    │     Claude CLI      │                               │
│                    │   (subprocess)      │                               │
│                    └─────────────────────┘                               │
│                               │                                          │
│                               ▼                                          │
│                    ┌─────────────────────┐                               │
│                    │   Git Repository    │                               │
│                    └─────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. User sends message (Client → POST /sync → Backend → Redis `to-agent` channel)
2. Agent server receives command via SSE stream (GET /sync)
3. Agent server calls `clientConnection.prompt()` via ACP to Claude CLI
4. Claude generates response (streamed via ACP `sessionUpdate` callbacks)
5. Agent server persists each event via `POST /append_log`
6. Backend distributes events to connected clients via SSE + stores to S3/Kafka/ClickHouse

**Key insight:** Git trees are the source of truth for file state. ClickHouse is the source of truth for events. The backend handles all persistence (ClickHouse for events, S3 for tree archives, Kafka for real-time streaming) via the `append_log` API. The agent server doesn't write directly to these stores—it calls the backend API.

---

## Storage Architecture

### Events → append_log API → ClickHouse

Agent events flow through the `append_log` API. The backend handles distribution and persistence:

```
Agent ──► POST /append_log ──► Backend ──┬──► ClickHouse (persistent event log)
                                         ├──► Kafka (real-time streaming)
                                         └──► SSE to clients (if connected)
```

**Why the agent doesn't write directly to Kafka/ClickHouse:**

- Simpler agent implementation (just HTTP calls)
- Backend can add metadata, validate, rate-limit
- Single source of truth for event routing logic
- Agent doesn't need Kafka/ClickHouse credentials in sandbox

### Tree Archives → S3

Tree archives (compressed working directory snapshots) still go to S3:

```
S3 Structure:
  trees/
    {tree_hash}.tar.gz    → compressed tree contents
    {tree_hash}.manifest  → file listing with hashes
```

**Why S3 for trees:**

- Large binary blobs (tens/hundreds of MB)
- Infrequent access (only on resume)
- Cost-effective for storage

### ClickHouse Schema

```sql
CREATE TABLE agent_events (
    team_id UInt64,
    task_id UUID,
    run_id UUID,
    event_id UInt64,  -- monotonic per run, used for Last-Event-ID
    timestamp DateTime64(3),
    method String,
    params String,  -- JSON
    device_id String,
    device_type Enum8('local' = 1, 'cloud' = 2),
    device_name Nullable(String)
) ENGINE = MergeTree()
ORDER BY (team_id, task_id, run_id, event_id);
```

---

## Tree-Based Storage

### Git Trees Instead of Individual Files

Instead of uploading every file change, we use `git diff-tree` to capture state changes as trees. This is more efficient and aligns with how git already tracks changes.

**Benefits:**

- Atomic snapshots (entire working state, not individual files)
- Efficient transfer (only changed trees uploaded)
- Natural git integration (trees are git's native unit)
- Simpler recovery (restore a tree, not replay file events)

### Tree Capture Flow

```
Agent works on files
       │
       ▼
TreeTracker detects significant change
(commit, tool completion, or periodic)
       │
       ├──► git write-tree (capture current state)
       │
       ├──► git diff-tree (compare to last snapshot)
       │
       ├──► Pack changed files into tree archive
       │
       └──► POST /append_log with _posthog/tree_snapshot event
                    │
                    ▼
            Backend handles:
                    ├──► PUT to S3: trees/{tree_hash}.tar.gz (archive only)
                    ├──► Persist event to ClickHouse (event log)
                    ├──► Kafka for real-time streaming
                    └──► SSE to connected clients
```

### When Trees Are Captured

- After each git commit
- After significant tool completions (file writes, bash commands)
- On stop (final tree before shutdown)
- Periodically (every N minutes of activity)

---

## Resume & State

Since tree snapshots are captured continuously via `append_log`, we can resume from any point. There's no special "pause" operation—state just exists.

### State = Task + Tree

Everything needed to resume is in ClickHouse (events) and S3 (tree archives):

```typescript
// From the latest tree_snapshot event in ClickHouse
interface ResumeState {
  task_id: string
  base_commit: string    // Git commit the tree is based on
  tree_hash: string      // The diff-tree reference
  tree_url: string       // S3 location of tree archive
}
```

To resume a task anywhere:
1. Find task by `task_id`
2. Query ClickHouse for task run events via backend API
3. Find latest `tree_snapshot` event with `base_commit` + `tree_hash` + `tree_url`
4. Download tree archive from S3
5. Restore from there

### Resume Flow

```
resumeFromLog(taskId, runId) called
       │
       ├──► Fetch events from backend API (queries ClickHouse)
       │
       ├──► Parse events to find latest tree_snapshot
       │
       ├──► Return resume state: { latestSnapshot, interrupted }
       │
       └──► Agent server sets TreeTracker to last known state
                    │
                    ▼
            Agent continues where it left off
```

### Handoff Scenarios

All handoffs are just: stop current environment, resume elsewhere.

**Local → Cloud:**

```
Local Twig                     Backend                         Cloud Sandbox
    │                            │                                  │
    │── stop local agent         │                                  │
    │   (tree snapshot via       │                                  │
    │    append_log)             │                                  │
    │                            │                                  │
    │── startCloud(task_id) ────►│                                  │
    │                            │── provision sandbox ────────────►│
    │                            │── start agent-server ───────────►│
    │                            │                                  │── resumeFromLog()
    │                            │◄── ready ────────────────────────│
    │◄── connected ──────────────│                                  │
```

**Cloud → Local:**

```
Cloud Sandbox                  Backend                         Local Twig
    │                            │                                  │
    │── stop() ─────────────────►│                                  │
    │   (final tree via          │                                  │
    │    append_log)             │                                  │
    │── shutdown ────────────────│                                  │
    │                            │                                  │
    │                            │◄── pullToLocal(task_id) ─────────│
    │                            │                                  │── resumeFromLog()
    │                            │                                  │── restore from S3 logs
    │                            │                                  │── continue locally
```

**Resume later (any environment):**

```
... time passes ...
    │
    │── resumeFromLog(task_id) ──────► query ClickHouse, restore tree from S3
    │── continue working
```

### Robustness Requirements

Resume must handle:

1. **Partial uploads** — Tree upload must complete before stop confirms
2. **Large repos** — Stream tree archives, don't load in memory
3. **Network failures** — Retry with exponential backoff
4. **Conversation replay** — Rebuild conversation from log events
5. **Concurrent access** — Prevent two environments from running same task simultaneously

---

## State & Recovery

### Events in ClickHouse = Recovery

Recovery is just `resumeFromLog(taskId, runId)`. ClickHouse has all events:

```
ClickHouse Events (task_id = xxx):

  { method: "_posthog/git_commit", params: { sha: "abc123" }, device: { id: "dev_1", type: "local" } }
  { method: "_posthog/tree_snapshot", params: { tree_hash: "def456", base_commit: "abc123", ... }, device: { id: "dev_1", type: "local" } }
  { method: "_posthog/user_message", params: { content: "..." }, device: { id: "dev_1", type: "local" } }
  { method: "agent_message_chunk", params: { text: "..." }, device: { id: "dev_1", type: "local" } }
  -- handoff to cloud --
  { method: "_posthog/git_commit", params: { sha: "ghi789" }, device: { id: "sandbox_x", type: "cloud" } }
  { method: "_posthog/tree_snapshot", params: { tree_hash: "jkl012", ... }, device: { id: "sandbox_x", type: "cloud" } }
```

Device changes are visible naturally in the event stream—no explicit handoff events needed.

**To resume:** Query ClickHouse for latest `tree_snapshot`, download archive from S3, restore from it.

**If tree expired in S3:** Fall back to latest `git_commit` (loses uncommitted work).

### Trees vs Commits

| Mechanism | When | What's captured | Durability |
|-----------|------|-----------------|------------|
| Tree snapshot | After tool completions, on stop | Working tree (uncommitted) | 30 days in S3 |
| Git commit | On significant changes | Committed files | Permanent (pushed to remote) |

**Best practice:** Agent commits frequently so that even if trees expire, minimal work is lost.

### Data Retention

| Data | Storage | Retention | Recovery |
|------|---------|-----------|----------|
| Git commits | Remote repo | Permanent | Always recoverable (committed work only) |
| Tree archives | S3 | 30 days | Full state including uncommitted |
| Event history | ClickHouse | Configurable | Conversation + history |

---

## Agent Architecture

### The @posthog/agent-server Package

The agent server runs in cloud sandboxes (Docker/Modal) and is implemented in:

```
packages/agent-server/
├── src/
│   ├── agent-server.ts   # Main AgentServer class
│   ├── index.ts          # CLI entry point + exports
│   └── types.ts          # AgentServerConfig, DeviceInfo, TreeSnapshot
├── package.json
└── tsup.config.ts
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentServer (cloud sandbox)                   │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    SSE Connection                        │   │
│   │               (GET /sync from backend)                   │   │
│   │                                                          │   │
│   │   Receives: user_message, cancel, stop commands          │   │
│   └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    ACP Connection                        │   │
│   │             (to Claude CLI subprocess)                   │   │
│   │                                                          │   │
│   │   clientConnection.prompt() → sessionUpdate callbacks    │   │
│   └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    TreeTracker                           │   │
│   │               (captures file state)                      │   │
│   │                                                          │   │
│   │   After file changes → _posthog/tree_snapshot events     │   │
│   └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                 POST /append_log                         │   │
│   │            (persist events to backend)                   │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Methods

- `start()` — Connect SSE, initialize ACP, resume from previous state, process initial prompt
- `stop()` — Capture final tree state, cleanup connections
- `handleUserMessage()` — Process user prompt via `clientConnection.prompt()`
- `captureTreeState()` — Capture and emit `_posthog/tree_snapshot` events

### Dependencies

- `@posthog/agent` — Core agent SDK (createAcpConnection, TreeTracker, resumeFromLog)
- `@agentclientprotocol/sdk` — ACP protocol (ClientSideConnection)

### Message Types

- `user_message` — New prompt or response to question
- `cancel` — Stop current operation
- `stop` — Shut down agent (writes final tree, then exits)

**How commands reach the agent:** On startup, the agent server opens an outbound SSE connection to the backend (`GET /sync`). When a client sends a command via `POST /sync`, the backend routes it through Redis pub/sub to all connected SSE streams for that run. This bypasses Temporal for real-time operations, giving low-latency interactive feel.

### Agent Resume API

The agent-server uses `resumeFromLog` from `@posthog/agent` to restore state:

```typescript
// In agent-server/src/agent-server.ts
private async resumeFromPreviousState(): Promise<void> {
  const resumeState = await resumeFromLog({
    taskId,
    runId,
    repositoryPath,
    apiClient,  // PostHogAPIClient fetches logs from backend
    logger,
  })

  if (resumeState.latestSnapshot) {
    // Set tree tracker to continue from last known state
    this.treeTracker.setLastTreeHash(resumeState.latestSnapshot.treeHash)
  }
}
```

The `resumeFromLog` function:
1. Fetches task run logs from the backend API (which reads from S3)
2. Parses NDJSON entries to find latest `_posthog/tree_snapshot`
3. Returns the resume state including latest snapshot and interrupted flag

**Stop implementation:**

```typescript
async stop(): Promise<void> {
  // 1. Capture final tree state via POST /append_log
  await this.captureTreeState({ interrupted: true, force: true })

  // 2. Clean up ACP connection
  if (this.acpConnection) {
    await this.acpConnection.cleanup()
  }

  // 3. Close SSE connection
  this.sseAbortController?.abort()
}
```

### Temporal Workflow

Temporal handles **lifecycle only**, not message routing:

```python
@workflow.defn
class CloudSessionWorkflow:

    @workflow.signal
    def stop(self):
        self.should_stop = True

    @workflow.run
    async def run(self, input: SessionInput):
        # Always provision fresh - resume logic is in the agent
        sandbox_id = await provision_sandbox(input)

        # Agent handles resume(task_id) internally if resuming
        await start_agent_server(sandbox_id, task_id=input.task_id)

        while not self.should_stop:
            try:
                await workflow.wait_condition(
                    lambda: self.should_stop,
                    timeout=timedelta(minutes=10)
                )
            except asyncio.TimeoutError:
                # Inactivity timeout - agent writes final tree on stop
                break

        # Tell agent to stop (it will write final tree)
        await stop_agent(sandbox_id)
        await cleanup_sandbox(sandbox_id)
```

**Key behaviors:**

- Temporal provisions sandbox and handles cleanup
- Messages/commands go directly via SSE (not through Temporal)
- Agent handles resume internally (reads state from backend API → S3 logs)
- 10-min inactivity triggers stop
- Agent always writes tree on stop → always resumable

---

## Twig Integration

In Twig, the `AgentService` (main process) talks to agents through a provider interface. For cloud mode, we swap the provider without changing the rest of the app.

```
Renderer ──tRPC──► AgentService ──► SessionProvider
                                        │
                          ┌─────────────┴─────────────┐
                          │                           │
                          ▼                           ▼
                  LocalProvider               CloudProvider
                  (in-process SDK)            (SSE to backend)
```

**The provider interface** (simplified):

```typescript
interface SessionProvider {
  readonly capabilities: SessionCapabilities
  readonly executionEnvironment: "local" | "cloud"

  connect(config: SessionConfig): Promise<void>
  disconnect(): Promise<void>
  prompt(blocks: ContentBlock[]): Promise<{ stopReason: string }>
  cancelPrompt(): Promise<boolean>

  onEvent(handler: (event: AcpMessage) => void): void
}
```

**Key files:**

Array packages:
- `packages/agent/` — Core agent SDK (createAcpConnection, TreeTracker, CloudConnection, resumeFromLog)
- `packages/agent-server/` — Cloud sandbox runner (@posthog/agent-server CLI)
- `packages/core/` — Shared business logic for jj/GitHub operations

Twig app:
- `apps/twig/src/main/services/agent/service.ts` — AgentService, picks provider type
- `apps/twig/src/main/services/agent/providers/local-provider.ts` — Local ACP/SDK logic
- `apps/twig/src/main/services/agent/providers/cloud-provider.ts` — Cloud SSE logic (uses CloudConnection)

PostHog backend (not in this repo):
- `products/tasks/backend/api.py` — Sync and append_log endpoints
- `products/tasks/backend/sync/router.py` — Redis pub/sub for real-time routing
- `products/tasks/temporal/process_task/` — Temporal workflow for sandbox lifecycle

---

## Communication Protocol

### Streamable HTTP

Following [MCP's pattern](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http):

- **POST** — Client sends messages (user input, cancel, stop)
- **GET** — Client opens SSE stream for server events
- **Session-Id header** — Identifies the session (run ID)
- **Last-Event-ID header** — Resume from where you left off

### Endpoint

```
/api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
```

### Sending Messages (POST)

```http
POST /sync
Content-Type: application/json
Session-Id: {run_id}

{
  "jsonrpc": "2.0",
  "method": "_posthog/user_message",
  "params": { "content": "Please fix the auth bug" }
}
```

Response: `202 Accepted`

### Receiving Events (GET)

```http
GET /sync
Accept: text/event-stream
Session-Id: {run_id}
Last-Event-ID: 123
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 124
data: {"jsonrpc":"2.0","method":"_posthog/tree_snapshot","params":{"tree_hash":"abc123","base_commit":"def456","files_changed":["src/auth.py"]}}

id: 125
data: {"jsonrpc":"2.0","method":"agent_message_chunk","params":{"text":"I found the issue..."}}
```

**Event replay:** When `Last-Event-ID` is provided, backend replays missed events from storage, then continues with live events.

### Why SSE + Kafka + ClickHouse?

- **Kafka** — Real-time event streaming, handles multiple consumers
- **ClickHouse** — Efficient event replay and queries, persistent storage
- **SSE** — Works with load balancing, built-in resumability via `Last-Event-ID`
- No WebSocket state to manage across pods

The backend handles all storage concerns. The agent and clients only interact via HTTP endpoints (`/sync` and `/append_log`).

---

## Client Modes

### Interactive (Connected)

```
Client                          Backend                         Sandbox
  │                                │                               │
  │── GET /sync (SSE) ────────────►│◄── GET /sync (SSE) ───────────│
  │                                │                               │
  │◄── tree_snapshot ──────────────│◄── POST /append_log ──────────│
  │◄── agent_message ──────────────│◄── POST /append_log ──────────│
  │                                │                               │
  │── POST /sync {message} ───────►│── (via Redis pub/sub) ───────►│
  │◄── 202 Accepted ───────────────│                               │
```

### Background (Disconnected)

```
                                Backend                         Sandbox
                                   │                               │
                                   │◄── agent keeps working ───────│
                                   │◄── POST /append_log ──────────│
                                   │         │                     │
                                   │         ▼                     │
                                   │    ClickHouse (events)        │
                                   │    S3 (tree archives)         │
                                   │                               │
                                   │    (no client connected)      │
```

Agent continues autonomously. Events persist to ClickHouse via `append_log` API.

### Resume (Reconnect)

```
Client                          Backend
  │                                │
  │── GET /sync ──────────────────►│
  │   Last-Event-ID: 50            │
  │                                │── Query ClickHouse (id > 50)
  │◄── id:51 (from ClickHouse) ────│  Replay missed events
  │◄── id:52 ──────────────────────│
  │◄── ... ────────────────────────│
  │◄── id:100 (live from Kafka) ───│  Switch to live stream
```

Client catches up from ClickHouse, then receives live events via Kafka.

---

## Event Format

JSON-RPC 2.0 notifications with device metadata:

```typescript
{
  "jsonrpc": "2.0",
  "method": "_posthog/tree_snapshot",
  "params": {
    "tree_hash": "abc123def456",
    "base_commit": "789xyz",
    "files_changed": ["src/auth.py", "src/utils.py"],
    "archive_url": "s3://bucket/trees/abc123def456.tar.gz"
  },
  "device": {
    "id": "device_abc123",
    "type": "local" | "cloud",
    "name": "James's MacBook Pro"  // optional, for display
  }
}
```

The `device` field on every event lets the log naturally show where work happened—no special lifecycle events needed.

### Event Types

**State tracking:**

- `_posthog/tree_snapshot` — Working tree captured (includes tree_hash, base_commit, files list)
- `_posthog/git_commit` — Agent committed changes

**Agent interaction:**

- `agent_message_chunk` — Agent output
- `_posthog/agent_question` — Agent asking user
- `_posthog/user_message` — User input
- `tool_call` / `tool_result` — Tool usage

**Mode:**

- `_posthog/mode_change` — Switched between interactive/background (background disables questions)

**Control:**

- `_posthog/cancel` — Cancel current operation
- `_posthog/error` — Something went wrong (includes error details)

---

## References

- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Agent Client Protocol (ACP)](https://github.com/anthropics/acp)
- [Temporal Signals](https://docs.temporal.io/workflows#signal)
- [ClickHouse Documentation](https://clickhouse.com/docs)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
