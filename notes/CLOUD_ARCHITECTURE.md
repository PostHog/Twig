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

1. **Local-first feel** — Edit in Array or your IDE, changes sync automatically
2. **Survive disconnection** — Close your laptop, agent keeps working
3. **Seamless resume** — Reconnect and catch up instantly
4. **Multiple clients** — Laptop, phone, Slack, API—all work
5. **Simple recovery** — If sandbox dies, state is recoverable

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│    Array Desktop    │    Slack Bot    │    API    │    Mobile App       │
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
│                                   │             │  - File content │    │
│                                   │             └─────────────────┘    │
└───────────────────────────────────│─────────────────────────────────────┘
                                   │
                                   │ Signals + Activities
                                   ▼
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
            Temporal workflow signals sandbox
                    │
                    ▼
            Sandbox fetches from S3, overwrites file
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
2. Replay `file_change` events since → apply uncommitted changes
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

**The loop:**

```
while not should_exit:
    handle_control_signals()      # cancel, close

    for message in pending_messages:
        if user_message:
            response = agent.run(message)
            emit_event('agent_message', response)
        elif file_sync:
            notify_agent_files_changed(files)

    if has_pending_question:
        emit_event('agent_question', question)

    sleep(100ms)
```

### Temporal Workflow

The workflow orchestrates the session lifecycle:

```python
@workflow.defn
class InteractiveSessionWorkflow:

    @workflow.signal
    def send_message(self, message: str): ...

    @workflow.signal
    def sync_files(self, files: list): ...

    @workflow.signal
    def cancel(self): ...

    @workflow.signal
    def close(self): ...

    @workflow.run
    async def run(self, input):
        sandbox_id = await provision_sandbox(input)
        await start_agent_server(sandbox_id)

        while not self.should_close:
            await wait_for_interaction(timeout=2_hours)

            if self.should_cancel:
                await send_cancel_to_sandbox(sandbox_id)

            for files in self.pending_file_syncs:
                await sync_files_to_sandbox(sandbox_id, files)

            for msg in self.pending_messages:
                await send_message_to_sandbox(sandbox_id, msg)

        await cleanup_sandbox(sandbox_id)
```

**Key behaviors:**

- Sandbox stays alive while workflow runs
- Client disconnection doesn't stop the agent
- 2-hour inactivity timeout (configurable)
- Signals queue and process in order

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

- SSE works with standard HTTP infrastructure (load balancers, CDNs, proxies)
- Built-in resumability via `Last-Event-ID`
- Native browser reconnection
- Easier to scale (stateless servers)

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
  │── POST /sync {message} ───────►│── signal workflow ───────────►│
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
