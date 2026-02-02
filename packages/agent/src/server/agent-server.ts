import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "../adapters/acp-connection.js";
import { PostHogAPIClient } from "../posthog-api.js";
import { SessionLogWriter } from "../session-log-writer.js";
import { TreeTracker } from "../tree-tracker.js";
import type { DeviceInfo, TreeSnapshotEvent } from "../types.js";
import { getLlmGatewayUrl } from "../utils/gateway.js";
import { Logger } from "../utils/logger.js";
import {
  validateJwt,
  JwtValidationError,
  type JwtPayload,
  userDataSchema,
} from "./jwt.js";
import type { AgentServerConfig } from "./types.js";

type MessageCallback = (message: unknown) => void;

class NdJsonTap {
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(private onMessage: MessageCallback) {}

  process(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        // Not valid JSON, skip
      }
    }
  }
}

function createTappedReadableStream(
  underlying: ReadableStream<Uint8Array>,
  onMessage: MessageCallback,
): ReadableStream<Uint8Array> {
  const reader = underlying.getReader();
  const tap = new NdJsonTap(onMessage);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        tap.process(value);
        controller.enqueue(value);
      } catch {
        controller.close();
      }
    },
    cancel() {
      reader.releaseLock();
    },
  });
}

function createTappedWritableStream(
  underlying: WritableStream<Uint8Array>,
  onMessage: MessageCallback,
): WritableStream<Uint8Array> {
  const tap = new NdJsonTap(onMessage);

  return new WritableStream<Uint8Array>({
    async write(chunk) {
      tap.process(chunk);
      try {
        const writer = underlying.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
      } catch {
        // Stream may already be closed
      }
    },
    async close() {
      try {
        const writer = underlying.getWriter();
        await writer.close();
        writer.releaseLock();
      } catch {
        // Stream may already be closed
      }
    },
    async abort(reason) {
      try {
        const writer = underlying.getWriter();
        await writer.abort(reason);
        writer.releaseLock();
      } catch {
        // Stream may already be closed
      }
    },
  });
}

interface ActiveSession {
  payload: JwtPayload;
  acpConnection: InProcessAcpConnection;
  clientConnection: ClientSideConnection;
  treeTracker: TreeTracker;
  sseResponse: ServerResponse | null;
  deviceInfo: DeviceInfo;
  logWriter: SessionLogWriter;
}

export class AgentServer {
  private config: AgentServerConfig;
  private logger: Logger;
  private server: ReturnType<typeof createServer> | null = null;
  private session: ActiveSession | null = null;

  constructor(config: AgentServerConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[AgentServer]" });
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, () => {
        this.logger.info(`HTTP server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping agent server...");

    if (this.session) {
      await this.cleanupSession();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.logger.info("Agent server stopped");
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url || "/", `http://localhost:${this.config.port}`);

    if (url.pathname === "/health" && req.method === "GET") {
      return this.handleHealth(res);
    }

    if (url.pathname === "/events" && req.method === "GET") {
      return this.handleEvents(req, res);
    }

    if (url.pathname === "/command" && req.method === "POST") {
      return this.handleCommand(req, res);
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", hasSession: !!this.session }));
  }

  private authenticateRequest(req: IncomingMessage): JwtPayload {
    // Modal path: X-Verified-User-Data header (Modal validates the token)
    const modalUserData = req.headers["x-verified-user-data"];
    if (modalUserData) {
      const userData =
        typeof modalUserData === "string" ? modalUserData : modalUserData[0];
      try {
        const parsed = JSON.parse(userData);
        const result = userDataSchema.safeParse(parsed);
        if (!result.success) {
          throw new JwtValidationError(
            `Invalid user data: ${result.error.message}`,
            "invalid_token",
          );
        }
        return result.data;
      } catch (error) {
        if (error instanceof JwtValidationError) throw error;
        throw new JwtValidationError("Invalid user data JSON", "invalid_token");
      }
    }

    // Docker path: JWT in Authorization header
    if (!this.config.jwtSecret) {
      throw new JwtValidationError(
        "No authentication provided (expected X-Verified-User-Data header)",
        "invalid_token",
      );
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new JwtValidationError(
        "Missing authorization header",
        "invalid_token",
      );
    }

    const token = authHeader.slice(7);
    return validateJwt(token, this.config.jwtSecret);
  }

  private async handleEvents(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let payload: JwtPayload;

    try {
      payload = this.authenticateRequest(req);
    } catch (error) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            error instanceof JwtValidationError
              ? error.message
              : "Invalid token",
          code:
            error instanceof JwtValidationError ? error.code : "invalid_token",
        }),
      );
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    if (!this.session || this.session.payload.run_id !== payload.run_id) {
      await this.initializeSession(payload, res);
    } else {
      this.session.sseResponse = res;
    }

    this.sendSseEvent(res, { type: "connected", run_id: payload.run_id });

    req.on("close", () => {
      this.logger.info("SSE connection closed");
      if (this.session?.sseResponse === res) {
        this.session.sseResponse = null;
      }
    });
  }

