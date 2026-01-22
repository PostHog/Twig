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
│                              BACKEND                                     │
│                                                                          │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │   Sync API      │    │    Temporal     │    │   Storage       │    │
│   │   (FastAPI)     │◄──►│    Workflow     │◄──►│                 │    │
│   └─────────────────┘    └─────────────────┘    │  - ClickHouse   │    │
│          │                                      │    (events)     │    │
│          │                                      │  - S3 (trees)   │    │
│          ▼                                      └─────────────────┘    │
│   ┌─────────────────┐                                                  │
│   │     Kafka       │◄── Event streaming                               │
│   │   (real-time)   │                                                  │
│   └─────────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                         ▲                              │
                         │ SSE (events)                 │ SSE (commands)
                         │                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              SANDBOX                                     │
│                                                                          │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │   Agent Server  │◄──►│  Tree Tracker   │───►│   S3 Upload     │    │
│   │   (message loop)│    │  (diff-tree)    │    │   (trees only)  │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│           │                      │                                      │
│           │                      └───► Kafka (events)                   │
│           └──────────────► Git Repository ◄─────────────────────────────│
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Agent writes files in sandbox
2. Tree tracker periodically computes `git diff-tree` since last snapshot
3. Trees (not individual files) are uploaded to S3
4. All events (including tree snapshots) stream to Kafka → ClickHouse for persistence
5. Clients receive real-time events via SSE (backed by Kafka)
6. On handoff: client restores full state from latest tree + ClickHouse event history

**Key insight:** Git trees are the source of truth for file state. ClickHouse is the source of truth for what happened (event log). Kafka provides real-time streaming. No real-time file sync—state transfer happens via `resume(task_id)`.

---

## Storage Architecture

### Events → Kafka → ClickHouse

Agent events flow through Kafka for real-time delivery and are persisted to ClickHouse for querying and replay:

```
Agent ──► Kafka Topic ──► ClickHouse Table
              │
              └──► SSE Stream to Clients (real-time)
```

**Benefits of ClickHouse:**

- Sub-second queries on event history
- Efficient storage for JSONL-style event data
- Native support for time-series queries (replay from timestamp, Last-Event-ID)
- Scales with PostHog's existing infrastructure

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
Tree tracker detects significant change
(commit, tool completion, or periodic)
       │
       ├──► git write-tree (capture current state)
       │
       ├──► git diff-tree (compare to last snapshot)
       │
       ├──► Pack changed files into tree archive
       │
       ├──► PUT to S3: trees/{tree_hash}.tar.gz
       │
       └──► Emit event to Kafka: { tree_hash, base_commit, files_changed }
                    │
                    ├──► Kafka → ClickHouse (persistence)
                    │
                    └──► Kafka → SSE stream to clients (real-time)
```

### When Trees Are Captured

- After each git commit
- After significant tool completions (file writes, bash commands)
- On stop (final tree before shutdown)
- Periodically (every N minutes of activity)

---

## Resume & State

Since tree snapshots are captured continuously into ClickHouse, we can resume from any point. There's no special "pause" operation—state just exists.

### State = Task + Tree

Everything needed to resume is in ClickHouse:

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
2. Query ClickHouse for latest `tree_snapshot` event
3. That contains `base_commit` + `tree_hash` + `tree_url`
4. Restore from there

### Resume Flow

```
resume(task_id) called
       │
       ├──► Query ClickHouse for task_id events
       │
       ├──► Find latest tree_snapshot event
       │
       ├──► Clone/fetch repo to base_commit
       │
       ├──► Download tree archive from S3 tree_url
       │
       ├──► Apply tree on top of base_commit
       │
       └──► Start agent with conversation from ClickHouse
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
    │   (tree snapshot to        │                                  │
    │    Kafka → ClickHouse)     │                                  │
    │                            │                                  │
    │── startCloud(task_id) ────►│                                  │
    │                            │── provision sandbox ────────────►│
    │                            │── resume(task_id) ──────────────►│
    │                            │                                  │── restore from ClickHouse
    │                            │◄── ready ────────────────────────│
    │◄── connected ──────────────│                                  │
```

**Cloud → Local:**

```
Cloud Sandbox                  Backend                         Local Twig
    │                            │                                  │
    │── stop() ─────────────────►│                                  │
    │   (final tree to Kafka)    │                                  │
    │── shutdown ────────────────│                                  │
    │                            │                                  │
    │                            │◄── pullToLocal(task_id) ─────────│
    │                            │                                  │── resume(task_id)
    │                            │                                  │── restore from ClickHouse
    │                            │                                  │── continue locally
```

**Resume later (any environment):**

```
... time passes ...
    │
    │── resume(task_id) ──────► restore from latest tree in ClickHouse
    │── continue working
