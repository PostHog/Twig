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
                                   │ Streamable HTTP (/sync)
                                   │ POST (commands) + GET (SSE events)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTHOG BACKEND                                  │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      /sync Endpoint                              │   │
│   │                                                                  │   │
│   │   POST /sync ──► Kafka ──┬──► SSE consumers (GET /sync)          │   │
│   │                          └──► DynamoDB consumer (persistence)    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │    Temporal     │    │     Kafka       │    │   Storage       │    │
│   │    Workflow     │    │   (event bus)   │    │  - DynamoDB     │    │
│   │  (lifecycle)    │    │                 │    │  - S3 (trees)   │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│          │                                                              │
└──────────┼──────────────────────────────────────────────────────────────┘
           │ provision_sandbox
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SANDBOX (Docker/Modal)                                │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                   @posthog/agent/server                          │   │
│   │                                                                  │   │
│   │   GET /sync  ◄── receives commands (user_message, cancel, stop)  │   │
│   │   POST /sync ──► emits events (agent_message, tool_call, etc.)   │   │
│   │                                                                  │   │
│   │   + ACP connection to Claude CLI subprocess                      │   │
│   │   + TreeTracker for capturing file state → POST /sync → S3       │   │
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

1. Client or Agent POSTs event to `/sync`
2. Backend publishes to Kafka
3. Kafka consumers:
   - SSE consumers stream to connected clients (GET /sync)
   - DynamoDB consumer persists events
4. For tree snapshots: Backend also uploads archive to S3

**Bidirectional /sync:** Both clients and agent use the same endpoint pattern:

- **Clients:** POST commands (user_message, cancel) → GET events (agent responses)
- **Agent:** GET commands (user_message, cancel) → POST events (agent_message, tool_call, tree_snapshot)

**Key insight:** Kafka is the event bus. All events flow through it. DynamoDB is just a consumer that persists for replay/resume. S3 stores tree archives (large binary snapshots).

---

## Storage Architecture

### Events → Kafka → Consumers

All events flow through Kafka as the central event bus:

```
POST /sync ──► Backend ──► Kafka ──┬──► DynamoDB consumer (persistence)
                                   └──► SSE consumers (real-time to clients)
```

**Why Kafka as the event bus:**

- Decouples producers from consumers
- Multiple consumers can read independently (SSE, DynamoDB, analytics, etc.)
- Replay capability if a consumer falls behind
- Handles backpressure gracefully

**Why agents/clients don't write directly to Kafka:**

- Simpler implementation (just HTTP calls to /sync)
- Backend can add metadata, validate, rate-limit
- Single source of truth for event routing logic
- No Kafka credentials needed in sandbox

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

### DynamoDB Schema

**Table: `agent_events`**

| Key                   | Type   | Description                                        |
| --------------------- | ------ | -------------------------------------------------- |
| `pk` (Partition Key)  | String | `{task_id}#{run_id}` - groups all events for a run |
| `event_id` (Sort Key) | Number | Backend-assigned via internal counter per run. Stringified for SSE `id:` field. |

**Event ID assignment:** The backend maintains an internal counter per `{task_id}#{run_id}` partition. This counter is incremented on each event received via POST /sync. The numeric ID is converted to a string for the SSE wire format (spec requires strings). When clients reconnect, they send `Last-Event-ID: "123"` which the backend parses back to a number for DynamoDB range queries.

**Attributes:**

| Attribute   | Type              | Description                                 |
| ----------- | ----------------- | ------------------------------------------- |
| `version`   | Number            | Schema version (always 1 for now)           |
| `timestamp` | String (ISO 8601) | When the event occurred                     |
| `method`    | String            | Event type (e.g., `_posthog/tree_snapshot`) |
| `params`    | Map               | Event-specific parameters                   |

Team/user context comes from the task lookup in Postgres—no need to duplicate here. Note: Postgres is part of the existing PostHog infrastructure where task metadata lives; DynamoDB is specifically for the event stream storage.

**Example event:**