  private async handleCommand(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let payload: JwtPayload;

    try {
      payload = this.authenticateRequest(req);
    } catch (error) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            error instanceof JwtValidationError
              ? error.message
              : "Invalid token",
        }),
      );
      return;
    }

    if (!this.session || this.session.payload.run_id !== payload.run_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No active session for this run" }));
      return;
    }

    const body = await this.readBody(req);
    let command: { jsonrpc: string; method: string; params?: Record<string, unknown>; id?: string | number };

    try {
      command = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    try {
      const result = await this.executeCommand(command.method, command.params || {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: command.id,
        result,
      }));
    } catch (error) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: command.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    }
  }

  private async executeCommand(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.session) {
      throw new Error("No active session");
    }

    switch (method) {
      case POSTHOG_NOTIFICATIONS.USER_MESSAGE:
      case "user_message": {
        const content = params.content as string;
        if (!content) {
          throw new Error("Missing content parameter");
        }

        this.logger.info(`Processing user message: ${content.substring(0, 100)}...`);

        const result = await this.session.clientConnection.prompt({
          sessionId: this.session.payload.run_id,
          prompt: [{ type: "text", text: content }],
        });

        return { stopReason: result.stopReason };
      }

      case POSTHOG_NOTIFICATIONS.CANCEL:
      case "cancel": {
        this.logger.info("Cancel requested");
        await this.session.clientConnection.cancel({
          sessionId: this.session.payload.run_id,
        });
        return { cancelled: true };
      }

      case POSTHOG_NOTIFICATIONS.CLOSE:
      case "close": {
        this.logger.info("Close requested");
        await this.cleanupSession();
        return { closed: true };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async initializeSession(
    payload: JwtPayload,
    sseResponse: ServerResponse,
  ): Promise<void> {
    if (this.session) {
      await this.cleanupSession();
    }

    this.logger.info("Initializing session", {
      runId: payload.run_id,
      taskId: payload.task_id,
    });

    const deviceInfo: DeviceInfo = {
      type: "cloud",
      name: process.env.HOSTNAME || "cloud-sandbox",
    };

    this.configureEnvironment();

    const treeTracker = new TreeTracker({
      repositoryPath: this.config.repositoryPath,
      taskId: payload.task_id,
      runId: payload.run_id,
      logger: new Logger({ debug: true, prefix: "[TreeTracker]" }),
    });

    const posthogAPI = new PostHogAPIClient({
      apiUrl: this.config.apiUrl,
      projectId: this.config.projectId,
      getApiKey: () => this.config.apiKey,
    });

    const logWriter = new SessionLogWriter(
      posthogAPI,
      new Logger({ debug: true, prefix: "[SessionLogWriter]" }),
    );

    const acpConnection = createAcpConnection({
      sessionId: payload.run_id,
      taskId: payload.task_id,
      logWriter,
    });

    // Tap both streams to broadcast all ACP messages via SSE (mimics local transport)
    const onAcpMessage = (message: unknown) => {
      this.broadcastEvent({
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: message,
      });
    };

    const tappedReadable = createTappedReadableStream(
      acpConnection.clientStreams.readable as ReadableStream<Uint8Array>,
      onAcpMessage,
    );

    const tappedWritable = createTappedWritableStream(
      acpConnection.clientStreams.writable as WritableStream<Uint8Array>,
      onAcpMessage,
    );

    const clientStream = ndJsonStream(
      tappedWritable,
      tappedReadable,
    );

    const clientConnection = new ClientSideConnection(
      () => this.createCloudClient(payload),
      clientStream,
    );

    await clientConnection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    await clientConnection.newSession({
      cwd: this.config.repositoryPath,
      mcpServers: [],
      _meta: { sessionId: payload.run_id },
    });

    this.session = {
      payload,
      acpConnection,
      clientConnection,
      treeTracker,
      sseResponse,
      deviceInfo,
      logWriter,
    };

    this.logger.info("Session initialized successfully");
  }

  private configureEnvironment(): void {
    const { apiKey, apiUrl, projectId } = this.config;
    const gatewayUrl = process.env.LLM_GATEWAY_URL || getLlmGatewayUrl(apiUrl);

    Object.assign(process.env, {
      POSTHOG_API_KEY: apiKey,
      POSTHOG_API_HOST: apiUrl,
      POSTHOG_AUTH_HEADER: `Bearer ${apiKey}`,
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_BASE_URL: gatewayUrl,
    });
  }

  private createCloudClient(payload: JwtPayload) {
    return {
      requestPermission: async (params: {
        options: Array<{ kind: string; optionId: string }>;
      }) => {
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        return {
          outcome: {
            outcome: "selected" as const,
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        };
      },
      sessionUpdate: async (params: {
        sessionId: string;
        update?: Record<string, unknown>;
      }) => {
        // session/update notifications flow through the tapped stream (like local transport)
        // Only handle tree state capture for file changes here
        if (params.update?.sessionUpdate === "tool_call_update") {
          const meta = (params.update?._meta as Record<string, unknown>)
            ?.claudeCode as Record<string, unknown> | undefined;
          const toolName = meta?.toolName as string | undefined;
          const toolResponse = meta?.toolResponse as Record<string, unknown> | undefined;

          if ((toolName === "Write" || toolName === "Edit") && toolResponse?.filePath) {
            await this.captureTreeState();
          }
        }
      },
    };
  }

  private async cleanupSession(): Promise<void> {
    if (!this.session) return;

    this.logger.info("Cleaning up session");

    try {
      await this.captureTreeState();
    } catch (error) {
      this.logger.error("Failed to capture final tree state", error);
    }

    try {
      await this.session.logWriter.flush(this.session.payload.run_id);
    } catch (error) {
      this.logger.error("Failed to flush session logs", error);
    }

    try {
      await this.session.acpConnection.cleanup();
    } catch (error) {
      this.logger.error("Failed to cleanup ACP connection", error);
    }

    if (this.session.sseResponse) {
      this.session.sseResponse.end();
    }

    this.session = null;
  }

  private async captureTreeState(): Promise<void> {
    if (!this.session?.treeTracker) return;

    try {
      const snapshot = await this.session.treeTracker.captureTree({});
      if (snapshot) {
        const snapshotWithDevice: TreeSnapshotEvent = {
          ...snapshot,
          device: this.session.deviceInfo,
        };
        this.broadcastEvent({
          type: "notification",
          timestamp: new Date().toISOString(),
          notification: {
            jsonrpc: "2.0",
            method: POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT,
            params: snapshotWithDevice,
          },
        });
      }
    } catch (error) {
      this.logger.error("Failed to capture tree state", error);
    }
  }

  private broadcastEvent(event: Record<string, unknown>): void {
    if (this.session?.sseResponse) {
      this.sendSseEvent(this.session.sseResponse, event);
    }
  }

  private sendSseEvent(res: ServerResponse, data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
