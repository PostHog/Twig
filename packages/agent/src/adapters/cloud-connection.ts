/**
 * CloudConnection - SSE-based transport for cloud agent execution
 *
 * This class implements communication with a cloud-hosted agent via SSE (Server-Sent Events).
 * It follows the Streamable HTTP pattern:
 * - GET /sync - Opens SSE stream to receive events from the agent
 * - POST /sync - Sends messages to the agent
 */

import { Logger } from "@/utils/logger.js";

export interface CloudConnectionConfig {
  apiHost: string;
  apiKey: string;
  projectId: number;
  taskId: string;
  runId: string;
}

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface CloudConnectionEvents {
  onEvent: (event: JsonRpcMessage) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class CloudConnection {
  private config: CloudConnectionConfig;
  private events: CloudConnectionEvents;
  private logger: Logger;
  private abortController: AbortController | null = null;
  private lastEventId: string | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(config: CloudConnectionConfig, events: CloudConnectionEvents) {
    this.config = config;
    this.events = events;
    this.logger = new Logger({ debug: true, prefix: "[CloudConnection]" });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.warn("Already connected");
      return;
    }

    this.abortController = new AbortController();

    try {
      await this.startSSEStream();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.events.onConnect?.();
    } catch (error) {
      this.logger.error("Failed to connect", { error });
      this.events.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.abortController?.abort();
    this.abortController = null;
    this.events.onDisconnect?.();
  }

  async sendMessage(message: JsonRpcMessage): Promise<void> {
    const url = this.buildSyncUrl();
    this.logger.info("Sending message to cloud", {
      url,
      method: message.method,
      params: message.params,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "Session-Id": this.config.runId,
      },
      body: JSON.stringify(message),
    });

    this.logger.info("Message sent, response status", {
      status: response.status,
    });

    if (response.status !== 202) {
      const text = await response.text();
      this.logger.error("Failed to send message", {
        status: response.status,
        text,
      });
      throw new Error(`Failed to send message: ${response.status} ${text}`);
    }
  }

  async prompt(content: string): Promise<void> {
    await this.sendMessage({
      jsonrpc: "2.0",
      method: "_posthog/user_message",
      params: { content },
    });
  }

  async cancel(): Promise<void> {
    await this.sendMessage({
      jsonrpc: "2.0",
      method: "_posthog/cancel",
      params: {},
    });
  }

  async close(): Promise<void> {
    try {
      await this.sendMessage({
        jsonrpc: "2.0",
        method: "_posthog/close",
        params: {},
      });
    } catch {
      // Ignore errors when closing
    }
    await this.disconnect();
  }

  private async startSSEStream(): Promise<void> {
    const url = this.buildSyncUrl();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "text/event-stream",
      "Session-Id": this.config.runId,
    };

    if (this.lastEventId) {
      headers["Last-Event-ID"] = this.lastEventId;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body for SSE stream");
    }

    // Process the SSE stream
    this.processSSEStream(response.body);
  }

  private async processSSEStream(
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    this.logger.info("[SSE_STREAM] Starting to process SSE stream");

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.logger.info("[SSE_STREAM] Stream ended (done=true)");
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        this.logger.debug("[SSE_STREAM] Received chunk", {
          length: chunk.length,
          chunk: chunk.substring(0, 200),
        });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEventId: string | null = null;
        let currentData: string | null = null;

        for (const line of lines) {
          if (line.startsWith("id:")) {
            currentEventId = line.slice(3).trim();
            this.logger.debug("[SSE_STREAM] Parsed event ID", {
              eventId: currentEventId,
            });
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
            this.logger.debug("[SSE_STREAM] Parsed data line", {
              dataLength: currentData.length,
            });
          } else if (line === "" && currentData) {
            // Empty line signals end of event
            this.logger.info("[SSE_STREAM] Complete event received", {
              eventId: currentEventId,
              dataPreview: currentData.substring(0, 100),
            });
            try {
              const message = JSON.parse(currentData) as JsonRpcMessage;
              this.logger.info("[SSE_STREAM] Parsed message", {
                method: message.method,
                hasParams: !!message.params,
              });
              if (currentEventId) {
                this.lastEventId = currentEventId;
              }
              // Route all events through onEvent handler
              this.logger.info("[SSE_STREAM] Routing to onEvent handler", {
                method: message.method,
              });
              this.events.onEvent(message);
            } catch (error) {
              this.logger.warn("[SSE_STREAM] Failed to parse SSE event", {
                data: currentData,
                error,
              });
            }
            currentEventId = null;
            currentData = null;
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.logger.info("SSE stream aborted");
        return;
      }

      this.logger.error("SSE stream error", { error });
      this.events.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );

      // Attempt reconnection
      await this.attemptReconnect();
    } finally {
      reader.releaseLock();
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.isConnected) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("Max reconnect attempts reached");
      this.isConnected = false;
      this.events.onDisconnect?.();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.logger.info("Attempting reconnect", {
      attempt: this.reconnectAttempts,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      this.abortController = new AbortController();
      await this.startSSEStream();
      this.reconnectAttempts = 0;
      this.logger.info("Reconnected successfully");
    } catch (error) {
      this.logger.error("Reconnect failed", { error });
      await this.attemptReconnect();
    }
  }

  private buildSyncUrl(): string {
    const { apiHost, projectId, taskId, runId } = this.config;
    return `${apiHost}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/sync`;
  }

  getLastEventId(): string | null {
    return this.lastEventId;
  }

  isActive(): boolean {
    return this.isConnected;
  }
}
