# Cloud Mode Architecture

## The Challenge

Cloud coding agents face a fundamental tension: you want them to feel like your laptop, but they're not. You want the experience of running locally—real-time feedback, files on your disk, your IDE, full control—but the convenience of interacting from your phone or Slack while you're away.

This creates two distinct experiences:

**Interactive Mode** — "I'm watching"

- Real-time feedback as the agent works
- Files sync to your local machine instantly
- You can interrupt, redirect, answer questions
- Feels like pair programming

**Background Mode** — "Wake me when it's done"

- Agent works autonomously
- You check in when you're ready
- Review changes, pull them locally, continue
- Feels like delegating to a colleague

Most cloud agent implementations force you to choose one or the other. The goal here is to support both seamlessly—and let you switch between them without friction.

### Key Goals

1. **Local-first feel** — Edit in Twig or your IDE, changes sync automatically
2. **Survive disconnection** — Close your laptop, agent keeps working
3. **Seamless resume** — Reconnect and catch up instantly
4. **Multiple clients** — Laptop, phone, Slack, API—all work
5. **Simple recovery** — If sandbox dies, state is recoverable

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
│   │   Sync API      │    │    Temporal     │    │   S3 Storage    │    │
│   │   (FastAPI)     │◄──►│    Workflow     │◄──►│                 │    │
│   └─────────────────┘    └─────────────────┘    │  - Event logs   │    │
│                                                 │  - File content │    │
│                                                 └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                         ▲                              │
                         │ SSE (events)                 │ SSE (commands)
                         │                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              SANDBOX                                     │
│                                                                          │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │   Agent Server  │◄──►│  File Watcher   │───►│   S3 Upload     │    │
│   │   (message loop)│    │                 │    │   (by hash)     │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│           │                                                              │
│           └──────────────► Git Repository ◄─────────────────────────────│
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Agent writes files in sandbox
2. File watcher uploads content to S3 (by hash) and emits events
3. Events flow to clients via SSE stream
4. Clients fetch file content from S3 and write locally
5. Local edits reverse the flow: upload to S3, notify sandbox

**Key insight:** S3 is the source of truth for file content. The event log is the source of truth for what happened. Git commits are used as durable checkpoints.

---

## File Synchronization

### Content-Addressed Storage

Files are stored in S3 by hash. Events contain only metadata (path + hash), not content which may be very large.

```
S3 Structure:
  files/
    sha256_abc123...  → file content (any file with this hash)
    sha256_def456...  → file content (deduplicated)

  logs/
    run_{id}.jsonl    → event log
```

**Benefits:**