```json
{
  "pk": "task_123#run_456",
  "event_id": 42,
  "version": 1,
  "timestamp": "2025-01-29T12:00:00Z",
  "method": "_posthog/tree_snapshot",
  "params": {
    "treeHash": "abc123",
    "baseCommit": "def456",
    "device": { "id": "dev_1", "type": "local", "name": "MacBook Pro" }
  }
}
```

**Access Patterns:**

| Pattern                      | Operation | Key Condition                                                |
| ---------------------------- | --------- | ------------------------------------------------------------ |
| Append event                 | `PutItem` | `pk={task_id}#{run_id}`                                      |
| Get all events for run       | `Query`   | `pk={task_id}#{run_id}`                                      |
| Get events after ID (resume) | `Query`   | `pk={task_id}#{run_id}`, `event_id > {last_event_id}`        |
| Get recent events (reverse)  | `Query`   | `pk={task_id}#{run_id}`, `ScanIndexForward=false`, `Limit=N` |
| Get latest by method         | `Query`   | `pk={task_id}#{run_id}`, `ScanIndexForward=false`, FilterExpression on `method` |

**No GSI needed:** Task/run lookups happen in Postgres first, then DynamoDB is queried by the specific `pk`. No need to query DynamoDB across tasks.

**Why DynamoDB:**

- Serverless, scales automatically with demand
- Single-digit millisecond latency for key-value access
- Cost-effective for append-heavy workloads
- Simple key design matches access pattern perfectly

**Retention:** Events are kept permanently (conversation history). Only S3 tree archives have TTL (30 days) since they're large and recoverable from git commits.

**Capacity:** On-demand mode recommended. Typical task run generates ~100-1000 events.

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
       └──► POST /sync with _posthog/tree_snapshot event
                    │
                    ▼
            Backend handles:
                    ├──► PUT to S3: trees/{tree_hash}.tar.gz (archive only)
                    └──► Kafka ──┬──► DynamoDB consumer (persistence)
                                 └──► SSE consumers (real-time to clients)
```

### When Trees Are Captured

- After each git commit
- After significant tool completions (file writes, bash commands)
- On stop (final tree before shutdown)
- Periodically (every N minutes of activity)

---

## Resume & State

Since tree snapshots are captured continuously via POST /sync, we can resume from any point. There's no special "pause" operation—state just exists.

### State = Task + Tree

Everything needed to resume is in DynamoDB (events) and S3 (tree archives):

```typescript
// From the latest tree_snapshot event in DynamoDB
interface ResumeState {
  taskId: string;
  baseCommit: string; // Git commit the tree is based on
  treeHash: string; // The diff-tree reference
  treeUrl: string; // S3 location of tree archive
}
```

To resume a task anywhere:

1. Find task by `taskId`
2. Query DynamoDB for task run events via backend API
3. Find latest `tree_snapshot` event with `baseCommit` + `treeHash` + `treeUrl`
4. Download tree archive from S3
5. Restore from there

### Resume Flow

```
resumeFromLog(taskId, runId) called
       │
       ├──► Fetch events from backend API (queries DynamoDB)
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
    │    POST /sync)             │                                  │
    │                            │                                  │
    │── startCloud(task_id) ────►│                                  │
    │                            │── provision sandbox ────────────►│
    │                            │── start AgentServer ────────────►│
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
    │    POST /sync)             │                                  │
    │── shutdown ────────────────│                                  │
    │                            │                                  │
    │                            │◄── pullToLocal(task_id) ─────────│
    │                            │                                  │── resumeFromLog()
    │                            │                                  │── restore from DynamoDB logs + S3 trees
    │                            │                                  │── continue locally
```

**Resume later (any environment):**

```
... time passes ...
    │
    │── resumeFromLog(task_id) ──────► query DynamoDB, restore tree from S3
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

### Events in DynamoDB = Recovery

Recovery is just `resumeFromLog(taskId, runId)`. DynamoDB has all events:

```
DynamoDB Events (pk = {task_id}#{run_id}):

  { method: "_posthog/git_commit", params: { sha: "abc123", device: { id: "dev_1", type: "local" } } }
  { method: "_posthog/tree_snapshot", params: { treeHash: "def456", baseCommit: "abc123", device: { id: "dev_1", type: "local" }, ... } }
  { method: "_posthog/user_message", params: { content: "..." } }
  { method: "agent_message_chunk", params: { text: "..." } }
  -- handoff to cloud --
  { method: "_posthog/git_commit", params: { sha: "ghi789", device: { id: "sandbox_x", type: "cloud" } } }
  { method: "_posthog/tree_snapshot", params: { treeHash: "jkl012", device: { id: "sandbox_x", type: "cloud" }, ... } }
```

Device info is embedded in `params` for events that track it (snapshots, commits). Standard ACP events like `agent_message_chunk` don't need device tracking. Device changes are visible naturally in the event stream—no explicit handoff events needed.

**To resume:** Query DynamoDB for latest `tree_snapshot` (query in reverse order, filter by method), download archive from S3, restore from it.

**If tree expired in S3:** Fall back to latest `git_commit` (loses uncommitted work).

### Trees vs Commits

| Mechanism     | When                            | What's captured            | Durability                   |
| ------------- | ------------------------------- | -------------------------- | ---------------------------- |
| Tree snapshot | After tool completions, on stop | Working tree (uncommitted) | 30 days in S3                |
| Git commit    | On significant changes          | Committed files            | Permanent (pushed to remote) |

**Best practice:** Agent commits frequently so that even if trees expire, minimal work is lost.

### Data Retention

| Data          | Storage     | Retention | Recovery                                 |
| ------------- | ----------- | --------- | ---------------------------------------- |
| Git commits   | Remote repo | Permanent | Always recoverable (committed work only) |
| Tree archives | S3          | 30 days   | Full state including uncommitted         |
| Event history | DynamoDB    | Permanent | Conversation + history                   |

---

## Agent Architecture

### The AgentServer (in @posthog/agent)

The agent server runs in cloud sandboxes (Docker/Modal). It lives in the `@posthog/agent` package:

```
packages/agent/src/server/
├── agent-server.ts   # Main AgentServer class
├── index.ts          # CLI entry point + exports
└── types.ts          # AgentServerConfig, DeviceInfo, TreeSnapshot
```

Exported via `@posthog/agent/server` subpath.

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
│   │                       POST /sync                        │   │
│   │               (persist events to backend)               │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Methods

- `start()` — Connect SSE, initialize ACP, resume from previous state, process initial prompt
- `stop()` — Capture final tree state, cleanup connections
- `handleUserMessage()` — Process user prompt via `clientConnection.prompt()`
- `captureTreeState()` — Capture and emit `_posthog/tree_snapshot` events

### Dependencies

- Internal modules: TreeTracker, resumeFromLog, CloudConnection
- `@agentclientprotocol/sdk` — ACP protocol (ClientSideConnection)

### Message Types

- `user_message` — New prompt or response to question
- `cancel` — Stop current operation
- `stop` — Shut down agent (writes final tree, then exits)

**How commands reach the agent:** On startup, the agent server opens an outbound SSE connection to the backend (`GET /sync`). When a client sends a command via `POST /sync`, the backend publishes to Kafka. The agent's SSE consumer receives commands from Kafka, giving low-latency interactive feel.

### Agent Resume API

The AgentServer uses `resumeFromLog` to restore state:

