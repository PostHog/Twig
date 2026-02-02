import type {
  ContentBlock,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "events";
import type { AcpMessage } from "../../../../shared/types/session-events.js";
import { logger } from "../../../lib/logger.js";
import type { PromptOutput } from "../schemas.js";
import type {
  AgentTransport,
  CloudTransportConfig,
  ConnectResult,
  TransportEvents,
} from "./transport.js";

const log = logger.scope("cloud-transport");

export class CloudAgentTransport implements AgentTransport {
  readonly sessionId: string;
  private config: CloudTransportConfig;
  private emitter = new EventEmitter();
  private abortController: AbortController | null = null;
  private connected = false;

  constructor(config: CloudTransportConfig) {
    this.sessionId = config.taskRunId;
    this.config = config;
  }

  async connect(_isReconnect: boolean): Promise<ConnectResult> {
    const { sandboxUrl, connectionToken } = this.config;

    log.info("CloudAgentTransport.connect starting", {
      sandboxUrl,
      hasToken: !!connectionToken,
      tokenLength: connectionToken?.length,
    });

    this.abortController = new AbortController();
    this.connected = true; // Must be set BEFORE startSseStream so the while loop runs

    const eventsUrl = `${sandboxUrl}/events`;
    log.info("Connecting to sandbox SSE", { url: eventsUrl });

    this.startSseStream(eventsUrl, connectionToken);

    log.info("CloudAgentTransport.connect finished", { connected: this.connected });
    return {};
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.connected) {
      try {
        await this.sendCommand("close", {});
      } catch {
        // Ignore errors when closing
      }
    }

    this.connected = false;
    this.emitter.emit("close");
  }

  async sendPrompt(prompt: ContentBlock[]): Promise<PromptOutput> {
    const textContent = prompt
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const result = await this.sendCommand("user_message", {
      content: textContent,
    });

    return {
      stopReason: (result as { stopReason?: string })?.stopReason || "end_turn",
    };
  }

  async cancelPrompt(): Promise<void> {
    await this.sendCommand("cancel", {});
  }

  async setModel(_modelId: string): Promise<void> {
    log.warn("setModel not supported in cloud transport");
  }

  async setMode(_modeId: string): Promise<void> {
    log.warn("setMode not supported in cloud transport");
  }

  respondToPermission(
    _toolCallId: string,
    _response: RequestPermissionResponse,
  ): void {
    log.warn("Permission responses not supported in cloud transport (auto-approved)");
  }

  on<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void {
    this.emitter.on(event, handler);
  }

  off<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void {
    this.emitter.off(event, handler);
  }

  private async sendCommand(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const { sandboxUrl, connectionToken } = this.config;
    const url = `${sandboxUrl}/command`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connectionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Command failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message || "Command failed");
    }

    return result.result;
  }

  private startSseStream(url: string, token: string): void {
    const fetchEvents = async () => {
      log.info("Starting SSE fetch loop", {
        url,
        connected: this.connected,
        hasAbortController: !!this.abortController,
      });

      if (!this.connected) {
        log.error("SSE loop skipped - not connected");
        return;
      }
      if (!this.abortController) {
        log.error("SSE loop skipped - no abort controller");
        return;
      }

      log.info("Entering SSE while loop");

      while (this.connected && this.abortController) {
        try {
          log.info("Fetching SSE stream", { url, tokenLength: token?.length });
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "text/event-stream",
            },
            signal: this.abortController.signal,
          });
          log.info("SSE response received", { status: response.status, ok: response.ok });

          if (!response.ok) {
            const errorText = await response.text();
            log.error("SSE connection failed", { status: response.status, error: errorText });
            throw new Error(`SSE connection failed: ${response.status} ${errorText}`);
          }

          if (!response.body) {
            throw new Error("SSE response has no body");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (this.connected) {
            const { done, value } = await reader.read();

            if (done) {
              log.info("SSE stream ended");
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                try {
                  const event = JSON.parse(data);
                  this.handleSseEvent(event);
                } catch {
                  // Not valid JSON, skip
                }
              }
            }
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") {
            log.info("SSE connection aborted");
            break;
          }

          log.error("SSE error, reconnecting in 1s", {
            error: (error as Error).message,
          });

          if (this.connected) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
    };

    fetchEvents().catch((err) => {
      log.error("SSE stream fatal error", { error: String(err), stack: err?.stack });
      this.emitter.emit("error", err);
    });
  }

  private handleSseEvent(event: Record<string, unknown>): void {
    const type = event.type as string | undefined;

    if (type === "connected") {
      log.info("SSE connected", { runId: event.run_id });
      return;
    }

    if (type === "notification") {
      const notification = event.notification as Record<string, unknown>;
      if (notification) {
        const acpMessage: AcpMessage = {
          type: "acp_message",
          ts: Date.now(),
          message: notification as unknown as AcpMessage["message"],
        };
        this.emitter.emit("message", acpMessage);
      }
      return;
    }

    // Handle raw ACP messages
    if (event.jsonrpc === "2.0") {
      const acpMessage: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: event as unknown as AcpMessage["message"],
      };
      this.emitter.emit("message", acpMessage);
    }
  }
}