- Deduplication (same content = same hash = stored once)
- Multiple clients fetch from S3 (don't need sandbox to be alive)
- Files survive sandbox death
- Cache indefinitely (content never changes for a given hash)

### Sandbox → Client Flow

```
Agent writes file
       │
       ▼
File watcher detects change
       │
       ├──► Hash content (sha256)
       │
       ├──► PUT to S3: files/{hash}
       │
       └──► Emit event: { path, hash, action }
                    │
                    ▼
            Event log (S3) ───► SSE stream to clients
                                        │
                                        ▼
                               Client receives event
                                        │
                                        ├──► GET from S3: files/{hash}
                                        │
                                        └──► Write to local filesystem
```

### Client → Sandbox Flow (Local Edits)

```
User edits file locally
       │
       ▼
Local file watcher detects change
       │
       ├──► Hash content (sha256)
       │
       ├──► PUT to S3: files/{hash}
       │
       └──► POST event: { path, hash, action }
                    │
                    ▼
            Backend pushes to agent via SSE
                    │
                    ▼
            Agent fetches from S3, overwrites file
                    │
                    ▼
            Agent sees file changed, adapts
```

### Conflict Resolution: Local Wins

No merge logic. When user edits locally:

1. Content goes to S3
2. Sandbox is notified
3. Sandbox overwrites its version
4. Agent notices and adapts

The agent will be able to handle situations where a local change overwrites it's own change gracefully.

---

## State & Recovery

### The Event Log is the source of truth

No separate checkpointing mechanism. The combination of:

- Event log (what happened)
- S3 content-addressed files (file contents by hash)
- Git commits (durable snapshots)

...gives us everything needed to recover.

```
Event Log (run_{id}.jsonl):

  { method: "_posthog/git_commit", params: { sha: "abc123" } }
  { method: "_posthog/file_change", params: { path: "src/foo.py", hash: "sha256_aaa" } }
  { method: "_posthog/file_change", params: { path: "src/bar.py", hash: "sha256_bbb" } }
  { method: "_posthog/git_commit", params: { sha: "def456" } }        ◄── latest commit
  { method: "_posthog/file_change", params: { path: "src/foo.py", hash: "sha256_ccc" } }
  { method: "_posthog/file_change", params: { path: "src/baz.py", hash: "sha256_ddd" } }
```

**To recover current state:**

1. Find latest `git_commit` event → checkout that commit
2. Replay `file_change` events since the last commit → apply uncommitted changes
3. Fetch file contents from S3 by hash

### Recovery Flow

```
Sandbox dies or needs recovery
         │
         ▼
Read event log from S3
Find latest git_commit
         │
         ▼
Provision new sandbox
git checkout {commit_sha}
         │
         ▼
For each file_change after commit:
  - Fetch content from S3 by hash
  - Write to filesystem
         │
         ▼
Resume agent with conversation history
```

### Agent Commits as Durable Checkpoints

The agent commits periodically on significant changes. This creates permanent checkpoints — even if S3 files expire (30-day TTL), we can always recover to any commit.

### Data Retention

| Data | Retention | Recovery |
|------|-----------|----------|
| Git commits | Permanent | Always recoverable |
| S3 file content | 30 days | Uncommitted changes for 30 days |
| Event log | Indefinite | History/debugging |

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
│                    │  - Emit events  │                          │
│                    │  - Ask questions│                          │
│                    │                 │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

**Message types:**

- `user_message` — New prompt or response to question
- `file_sync` — Files changed locally, agent should notice
- `cancel` — Stop current operation
- `close` — Shut down gracefully

**How commands reach the agent:** On startup, the agent opens an outbound SSE connection to the backend. Client commands (prompts, cancel, mode switch) are pushed directly through this connection to give as close to a local experience for latency as possible. This bypasses Temporal for real-time operations.

### Temporal Workflow

Temporal handles **lifecycle only**, not message routing:

```python
@workflow.defn
class CloudSessionWorkflow:

    @workflow.signal
    def close(self):
        self.should_close = True

    @workflow.run
    async def run(self, input):
        sandbox_id = await provision_sandbox(input)
        await start_agent_server(sandbox_id)  # Agent connects to backend via SSE

        # Just wait for close or timeout - messages go direct via SSE
        while not self.should_close:
            try:
                await workflow.wait_condition(
                    lambda: self.should_close,
                    timeout=timedelta(minutes=10)
                )
            except asyncio.TimeoutError:
                break  # Inactivity timeout

        await cleanup_sandbox(sandbox_id)
```

**Key behaviors:**

- Temporal provisions sandbox and handles cleanup
- Messages/commands go directly via SSE (not through Temporal)
- 10-min inactivity timeout triggers cleanup
- Client disconnection doesn't stop the agent

---

## Twig Integration

In Twig, the `AgentService` (main process) talks to agents through a connection. For cloud mode, we swap the transport without changing the rest of the app.

```
Renderer ──tRPC──► AgentService ──► Connection
                                        │
                          ┌─────────────┴─────────────┐
                          │                           │
                          ▼                           ▼
                  LocalConnection             CloudConnection
                  (in-process SDK)            (SSE to backend)
```

**The connection interface** (simplified):

```typescript
interface AgentConnection {
  prompt(params: { sessionId: string; prompt: string }): AsyncIterable<AcpMessage>
  cancel(params: { sessionId: string }): Promise<void>
  setMode(params: { sessionId: string; mode: string }): Promise<void>
  onEvent(handler: (event: AcpMessage) => void): void
}
```

**Key files:**

- `apps/twig/src/main/services/agent/service.ts` — AgentService, picks connection type
- `apps/twig/src/main/services/agent/local-connection.ts` — Current ACP/SDK logic (extract)
- `apps/twig/src/main/services/agent/cloud-connection.ts` — New, ~200 lines

---

## Communication Protocol

### Streamable HTTP

Following [MCP's pattern](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http):

- **POST** — Client sends messages (user input, file sync, cancel)
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
data: {"jsonrpc":"2.0","method":"_posthog/file_change","params":{"path":"src/auth.py","hash":"abc123"}}

id: 125
data: {"jsonrpc":"2.0","method":"agent_message_chunk","params":{"text":"I found the issue..."}}
```

### Why Not WebSocket?

- SSE will work much better with our infrastructure (load balancing across multiple pods)
- Built-in resumability via `Last-Event-ID`
- Easier to manage (stateless servers)

---

## Client Modes

### Interactive (Connected)

```
Client                          Backend                         Sandbox
  │                                │                               │
  │── GET /sync (SSE) ────────────►│                               │
  │                                │                               │
  │◄── file_change ────────────────│◄── file written ──────────────│
  │◄── agent_message ──────────────│◄── agent output ──────────────│
  │                                │                               │
  │── POST /sync {message} ───────►│── push via SSE ──────────────►│
  │◄── 202 Accepted ───────────────│                               │
```

### Background (Disconnected)

```
                                Backend                         Sandbox
                                   │                               │
                                   │◄── agent keeps working ───────│
                                   │◄── events to S3 log ──────────│
                                   │                               │
                                   │    (no client connected)      │
```

Agent continues autonomously. Events accumulate in S3.

### Resume (Reconnect)

```
Client                          Backend
  │                                │
  │── GET /sync ──────────────────►│
  │   Last-Event-ID: 50            │
  │                                │
  │◄── id:51 (from S3 log) ────────│  Replay missed events
  │◄── id:52 ──────────────────────│
  │◄── ... ────────────────────────│
  │◄── id:100 (live) ──────────────│  Switch to live stream
```

Client catches up instantly, then receives live events.

---

## Event Format

JSON-RPC 2.0 notifications, stored as NDJSON:

```typescript
{
  "jsonrpc": "2.0",
  "method": "_posthog/file_change",
  "params": {
    "path": "src/auth.py",
    "action": "modified",
    "hash": "sha256_abc123"
  }
}
```

### Event Types

**File sync:**

- `_posthog/file_change` — File created/modified/deleted (sandbox → client)
- `_posthog/file_sync` — Client pushing local changes (client → sandbox)
- `_posthog/git_commit` — Agent committed changes

**Agent interaction:**

- `agent_message_chunk` — Agent output
- `_posthog/agent_question` — Agent asking user
- `_posthog/user_message` — User input
- `tool_call` / `tool_result` — Tool usage

**Session:**

- `_posthog/session_start` — Session began
- `_posthog/session_close` — Session ended

**Control:**

- `_posthog/cancel` — Cancel current operation
- `_posthog/ack` — Acknowledgment

---

## References

- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Temporal Signals](https://docs.temporal.io/workflows#signal)
