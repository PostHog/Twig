import type { ContentBlock } from "@agentclientprotocol/sdk";
import {
  CloudConnection,
  type CloudConnectionEvents,
  type JsonRpcMessage,
  PostHogAPIClient,
  TreeTracker,
} from "@posthog/agent";
import type { AcpMessage } from "@shared/types/session-events";
import { logger } from "../../../lib/logger.js";
import type {
  InterruptReason,
  PermissionRequestPayload,
  PromptOutput,
  SessionConfig,
} from "../schemas.js";
import {
  CLOUD_CAPABILITIES,
  type SessionCapabilities,
  type SessionProvider,
} from "./types.js";

const log = logger.scope("cloud-provider");

export interface CloudProviderDeps {
  getToken: (fallback: string) => string;
}

export class CloudProvider implements SessionProvider {
  readonly capabilities: SessionCapabilities = CLOUD_CAPABILITIES;
  readonly executionEnvironment = "cloud" as const;

  private cloudConnection: CloudConnection | null = null;
  private treeTracker: TreeTracker | null = null;

  private eventHandlers = new Set<(event: AcpMessage) => void>();
  private permissionHandlers = new Set<
    (request: Omit<PermissionRequestPayload, "sessionId">) => void
  >();

  constructor(private deps: CloudProviderDeps) {}

  async connect(sessionConfig: SessionConfig, _isReconnect: boolean): Promise<void> {
    const { taskId, taskRunId, repoPath, credentials } = sessionConfig;

    log.info("Connecting to cloud session", { taskRunId, taskId });

    const apiClient = new PostHogAPIClient({
      apiUrl: credentials.apiHost,
      getApiKey: () => this.deps.getToken(credentials.apiKey),
      projectId: credentials.projectId,
    });

    this.treeTracker = new TreeTracker({
      repositoryPath: repoPath,
      taskId,
      runId: taskRunId,
      apiClient,
    });

    const cloudConnectionEvents: CloudConnectionEvents = {
      onEvent: (event: JsonRpcMessage) => {
        log.debug("Cloud event received", { method: event.method });
        this.handleCloudEvent(event);

        if (event.method === "_posthog/tree_snapshot") {
          const params = event.params as
            | { treeHash?: string; archiveUrl?: string }
            | undefined;
          if (params?.treeHash && this.treeTracker) {
            this.treeTracker.setLastTreeHash(params.treeHash);
            log.info("Tree snapshot received from cloud", {
              treeHash: params.treeHash,
            });
          }
        }
      },
      onError: (error: Error) => {
        log.error("Cloud connection error", { error });
        this.emitEvent({
          type: "acp_message",
          ts: Date.now(),
          message: {
            jsonrpc: "2.0",
            method: "error",
            params: { message: error.message },
          },
        });
      },
      onConnect: () => {
        log.info("Cloud connection established");
      },
      onDisconnect: () => {
        log.info("Cloud connection disconnected");
      },
    };

    this.cloudConnection = new CloudConnection(
      {
        apiHost: credentials.apiHost,
        apiKey: this.deps.getToken(credentials.apiKey),
        projectId: credentials.projectId,
        taskId,
        runId: taskRunId,
      },
      cloudConnectionEvents,
    );

    await this.cloudConnection.connect();
    log.info("Cloud connection established", { taskRunId });
  }

  async disconnect(): Promise<void> {
    if (this.cloudConnection) {
      try {
        await this.cloudConnection.close();
      } catch {
        // Ignore close errors
      }
      this.cloudConnection = null;
    }
    this.treeTracker = null;
  }

  async prompt(blocks: ContentBlock[]): Promise<PromptOutput> {
    if (!this.cloudConnection) {
      throw new Error("Provider not connected");
    }

    const textContent = blocks
      .filter(
        (block): block is { type: "text"; text: string } =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("\n");

    log.info("Sending prompt to cloud", { contentLength: textContent.length });
    await this.cloudConnection.prompt(textContent);
    log.info("Cloud prompt sent successfully");

    return { stopReason: "end_turn" };
  }

  async cancelPrompt(_reason?: InterruptReason): Promise<boolean> {
    if (!this.cloudConnection) return false;

    try {
      await this.cloudConnection.cancel();
      return true;
    } catch (err) {
      log.error("Failed to cancel cloud prompt", { err });
      return false;
    }
  }

  onEvent(handler: (event: AcpMessage) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onPermission(
    handler: (request: Omit<PermissionRequestPayload, "sessionId">) => void,
  ): () => void {
    this.permissionHandlers.add(handler);
    return () => this.permissionHandlers.delete(handler);
  }

  async cleanup(): Promise<void> {
    await this.disconnect();
  }

  getTreeTracker(): TreeTracker | null {
    return this.treeTracker;
  }

  getCloudConnection(): CloudConnection | null {
    return this.cloudConnection;
  }

  private handleCloudEvent(event: JsonRpcMessage): void {
    const acpMessage: AcpMessage = {
      type: "acp_message",
      ts: Date.now(),
      message: event as AcpMessage["message"],
    };

    this.emitEvent(acpMessage);
  }

  private emitEvent(event: AcpMessage): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
