import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { InProcessAcpConnection } from "../adapters/acp-connection.js";
import { PostHogAPIClient } from "../posthog-api.js";
import type { TreeTracker } from "../tree-tracker.js";
import type { DeviceInfo, TreeSnapshotEvent } from "../types.js";
import { Logger } from "../utils/logger.js";
import type { CloudClientFactory } from "./sagas/init-acp-saga.js";
import { ShutdownSaga } from "./sagas/shutdown-saga.js";
import { StartupSaga } from "./sagas/startup-saga.js";
import type { AgentServerConfig } from "./types.js";
import { retry } from "./utils/retry.js";
import { SseEventParser } from "./utils/sse-parser.js";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class AgentServer {
  private config: AgentServerConfig;
  private isRunning = false;
  private sseAbortController: AbortController | null = null;
  private logger: Logger;
  private acpConnection: InProcessAcpConnection | null = null;
  private clientConnection: ClientSideConnection | null = null;
  private treeTracker: TreeTracker | null = null;
  private apiClient: PostHogAPIClient;
  private lastHeartbeatTime = 0;
  private lastEventId: string | null = null;
  private deviceInfo: DeviceInfo;

  constructor(config: AgentServerConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[AgentServer]" });
    this.deviceInfo = {
      type: "cloud",
      name: process.env.HOSTNAME || "cloud-sandbox",
    };
    this.apiClient =
      config.apiClient ||
      new PostHogAPIClient({
        apiUrl: config.apiUrl,
        getApiKey: () => config.apiKey,
        projectId: config.projectId,
      });
  }

  async start(): Promise<void> {
    this.isRunning = true;

    const startupSaga = new StartupSaga(this.logger);
    const result = await startupSaga.run({
      config: this.config,
      apiClient: this.apiClient,
      deviceInfo: this.deviceInfo,
      cloudClientFactory: this.createCloudClientFactory(),
    });

    if (!result.success) {
      this.isRunning = false;
      throw new Error(
        `Startup failed at ${result.failedStep}: ${result.error}`,
      );
    }

    this.acpConnection = result.data.acpConnection;
    this.clientConnection = result.data.clientConnection;
    this.treeTracker = result.data.treeTracker;
    this.sseAbortController = result.data.sseAbortController;

    await this.connect();

    if (this.config.initialPrompt) {
      this.logger.info("Processing initial prompt");
      await this.handleUserMessage({ content: this.config.initialPrompt });
    }

    await new Promise<void>((resolve) => {
      const checkRunning = () => {
        if (!this.isRunning) {
          resolve();
        } else {
          setTimeout(checkRunning, 1000);
        }
      };
      checkRunning();
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info("Stopping agent server...");

    const shutdownSaga = new ShutdownSaga(this.logger, {
      treeTracker: this.treeTracker,
      acpConnection: this.acpConnection,
      sseAbortController: this.sseAbortController,
      deviceInfo: this.deviceInfo,
      onTreeSnapshot: async (snapshot) => {
        await this.sendTreeSnapshotEvent(snapshot);
      },
    });

    const result = await shutdownSaga.run({ interrupted: true });

    if (result.success && result.data.treeCaptured) {
      this.logger.info("Final tree state captured", {
        treeHash: result.data.finalTreeHash,
      });
    }

    this.acpConnection = null;
    this.clientConnection = null;
    this.treeTracker = null;
    this.sseAbortController = null;

    this.logger.info("Agent server stopped");
  }

  private createCloudClientFactory(): CloudClientFactory {
    return ({ config }) => ({
      requestPermission: async (params) => {
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
      sessionUpdate: async (params) => {
        this.logger.info(
          `[SESSION_UPDATE] Received: ${(params.update?.sessionUpdate as string) || "unknown"}`,
        );

        const normalizedParams = {
          ...params,
          sessionId: config.runId,
        };

        const notification = {
          type: "notification",
          timestamp: new Date().toISOString(),
          notification: {
            jsonrpc: "2.0",
            method: "session/update",
            params: normalizedParams,
          },
        };
        await this.sendEvent(notification);

        if (params.update?.sessionUpdate === "tool_call_update") {
          const meta = (params.update?._meta as Record<string, unknown>)
            ?.claudeCode as Record<string, unknown> | undefined;
          const toolName = meta?.toolName as string | undefined;
          const toolResponse = meta?.toolResponse as
            | Record<string, unknown>
            | undefined;
          if (
            (toolName === "Write" || toolName === "Edit") &&
            toolResponse?.filePath
          ) {
            this.logger.info(
              `[TREE_CAPTURE] Detected ${toolName} for file: ${toolResponse.filePath}`,
            );
            await this.captureTreeState({});
          }
        }
      },
    });
  }

  private async connect(): Promise<void> {
    const { apiUrl, projectId, taskId, runId } = this.config;
    const syncUrl = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/sync`;

    this.logger.info(`Connecting to SSE stream: ${syncUrl}`);

    this.startSseStream(syncUrl).catch((error) => {
      this.logger.error("SSE stream error:", (error as Error).message);
    });

    this.isRunning = true;
    await this.sendStatusNotification("connected", "Agent server connected");
  }

  private async startSseStream(url: string): Promise<void> {
    const { apiKey } = this.config;
    const parser = new SseEventParser();

    while (this.isRunning) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
        };

        if (this.lastEventId) {
          headers["Last-Event-ID"] = this.lastEventId;
        }

        const response = await fetch(url, {
          headers,
          signal: this.sseAbortController?.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        this.logger.info("SSE connection established");

        if (!response.body) {
          throw new Error("SSE response has no body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        parser.reset();

        while (this.isRunning) {
          const { done, value } = await reader.read();

          if (done) {
            this.logger.info("SSE stream ended");
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const events = parser.parse(chunk);

          for (const event of events) {
            if (event.id) {
              this.lastEventId = event.id;
            }
            await this.handleSseEvent(event.data as Record<string, unknown>);
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          this.logger.info("SSE connection aborted");
          break;
        }
        this.logger.error(
          "SSE error, reconnecting in 1s:",
          (error as Error).message,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleSseEvent(event: Record<string, unknown>): Promise<void> {
    const notification = event.notification as
      | Record<string, unknown>
      | undefined;
    const method = (event.method as string) || (notification?.method as string);

    if (
      method === POSTHOG_NOTIFICATIONS.USER_MESSAGE ||
      event.type === "client_message"
    ) {
      this.logger.info(`[SSE] Received client message: ${method}`);
      const message = event.message as Record<string, unknown> | undefined;
      const params =
        (event.params as Record<string, unknown>) ||
        (notification?.params as Record<string, unknown>) ||
        (message?.params as Record<string, unknown>);
      if (params) {
        await this.handleMessage({
          method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
          params,
        });
      }
    } else if (method === POSTHOG_NOTIFICATIONS.CANCEL) {
      await this.handleCancel();
    } else if (method === POSTHOG_NOTIFICATIONS.CLOSE) {
      await this.handleClose();
    }
  }

  private async sendStatusNotification(
    status: string,
    message: string,
  ): Promise<void> {
    const statusEmoji: Record<string, string> = {
      connected: "☁️",
      error: "❌",
      warning: "⚠️",
    };
    const notification = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: this.config.runId,
          update: {
            sessionUpdate: "system_message",
            content: {
              type: "text",
              text: `${statusEmoji[status] || "ℹ️"} ${message}`,
            },
          },
        },
      },
    };
    await this.sendEvent(notification);
  }

  private async sendEvent(event: Record<string, unknown>): Promise<void> {
    const notification = event.notification as
      | Record<string, unknown>
      | undefined;
    this.logger.info(
      `[SEND_EVENT] Sending event: method=${notification?.method || (event.method as string) || "unknown"}`,
    );

    this.maybeHeartbeat();

    try {
      await retry(() => this.persistEvent(event), {
        maxAttempts: 3,
        baseDelayMs: 1000,
      });
      this.logger.info("[SEND_EVENT] Persisted to log successfully");
    } catch (error) {
      this.logger.error(
        "[SEND_EVENT] Failed to persist event:",
        (error as Error).message,
      );
    }
  }

  private maybeHeartbeat(): void {
    const now = Date.now();

    if (now - this.lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
      this.lastHeartbeatTime = now;
      this.sendHeartbeat().catch((err) => {
        this.logger.warn("Failed to send heartbeat:", (err as Error).message);
      });
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const { apiUrl, apiKey, projectId, taskId, runId } = this.config;
    const url = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/heartbeat`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Heartbeat failed: ${response.status}`);
    }

    this.logger.info("Heartbeat sent successfully");
  }

  private async persistEvent(event: Record<string, unknown>): Promise<void> {
    const { apiUrl, apiKey, projectId, taskId, runId } = this.config;
    const url = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/append_log`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entries: [event],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to persist: ${response.status}`);
    }
  }

  private async handleMessage(message: {
    method: string;
    params?: Record<string, unknown>;
  }): Promise<void> {
    const method = message.method;
    this.logger.info(`Received message: ${method}`);

    switch (method) {
      case POSTHOG_NOTIFICATIONS.USER_MESSAGE:
        await this.handleUserMessage(message.params as { content: string });
        break;
      case POSTHOG_NOTIFICATIONS.CANCEL:
        await this.handleCancel();
        break;
      case POSTHOG_NOTIFICATIONS.CLOSE:
        await this.handleClose();
        break;
      default:
        this.logger.info(`Unknown method: ${method}`);
    }
  }

  private async handleUserMessage(params: { content: string }): Promise<void> {
    const content = params.content;
    this.logger.info(
      `[USER_MSG] Processing user message: ${content.substring(0, 100)}...`,
    );

    if (!this.clientConnection) {
      throw new Error("ACP connection not initialized");
    }

    try {
      this.logger.info("[USER_MSG] Sending prompt via ACP protocol");
      const result = await this.clientConnection.prompt({
        sessionId: this.config.runId,
        prompt: [{ type: "text", text: content }],
      });

      this.logger.info(
        `[USER_MSG] Prompt completed with stopReason: ${result.stopReason}`,
      );
    } catch (error) {
      this.logger.error("[USER_MSG] Agent error:", error);
      await this.sendStatusNotification("error", (error as Error).message);
    }
  }

  private async captureTreeState(options: {
    interrupted?: boolean;
    force?: boolean;
  }): Promise<void> {
    if (!this.treeTracker) {
      this.logger.warn("TreeTracker not initialized");
      return;
    }

    try {
      const snapshot = await this.treeTracker.captureTree({
        interrupted: options.interrupted,
      });

      if (snapshot) {
        const snapshotWithDevice: TreeSnapshotEvent = {
          ...snapshot,
          device: this.deviceInfo,
        };

        this.logger.info("Tree state captured", {
          treeHash: snapshot.treeHash,
          changesCount: snapshot.changes.length,
          interrupted: options.interrupted,
        });

        await this.sendTreeSnapshotEvent(snapshotWithDevice);
      }
    } catch (error) {
      this.logger.error(
        "Failed to capture tree state:",
        (error as Error).message,
      );
    }
  }

  private async sendTreeSnapshotEvent(
    snapshot: TreeSnapshotEvent,
  ): Promise<void> {
    const notification = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        jsonrpc: "2.0",
        method: POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT,
        params: snapshot,
      },
    };
    await this.sendEvent(notification);
  }

  private async handleCancel(): Promise<void> {
    this.logger.info("Cancel requested");
    if (this.clientConnection) {
      try {
        await this.clientConnection.cancel({ sessionId: this.config.runId });
      } catch (error) {
        this.logger.error("Failed to cancel:", error);
      }
    }
  }

  private async handleClose(): Promise<void> {
    this.logger.info("Close requested");
    await this.stop();
  }
}