```typescript
// In packages/agent/src/server/agent-server.ts
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

1. Fetches task run logs from the backend API (which reads from DynamoDB)
2. Parses NDJSON entries to find latest `_posthog/tree_snapshot`
3. Returns the resume state including latest snapshot and interrupted flag

**Stop implementation:**

```typescript
async stop(): Promise<void> {
  // 1. Capture final tree state via POST /sync
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
- Messages/commands flow through Kafka to the agent's SSE connection (not through Temporal)
- Agent handles resume internally (reads state from backend API → DynamoDB logs + S3 trees)
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
  readonly capabilities: SessionCapabilities;
  readonly executionEnvironment: "local" | "cloud";

  connect(config: SessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  prompt(blocks: ContentBlock[]): Promise<{ stopReason: string }>;
  cancelPrompt(): Promise<boolean>;

  onEvent(handler: (event: AcpMessage) => void): void;
}
```

**Key files:**

Array packages:

- `packages/agent/` — Core agent SDK (createAcpConnection, TreeTracker, CloudConnection, resumeFromLog)
- `packages/agent/src/server/` — Cloud sandbox runner (AgentServer class, exported via `@posthog/agent/server`)
- `packages/core/` — Shared business logic for jj/GitHub operations

Twig app:

- `apps/twig/src/main/services/agent/service.ts` — AgentService, picks provider type
- `apps/twig/src/main/services/agent/providers/local-provider.ts` — Local ACP/SDK logic
- `apps/twig/src/main/services/agent/providers/cloud-provider.ts` — Cloud SSE logic (uses CloudConnection)

PostHog backend (not in this repo):

- `products/tasks/backend/api.py` — /sync endpoint (POST + SSE)
- `products/tasks/backend/sync/router.py` — Kafka event routing
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
data: {"jsonrpc":"2.0","method":"_posthog/tree_snapshot","params":{"treeHash":"abc123","baseCommit":"def456","filesChanged":["src/auth.py"]}}

id: 125
data: {"jsonrpc":"2.0","method":"agent_message_chunk","params":{"text":"I found the issue..."}}
```

**Event replay:** When `Last-Event-ID` is provided, backend replays missed events from storage, then continues with live events.

### Why SSE + Kafka + DynamoDB?

- **Kafka** — Real-time event streaming, handles multiple consumers
- **DynamoDB** — Low-latency event storage with efficient key-based queries
- **SSE** — Works with load balancing, built-in resumability via `Last-Event-ID`
- No WebSocket state to manage across pods

The backend handles all storage concerns. The agent and clients only interact via the `/sync` endpoint (POST to send, GET for SSE).

---

## Client Modes

### Interactive (Connected)

```
Client                          Backend                         Sandbox
  │                                │                               │
  │── GET /sync (SSE) ────────────►│◄── GET /sync (SSE) ───────────│
  │                                │                               │
  │◄── tree_snapshot ──────────────│◄── POST /sync ───────────────│
  │◄── agent_message ──────────────│◄── POST /sync ───────────────│
  │                                │                               │
  │── POST /sync {message} ───────►│── (via Kafka) ───────────────►│
  │◄── 202 Accepted ───────────────│                               │
```

### Background (Disconnected)

```
                                Backend                         Sandbox
                                   │                               │
                                   │◄── agent keeps working ───────│
                                   │◄── POST /sync ───────────────│
                                   │         │                     │
                                   │         ▼                     │
                                   │    DynamoDB (events)          │
                                   │    S3 (tree archives)         │
                                   │                               │
                                   │    (no client connected)      │
```

Agent continues autonomously. Events persist to DynamoDB via POST /sync → Kafka → DynamoDB consumer.

### Resume (Reconnect)

```
Client                          Backend
  │                                │
  │── GET /sync ──────────────────►│
  │   Last-Event-ID: 50            │
  │                                │── Query DynamoDB (event_id > 50)
  │◄── id:51 (from DynamoDB) ──────│  Replay missed events
  │◄── id:52 ──────────────────────│
  │◄── ... ────────────────────────│
  │◄── id:100 (live from Kafka) ───│  Switch to live stream
```

Client catches up from DynamoDB, then receives live events via Kafka.

---

## Event Format

We will use the standard ACP format being used already. Some key events we will need here are:

**State tracking:**

- `_posthog/tree_snapshot` — Working tree captured (includes treeHash, baseCommit, files list)
- `_posthog/git_commit` — Agent committed changes

**Mode:**

- `_posthog/mode_change` — Switched between interactive/background (background disables questions)

---

## References

- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Agent Client Protocol (ACP)](https://github.com/anthropics/acp)
- [Temporal Signals](https://docs.temporal.io/workflows#signal)
- [DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