```

### Robustness Requirements

Resume must handle:

1. **Partial uploads** — Tree upload must complete before stop confirms
2. **Large repos** — Stream tree archives, don't load in memory
3. **Network failures** — Retry with exponential backoff
4. **Conversation replay** — Rebuild conversation from ClickHouse events
5. **Concurrent access** — Prevent two environments from running same task simultaneously

---

## State & Recovery

### Events in ClickHouse = Recovery

Recovery is just `resume(task_id)`. ClickHouse has everything:

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

**To resume:** Query ClickHouse for latest `tree_snapshot`, restore from it, replay conversation.

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

### Server Mode

The agent runs in a message loop rather than single execution:

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT SERVER                              │
│                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Message    │    │   Control   │    │   Event     │        │
│   │  Queue      │    │   Queue     │    │   Emitter   │        │
│   │  (input)    │    │  (signals)  │    │  (output)   │        │
│   └──────┬──────┘    └──────┬──────┘    └──────▲──────┘        │
│          │                  │                  │                │
│          └──────────────────┼──────────────────┘                │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │                 │                          │
│                    │   Agent Loop    │                          │
│                    │                 │                          │
│                    │  - Process msg  │                          │
│                    │  - Run tools    │                          │
│                    │  - Emit events  │ ──► Kafka                │
│                    │  - Ask questions│                          │
│                    │                 │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

**Message types:**

- `user_message` — New prompt or response to question
- `cancel` — Stop current operation
- `stop` — Shut down agent (writes final tree, then exits)

**How commands reach the agent:** On startup, the agent opens an outbound SSE connection to the backend. Client commands (prompts, cancel, mode switch) are pushed directly through this connection to give as close to a local experience for latency as possible. This bypasses Temporal for real-time operations.

### Agent Resume API

The agent exposes `resume` and `stop` as the core lifecycle operations:

```typescript
interface Agent {
  // Resume from a task's latest state (reads from ClickHouse)
  resume(taskId: string): Promise<void>

  // Stop agent, ensuring final tree is written
  stop(): Promise<void>
}
```

**Resume implementation:**

```typescript
async resume(taskId: string): Promise<void> {
  // 1. Query ClickHouse for events
  const events = await this.queryEvents(taskId)

  // 2. Find latest tree snapshot
  const treeEvent = events.findLast(e => e.method === "_posthog/tree_snapshot")
  if (!treeEvent) {
    throw new Error("No tree snapshot found")
  }

  const { base_commit, tree_hash, tree_url } = treeEvent.params

  // 3. Checkout base commit
  await git.fetch()
  await git.checkout(base_commit)

  // 4. Download and apply tree from S3
  const archive = await this.downloadTreeArchive(tree_url)
  await this.applyTreeArchive(archive)

  // 5. Rebuild conversation from events
  const conversation = this.rebuildConversationFromEvents(events)
  this.loadConversation(conversation)

  // 6. Ready to continue
  this.emit("resumed", { taskId })
}
```

**Stop implementation:**

```typescript
async stop(): Promise<void> {
  // 1. Wait for safe point (not mid-tool-execution)
  await this.waitForSafePoint()

  // 2. Capture final tree snapshot (→ S3 + Kafka)
  await this.captureTreeSnapshot()

  // 3. Clean shutdown
  this.emit("stopped")
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
- Agent handles resume internally (reads state from ClickHouse)
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

- `apps/twig/src/main/services/agent/service.ts` — AgentService, picks provider type
- `apps/twig/src/main/services/agent/providers/local-provider.ts` — Local ACP/SDK logic
- `apps/twig/src/main/services/agent/providers/cloud-provider.ts` — Cloud SSE logic

---

## Communication Protocol

### Streamable HTTP

Following [MCP's pattern](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http):

- **POST** — Client sends messages (user input, cancel, stop)
- **GET** — Client opens SSE stream for server events
- **Session-Id header** — Identifies the session (run ID)
- **Last-Event-ID header** — Resume from where you left off (maps to ClickHouse event_id)

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

**Event replay:** When `Last-Event-ID` is provided, backend queries ClickHouse for events with `event_id > Last-Event-ID`, replays those, then switches to live Kafka stream.

### Why SSE + Kafka + ClickHouse?

- **Kafka** — Real-time event streaming, handles multiple consumers
- **ClickHouse** — Efficient event replay, sub-second queries
- **SSE** — Works with load balancing, built-in resumability via `Last-Event-ID`
- No WebSocket state to manage across pods

---

## Client Modes

### Interactive (Connected)

```
Client                          Backend                         Sandbox
  │                                │                               │
  │── GET /sync (SSE) ────────────►│                               │
  │                                │◄── Kafka subscription         │
  │                                │                               │
  │◄── tree_snapshot ──────────────│◄── tree captured (Kafka) ─────│
  │◄── agent_message ──────────────│◄── agent output (Kafka) ──────│
  │                                │                               │
  │── POST /sync {message} ───────►│── push via SSE ──────────────►│
  │◄── 202 Accepted ───────────────│                               │
```

### Background (Disconnected)

```
                                Backend                         Sandbox
                                   │                               │
                                   │◄── agent keeps working ───────│
                                   │◄── events to Kafka ───────────│
                                   │         │                     │
                                   │         ▼                     │
                                   │    ClickHouse (persisted)     │
                                   │                               │
                                   │    (no client connected)      │
```

Agent continues autonomously. Events persist to ClickHouse via Kafka.

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

Client catches up instantly from ClickHouse, then receives live events from Kafka.

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
- [Temporal Signals](https://docs.temporal.io/workflows#signal)
- [ClickHouse Documentation](https://clickhouse.com/docs)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
