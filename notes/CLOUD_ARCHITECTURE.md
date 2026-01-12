# Cloud Mode Architecture

## The Challenge

The main challenge with coding agents in the cloud is that you want them to feel like your laptop, but they're not. You want the experience of running locally—real-time feedback, files on your disk, your IDE, full control—but the convenience of interacting from your phone or Slack while you're away.

This creates two distinct experiences:

**1. Interactive Mode** — "I'm watching"

- Real-time feedback as the agent works
- Files sync to your local machine instantly
- You can interrupt, redirect, answer questions
- Feels like pair programming

**2. Background Mode** — "Wake me when it's done"

- Agent works autonomously
- You check in when you're ready
- Review changes, pull them locally, continue
- Feels like delegating to a colleague

Most cloud agent implementations force you to choose one or the other. The goal here is to support both seamlessly—and let you switch between them without friction.

### Key Goals

1. **Local-first feel** — The agent should feel like its local, editing in Array or your IDE should be easy
2. **Survive disconnection** — Close your laptop, agent keeps working
3. **Seamless resume** — Reconnect and catch up instantly
4. **Multiple clients** — Laptop, phone, Slack, API—all work
5. **Simple recovery** — If something dies, state is recoverable

---

## Communication Protocol: Streamable HTTP

Following [MCP's Streamable HTTP pattern](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) - single endpoint supporting POST and GET.

**Key concepts:**

- **Streamable HTTP** is a design pattern built on top of SSE
- POST for client→server messages (response can be JSON or SSE stream)
- GET for opening a pure SSE stream for server→client messages
- Session ID via header for stateful interactions
- Built-in resumability via `Last-Event-ID`

### Endpoint

```text
/api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
```

### POST - Send Messages to Server

Client sends JSON-RPC notifications/requests, server responds with SSE stream or JSON:

```http
POST /api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
Content-Type: application/json
Accept: application/json, text/event-stream
Session-Id: {run_id}

{
  "jsonrpc": "2.0",
  "method": "_posthog/user_message",
  "params": { "content": "Please fix the bug in auth.py" }
}
```

**Response options:**

1. **SSE stream** (for requests needing ongoing response):

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Session-Id: {run_id}

id: 123
data: {"type":"notification","timestamp":"...","notification":{"jsonrpc":"2.0","method":"_posthog/ack","params":{"for":"user_message"}}}

id: 124
data: {"type":"notification","timestamp":"...","notification":{"jsonrpc":"2.0","method":"agent_message_chunk","params":{"text":"I'll look into that..."}}}
```

1. **JSON** (for simple acks):

```http
HTTP/1.1 202 Accepted
```

1. **Errors**:

```http
HTTP/1.1 404 Not Found  # Session expired - client must reinitialize
HTTP/1.1 400 Bad Request  # Invalid request
```

### GET - Listen for Server Messages

Opens SSE stream for server-initiated messages (file changes, agent questions, etc.):

```http
GET /api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
Accept: text/event-stream
Session-Id: {run_id}
Last-Event-ID: 123
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

id: 124
data: {"type":"notification","timestamp":"...","notification":{"jsonrpc":"2.0","method":"_posthog/file_change","params":{"path":"src/auth.py","action":"modified","hash":"abc123"}}}

id: 125
data: {"type":"notification","timestamp":"...","notification":{"jsonrpc":"2.0","method":"_posthog/agent_question","params":{"question":"Should I also update the tests?"}}}
```

### DELETE - Close Session

```http
DELETE /api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
Session-Id: {run_id}
```

```http
HTTP/1.1 202 Accepted  # Session closed
HTTP/1.1 405 Method Not Allowed  # Server doesn't allow client-initiated close
```

### Why Streamable HTTP over WebSocket

- Single endpoint for everything
- Standard HTTP - works with load balancers, CDNs, proxies
- Built-in resumability via `Last-Event-ID` header
- Session management via headers
- Easier to scale (stateless servers)
- SSE has native browser reconnection support

---

## Client Modes

### Watching Mode (Array open, connected)

```text
Array                           Backend                         Sandbox
  │                                │                               │
  │── GET /sync ──────────────────►│                               │
  │   (opens SSE stream)           │                               │
  │                                │                               │
  │◄── id:1 file_change ───────────│◄── file written ──────────────│
  │◄── id:2 agent_message ─────────│◄── agent output ──────────────│
  │                                │                               │
  │── POST /sync {user_message} ──►│── signal workflow ───────────►│
  │◄── 202 Accepted ───────────────│                               │
  │                                │                               │
  │◄── id:3 ack (on SSE stream) ───│                               │
```

- GET opens SSE stream for real-time events
- POST sends messages (file sync, user input, cancel)
- Events flow through the open SSE stream
- File changes sync to local in real-time

### Background Mode (Array closed / laptop shut)

```text
                                Backend                         Sandbox
                                   │                               │
                                   │◄── agent keeps working ───────│
                                   │◄── events to S3 log ──────────│
                                   │                               │
                                   │    (no client connected)      │
                                   │    (SSE stream closed)        │
                                   │                               │
```

- Agent continues autonomously in sandbox
- All events persisted to S3 (source of truth)
- Questions queue with optional timeout (agent waits or proceeds with default)
- No SSE stream open - that's fine, events are in S3

### Resume Mode (Array reconnects)

```text
Array                           Backend                         Sandbox
  │                                │                               │
  │── GET /sync ──────────────────►│                               │
  │   Last-Event-ID: 50            │                               │
  │                                │                               │
  │◄── id:51 file_change ──────────│  (replay from S3)             │
  │◄── id:52 file_change ──────────│                               │
  │◄── id:53 agent_message ────────│                               │
  │◄── ... (catch-up) ─────────────│                               │
  │                                │                               │
  │◄── id:100 (live) ──────────────│◄── (now streaming live) ──────│
```

- Client sends `Last-Event-ID` header with last seen event
- Backend replays missed events from S3
- Then switches to live streaming from sandbox
- Client syncs files incrementally during catch-up

### Session Lifecycle

```text
Array                           Backend
  │                                │
  │── POST /sync (init) ──────────►│
  │◄── 200 + Session-Id header ────│  Session created
  │                                │
  │── GET/POST with Session-Id ───►│  Normal operation
  │◄── events... ──────────────────│
  │                                │
  │   ... time passes ...          │
  │                                │
  │── GET /sync ──────────────────►│
  │◄── 404 Not Found ──────────────│  Session expired!
  │                                │
  │── POST /sync (reinit) ────────►│  Client must reinitialize
  │◄── 200 + new Session-Id ───────│
  │                                │
  │── DELETE /sync ───────────────►│  Explicit close
  │◄── 202 Accepted ───────────────│
```

- `404` means session expired - client must start fresh
- `DELETE` for explicit session termination
- Session ID tracks the TaskRun

---

## File Synchronization

### Content-Addressed Storage

Files are stored in S3 by hash (content-addressed). Events contain only metadata.

```text
S3 Structure:
  files/
    sha256_abc123...  → content of file (any file with this hash)
    sha256_def456...  → content of another file

  logs/
    run_{id}.jsonl    → event log with file_change events

Event Log Entry:
  { "method": "_posthog/file_change", "params": { "path": "src/foo.py", "hash": "sha256_abc123" }}
```

**Benefits:**

- Deduplication (same content = same hash = stored once)
- Multiple clients fetch from S3 (don't need sandbox)
- Files survive sandbox death
- Infinitely cacheable (hash-based)
- Simple recovery (replay events, fetch by hash)

### Sandbox → S3 → Client Flow

```text
┌────────────────────────────────────────────────────────────────┐
│                         SANDBOX                                │
│                                                                │
│  Agent writes file                                             │
│       │                                                        │
│       ▼                                                        │
│  File watcher detects change                                   │
│       │                                                        │
│       ├──► Store content in S3 by hash                         │
│       │    PUT s3://files/sha256_abc123                        │
│       │                                                        │
│       └──► Emit event (metadata only)                          │
│            { path: "src/foo.py", hash: "sha256_abc123" }       │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                     S3 EVENT LOG                               │
└────────────────────────────────────────────────────────────────┘
                              │
                    SSE stream to client
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      ARRAY CLIENT                              │
│                                                                │
│  Receive file_change event                                     │
│       │                                                        │
│       ▼                                                        │
│  Fetch content from S3 by hash                                 │
│  GET s3://files/sha256_abc123                                  │
│       │                                                        │
│       ▼                                                        │
│  Write to local filesystem                                     │
└────────────────────────────────────────────────────────────────┘
```

### Implementation

**Sandbox side:**

```typescript
// File watcher in sandbox
watcher.on('change', async (filePath) => {
  const content = await fs.readFile(filePath)
  const hash = `sha256_${sha256(content)}`
  const relativePath = path.relative(workspaceRoot, filePath)

  // Store content in S3 by hash (idempotent)
  await s3.putObject({
    key: `files/${hash}`,
    body: content,
    contentType: guessMimeType(filePath)
  })

  // Emit lightweight event
  await emitEvent('_posthog/file_change', {
    path: relativePath,
    hash,
    action: 'modified'
  })
})
```

**Client side:**

```typescript
async handleFileChange({ path, hash, action }) {
  if (action === 'deleted') {
    await fs.unlink(localPath(path))
    return
  }

  // Skip if we already have this version
  if (this.localHashes.get(path) === hash) return

  // Fetch from S3 by hash
  const content = await s3.getObject(`files/${hash}`)
  await fs.writeFile(localPath(path), content)

  // Track to avoid sync loops
  this.localHashes.set(path, hash)
}
```

### Client → Sandbox: Local Changes

```typescript
async handleLocalChange(filePath: string) {
  const content = await fs.readFile(filePath)
  const hash = `sha256_${sha256(content)}`
  const relativePath = path.relative(workspaceRoot, filePath)

  // Skip if this is a file we just synced from cloud
  if (this.localHashes.get(relativePath) === hash) return

  // Store in S3
  await s3.putObject({ key: `files/${hash}`, body: content })

  // Send sync event to sandbox
  await this.sendEvent('_posthog/file_sync', {
    path: relativePath,
    hash,
    action: 'modified'
  })

  this.localHashes.set(relativePath, hash)
}
```

### Conflict Resolution: Local Wins

- No merge logic needed
- Local change → pushes to S3 → overwrites sandbox version
- Agent notices file changed and adapts

---

## Temporal Workflow Changes

### Current: Fire-and-Forget

```python
@workflow.defn
class ProcessTaskWorkflow:
    @workflow.run
    async def run(self, input):
        sandbox = await provision_sandbox()
        await execute_task(sandbox)  # Single execution
        await cleanup_sandbox(sandbox)
```

### New: Interactive Session

```python
@workflow.defn
class InteractiveSessionWorkflow:
    def __init__(self):
        self.messages = []
        self.file_syncs = []
        self.should_cancel = False
        self.should_close = False

    # Signals for client interaction
    @workflow.signal
    def send_message(self, message: str):
        self.messages.append(message)

    @workflow.signal
    def sync_files(self, files: list):
        self.file_syncs.extend(files)

    @workflow.signal
    def cancel(self):
        self.should_cancel = True

    @workflow.signal
    def close(self):
        self.should_close = True

    @workflow.run
    async def run(self, input: SessionInput):
        sandbox_id = None

        try:
            # Provision sandbox
            sandbox_id = await workflow.execute_activity(
                provision_sandbox,
                input,
                start_to_close_timeout=timedelta(minutes=5)
            )

            # Start agent in server mode
            await workflow.execute_activity(
                start_agent_server,
                StartAgentInput(sandbox_id=sandbox_id, run_id=input.run_id),
                start_to_close_timeout=timedelta(minutes=2)
            )

            # Main loop - process interactions until closed
            while not self.should_close:
                # Wait for interaction or inactivity timeout
                try:
                    await workflow.wait_condition(
                        lambda: (
                            len(self.messages) > 0 or
                            len(self.file_syncs) > 0 or
                            self.should_cancel or
                            self.should_close
                        ),
                        timeout=timedelta(hours=2)  # Inactivity timeout
                    )
                except asyncio.TimeoutError:
                    # No activity for 2 hours, checkpoint and close
                    await self._checkpoint(sandbox_id)
                    break

                # Handle cancel
                if self.should_cancel:
                    await workflow.execute_activity(
                        send_control_to_sandbox,
                        ControlInput(sandbox_id=sandbox_id, action="cancel")
                    )
                    self.should_cancel = False

                # Handle file syncs (local → sandbox)
                while self.file_syncs:
                    files = self.file_syncs.pop(0)
                    await workflow.execute_activity(
                        sync_files_to_sandbox,
                        FileSyncInput(sandbox_id=sandbox_id, files=files)
                    )

                # Handle messages
                while self.messages:
                    msg = self.messages.pop(0)
                    await workflow.execute_activity(
                        send_message_to_sandbox,
                        MessageInput(sandbox_id=sandbox_id, message=msg)
                    )

                # Periodic checkpoint
                if self._should_checkpoint():
                    await self._checkpoint(sandbox_id)

        finally:
            if sandbox_id:
                await workflow.execute_activity(
                    cleanup_sandbox,
                    CleanupInput(sandbox_id=sandbox_id)
                )

    async def _checkpoint(self, sandbox_id: str):
        await workflow.execute_activity(
            checkpoint_session,
            CheckpointInput(sandbox_id=sandbox_id, run_id=self.run_id)
        )
        self.last_checkpoint = workflow.now()

    def _should_checkpoint(self) -> bool:
        # Checkpoint every 5 minutes of activity
        return (workflow.now() - self.last_checkpoint) > timedelta(minutes=5)
```

---

## Agent Server Mode

### Current: Single Execution

```bash
node /scripts/runAgent.mjs \
  --taskId {id} \
  --runId {id} \
  --repositoryPath {path}
# Runs once, exits
```

### New: Server Mode

```bash
node /scripts/runAgent.mjs \
  --mode server \
  --sessionId {run_id} \
  --messagesPath /tmp/messages.jsonl \
  --controlPath /tmp/control.jsonl
# Runs until closed, processes messages
```

```typescript
// Agent server mode pseudocode
class AgentServer {
  async run() {
    // Watch for incoming messages
    const messageWatcher = this.watchFile(this.messagesPath)
    const controlWatcher = this.watchFile(this.controlPath)

    while (!this.shouldExit) {
      // Process any pending messages
      const messages = await this.readNewMessages()
      for (const msg of messages) {
        if (msg.type === 'user_message') {
          await this.processUserMessage(msg.content)
        } else if (msg.type === 'file_sync') {
          // Files already written by activity, just notify agent
          this.notifyFilesChanged(msg.files)
        }
      }

      // Check control signals
      const controls = await this.readNewControls()
      for (const ctrl of controls) {
        if (ctrl.action === 'cancel') {
          await this.cancelCurrentOperation()
        } else if (ctrl.action === 'close') {
          this.shouldExit = true
        }
      }

      // If agent is idle and has pending question, wait for response
      if (this.hasPendingQuestion && !messages.length) {
        await this.emitQuestionEvent()
        // Continue waiting...
      }

      await sleep(100) // Small poll interval
    }
  }

  async processUserMessage(content: string) {
    this.emitEvent({ type: 'agent_status', status: 'thinking' })

    const response = await this.agent.run(content)

    this.emitEvent({ type: 'agent_message', content: response })
    this.emitEvent({ type: 'agent_status', status: 'idle' })
  }

  emitEvent(event: Event) {
    // Append to S3 log via API or local file
    appendToLog(this.sessionId, {
      ...event,
      seq: this.nextSeq++,
      timestamp: new Date().toISOString()
    })
  }
}
```

---

## State & Recovery

### The Event Log IS the Checkpoint

No separate checkpointing needed. The event log + S3 content-addressed files give us everything:

```text
S3 Structure:
  files/
    sha256_abc...  → file content (30-day TTL)
    sha256_def...  → file content (30-day TTL)

  logs/
    run_{id}.jsonl:
      { method: "_posthog/git_commit", params: { sha: "abc123", branch: "main" } }
      { method: "_posthog/file_change", params: { path: "src/foo.py", hash: "sha256_abc" } }
      { method: "_posthog/file_change", params: { path: "src/bar.py", hash: "sha256_def" } }
      { method: "_posthog/git_commit", params: { sha: "def456", branch: "posthog/task-123" } }
      { method: "_posthog/file_change", params: { path: "src/foo.py", hash: "sha256_ghi" } }
```

**To recover current state:**

1. Find latest `git_commit` event → that's the base
2. Replay `file_change` events since that commit → uncommitted changes
3. Fetch file contents from S3 by hash

### Recovery Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  Sandbox dies or new client connects                        │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Read event log from S3                                     │
│  Find latest git_commit event                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Provision new sandbox                                      │
│  git clone → git checkout {commit_sha}                      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Replay file_change events since last commit                │
│  For each file: fetch content from S3 by hash, write        │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Resume agent with conversation history from event log      │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
async function recoverState(runId: string): Promise<FileState> {
  const events = await fetchEventLog(runId)

  // Find latest commit
  let baseCommit: string | null = null
  let baseCommitIndex = -1

  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].method === '_posthog/git_commit') {
      baseCommit = events[i].params.sha
      baseCommitIndex = i
      break
    }
  }

  // Build file state from events after last commit
  const fileState = new Map<string, string>() // path → hash

  const startIndex = baseCommitIndex + 1
  for (let i = startIndex; i < events.length; i++) {
    const event = events[i]
    if (event.method === '_posthog/file_change') {
      if (event.params.action === 'deleted') {
        fileState.delete(event.params.path)
      } else {
        fileState.set(event.params.path, event.params.hash)
      }
    }
  }

  return { baseCommit, uncommittedFiles: fileState }
}
```

```python
# Restore activity
@activity.defn
async def restore_sandbox(input: RestoreInput) -> str:
    state = await recover_state(input.run_id)

    # Provision sandbox and checkout base commit
    sandbox = await Sandbox.create(config)
    await sandbox.clone_repository(input.repository)

    if state.base_commit:
        sandbox.execute(f"git checkout {state.base_commit}")

    # Apply uncommitted files from S3
    for path, hash in state.uncommitted_files.items():
        content = await s3.get_object(f"files/{hash}")
        sandbox.write_file(path, content)

    return sandbox.id
```

### TTL and Data Retention

| Data | Retention | After Expiry |
|------|-----------|--------------|
| S3 file content | 30 days | Deleted |
| Event log | Indefinite | Kept |
| Git commits | Indefinite | Kept |

**After 30 days:**

- Can still recover to any git commit
- Uncommitted file changes are lost
- Event log shows what happened (for history/debugging)

### Agent Commits as Checkpoints

Agent should commit periodically to create durable checkpoints:

```typescript
// Agent commits WIP every ~10 minutes or on significant changes
async function maybeCommit() {
  const timeSinceLastCommit = Date.now() - lastCommitTime
  const hasSignificantChanges = await checkSignificantChanges()

  if (timeSinceLastCommit > 10 * 60 * 1000 || hasSignificantChanges) {
    await git.add('.')
    await git.commit('WIP: ' + summarizeChanges())
    await git.push()

    await emitEvent('_posthog/git_commit', {
      sha: await git.head(),
      branch: await git.currentBranch(),
      message: 'WIP checkpoint'
    })

    lastCommitTime = Date.now()
  }
}
```

This gives us:

- **Real-time**: File changes synced via S3 (survives sandbox death)
- **Short-term**: Uncommitted changes recoverable for 30 days
- **Long-term**: Git commits are permanent

---

## API Endpoints

### Sync Endpoints

```text
POST   /sync              # Send message/file sync (Streamable HTTP)
GET    /sync              # Open SSE stream for events
DELETE /sync              # Close session

GET    /sync/status       # Session status (for polling clients)
```

All endpoints prefixed with: `/api/projects/{project_id}/tasks/{task_id}/runs/{run_id}`

### File Access

Files are fetched directly from S3 by hash (no API endpoint needed):

```typescript
// Client fetches file content directly from S3
const content = await fetch(`${S3_URL}/files/${hash}`)
```

Or via presigned URL if S3 is private:

```http
GET /sync/file-url?hash=sha256_abc123
Session-Id: {run_id}

{ "url": "https://s3.../files/sha256_abc123?signature=..." }
```

### Status Endpoint

**GET /sync/status** - For polling clients (Slack, etc.):

```http
GET /sync/status
Session-Id: {run_id}
```

```json
{
  "status": "active",
  "sandboxHealthy": true,
  "lastEventId": "evt_456",
  "agentStatus": "thinking",
  "pendingQuestion": null,
  "lastCommit": {
    "sha": "abc123",
    "branch": "posthog/task-123"
  }
}
```

### Webhook Callbacks (for Slack, etc.)

```python
# When creating a session, optionally register callbacks
POST /api/projects/{project_id}/tasks/{task_id}/runs/{run_id}/sync
{
  "type": "register_callback",
  "callbacks": [
    {
      "url": "https://hooks.slack.com/...",
      "events": ["agent_message", "question", "done", "error"]
    }
  ]
}

# Backend POSTs to callback URLs when events occur
```

---

## Event Format

Using the existing JSON-RPC 2.0 notification format already in use (stored as NDJSON in S3):

```typescript
interface StoredNotification {
  type: "notification"
  timestamp: string  // ISO 8601
  notification: {
    jsonrpc: "2.0"
    method: string   // e.g., "_posthog/file_change"
    params?: Record<string, unknown>
  }
}
```

### Existing Methods (already in use)

```typescript
// ACP standard
"user_message_chunk"     // User input
"agent_message_chunk"    // Agent response
"tool_call"              // Tool invocation
"session/update"         // Session state

// PostHog custom
"_posthog/phase_start"   // { sessionId, phase }
"_posthog/phase_complete"
"_posthog/artifact"      // { sessionId, kind, content }
"_posthog/console"       // { sessionId, level, message }
"_posthog/sandbox_output"// { sessionId, stdout, stderr, exitCode }
"_posthog/pr_created"    // { sessionId, prUrl }
"_posthog/error"         // { sessionId, message, error }
```

### New Methods for Cloud Sync

```typescript
// File synchronization
"_posthog/file_change"   // { path, action: "created"|"modified"|"deleted", hash }
"_posthog/file_content"  // { path, content } - when client requests file
"_posthog/file_sync"     // { files: [{ path, content, hash }] } - client→server

// Agent interaction
"_posthog/agent_question"// { question, options?, timeout? }
"_posthog/user_message"  // { content } - client→server message
"_posthog/user_response" // { questionId, answer } - response to question

// Session lifecycle
"_posthog/session_start" // { sandboxId }
"_posthog/session_checkpoint" // { checkpointId }
"_posthog/session_restored"   // { fromCheckpoint }
"_posthog/session_close"      // { reason }

// Control
"_posthog/cancel"        // {} - cancel current operation
"_posthog/ack"           // { for, id? } - acknowledgment
```

### Example Event Stream

```text
id: 100
data: {"type":"notification","timestamp":"2024-01-15T10:30:00Z","notification":{"jsonrpc":"2.0","method":"_posthog/file_change","params":{"path":"src/auth.py","action":"modified","hash":"abc123"}}}

id: 101
data: {"type":"notification","timestamp":"2024-01-15T10:30:01Z","notification":{"jsonrpc":"2.0","method":"agent_message_chunk","params":{"text":"I've updated the authentication logic..."}}}

id: 102
data: {"type":"notification","timestamp":"2024-01-15T10:30:05Z","notification":{"jsonrpc":"2.0","method":"_posthog/agent_question","params":{"question":"Should I also update the unit tests?","options":["Yes","No","Skip for now"]}}}
```

---

## Array Client Changes

### New Services

1. **CloudSyncService** - SSE stream + POST for messages
2. **FileSyncService** - Bidirectional file sync via S3

### Session Store

```typescript
interface CloudSession {
  runId: string
  lastEventId: string
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'
  localHashes: Map<string, string>  // path → hash (for loop prevention)
  pendingQuestion: AgentQuestion | null
}
```

### Sync Service

```typescript
class CloudSyncService {
  private localHashes = new Map<string, string>()

  // Connect to SSE stream
  async connect(runId: string) {
    const lastEventId = this.getLastEventId(runId)

    const response = await fetch(`${API_URL}/sync`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Session-Id': runId,
        ...(lastEventId && { 'Last-Event-ID': lastEventId })
      }
    })

    if (response.status === 404) throw new SessionExpiredError()

    for await (const event of this.parseSSE(response.body)) {
      await this.handleEvent(event)
    }
  }

  async handleEvent(event: SSEEvent) {
    const { method, params } = JSON.parse(event.data).notification

    switch (method) {
      case '_posthog/file_change':
        await this.handleFileChange(params)
        break
      case '_posthog/agent_question':
        sessionStore.setPendingQuestion(params)
        break
      case 'agent_message_chunk':
        sessionStore.appendMessage(params)
        break
    }

    this.saveLastEventId(event.id)
  }

  // File change from sandbox → fetch from S3 → write locally
  async handleFileChange({ path, hash, action }) {
    if (action === 'deleted') {
      await fs.unlink(this.localPath(path))
      this.localHashes.delete(path)
      return
    }

    // Skip if we already have this version
    if (this.localHashes.get(path) === hash) return

    // Fetch from S3 by hash
    const content = await fetch(`${S3_URL}/files/${hash}`)
    await fs.writeFile(this.localPath(path), await content.arrayBuffer())

    this.localHashes.set(path, hash)
  }

  // Local change → store in S3 → notify sandbox
  async handleLocalChange(filePath: string) {
    const content = await fs.readFile(filePath)
    const hash = sha256(content)
    const relativePath = path.relative(this.workspacePath, filePath)

    // Skip if this came from cloud sync
    if (this.localHashes.get(relativePath) === hash) return

    // Store in S3
    await fetch(`${S3_URL}/files/${hash}`, {
      method: 'PUT',
      body: content
    })

    // Notify sandbox
    await fetch(`${API_URL}/sync`, {
      method: 'POST',
      headers: { 'Session-Id': this.runId },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: '_posthog/file_sync',
        params: { path: relativePath, hash, action: 'modified' }
      })
    })

    this.localHashes.set(relativePath, hash)
  }
}
```

---

## Migration Path

### Phase 1: Backend Infrastructure

- [ ] S3 content-addressed file storage (`files/{hash}`)
- [ ] File watcher in sandbox → S3 + event emission
- [ ] Sync API endpoint (Streamable HTTP)
- [ ] `InteractiveSessionWorkflow` with Temporal signals

### Phase 2: Array Integration

- [ ] CloudSyncService (SSE stream + POST)
- [ ] File sync from S3 on `file_change` events
- [ ] Local file watcher → S3 + sync events

### Phase 3: Recovery

- [ ] Recovery from event log (latest commit + file changes)
- [ ] Agent server mode (message loop)
- [ ] Reconnection with `Last-Event-ID` catch-up

### Phase 4: Polish

- [ ] Webhook callbacks for Slack, etc.
- [ ] Question timeout handling
- [ ] Background notifications (desktop)

---

## Open Questions

1. **S3 bucket structure** - Same bucket as existing logs? Separate bucket for files?

2. **File size limits** - Max file size to sync? Skip large binary files?

3. **S3 access** - Direct client access or presigned URLs?

4. **Agent commit frequency** - Every 10 min? On significant changes? User configurable?

5. **30-day TTL** - Right retention period? Different for different file types?

---

## References

- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Temporal Signals](https://docs.temporal.io/workflows#signal)
- Current workflow: `posthog/products/tasks/backend/temporal/process_task/workflow.py`
- Array session store: `apps/array/src/renderer/features/sessions/stores/sessionStore.ts`
