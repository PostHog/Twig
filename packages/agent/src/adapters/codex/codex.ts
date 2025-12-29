/**
 * Codex ACP Agent
 *
 * Wraps the OpenAI Codex SDK to implement the ACP Agent interface,
 * allowing Codex to be used as an alternative agent framework.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  type Agent,
  type AgentSideConnection,
  type AuthenticateRequest,
  type CancelNotification,
  type ClientCapabilities,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  RequestError,
  type SessionModelState,
  type SessionNotification,
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import {
  Codex,
  type CodexOptions,
  type CommandExecutionItem,
  type FileChangeItem,
  type McpToolCallItem,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type WebSearchItem,
} from "@openai/codex-sdk";
import { v7 as uuidv7 } from "uuid";
import type {
  SessionPersistenceConfig,
  SessionStore,
} from "@/session-store.js";
import { Logger } from "@/utils/logger.js";
import packageJson from "../../../package.json" with { type: "json" };

/**
 * Find the codex CLI binary path.
 * Checks common locations and falls back to PATH lookup.
 */
function findCodexCliPath(): string | undefined {
  // Common installation paths
  const commonPaths = [
    "/opt/homebrew/bin/codex", // macOS Apple Silicon
    "/usr/local/bin/codex", // macOS Intel / Linux
    "/usr/bin/codex", // Linux system
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Try to find via which command
  try {
    const whichResult = execSync("which codex", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (whichResult && existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // which command failed, codex not in PATH
  }

  return undefined;
}

type CodexSession = {
  thread: Thread;
  threadId?: string;
  cancelled: boolean;
  notificationHistory: SessionNotification[];
};

export class CodexAcpAgent implements Agent {
  private codex: Codex;
  private sessions: Map<string, CodexSession>;
  private client: AgentSideConnection;
  private clientCapabilities?: ClientCapabilities;
  private logger: Logger;
  private sessionStore?: SessionStore;

  constructor(client: AgentSideConnection, sessionStore?: SessionStore) {
    const codexPath = findCodexCliPath();
    const codexOptions: CodexOptions = {};

    if (codexPath) {
      codexOptions.codexPathOverride = codexPath;
    }

    let gatewayUrl = process.env.OPENAI_BASE_URL;

    if (!gatewayUrl && process.env.LLM_GATEWAY_URL) {
      const baseUrl = process.env.LLM_GATEWAY_URL;
      gatewayUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    }

    const apiKey =
      process.env.OPENAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

    if (gatewayUrl || apiKey) {
      const env: Record<string, string> = {
        PATH: process.env.PATH || "",
        HOME: process.env.HOME || "",
      };

      if (gatewayUrl) {
        env.OPENAI_BASE_URL = gatewayUrl;
      }
      if (apiKey) {
        env.OPENAI_API_KEY = apiKey;
      }

      codexOptions.env = env;
    }

    this.codex = new Codex(codexOptions);
    this.sessions = new Map();
    this.client = client;
    this.sessionStore = sessionStore;
    this.logger = new Logger({ debug: true, prefix: "[CodexAcpAgent]" });

    if (codexPath) {
      this.logger.info("Using Codex CLI", {
        path: codexPath,
        gatewayUrl: gatewayUrl || "not set",
      });
    } else {
      this.logger.warn(
        "Codex CLI not found. Install with: npm install -g @openai/codex",
      );
    }
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    return {
      protocolVersion: 1,
      agentCapabilities: {
        promptCapabilities: {
          image: true,
          embeddedContext: false,
        },
        mcpCapabilities: {
          http: false,
          sse: false,
        },
        loadSession: true,
        _meta: {
          posthog: {
            resumeSession: true,
          },
        },
      },
      agentInfo: {
        name: packageJson.name,
        title: "OpenAI Codex",
        version: packageJson.version,
      },
      authMethods: [],
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId =
      (params._meta as { sessionId?: string } | undefined)?.sessionId ||
      uuidv7();

    const threadOptions: ThreadOptions = {
      workingDirectory: params.cwd,
      sandboxMode: "danger-full-access",
      skipGitRepoCheck: true,
      approvalPolicy: "never",
    };

    this.logger.info("Starting Codex thread", {
      cwd: params.cwd,
      options: threadOptions,
    });

    const thread = this.codex.startThread(threadOptions);

    const session: CodexSession = {
      thread,
      cancelled: false,
      notificationHistory: [],
    };

    this.sessions.set(sessionId, session);

    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;
    if (persistence && this.sessionStore) {
      this.sessionStore.register(sessionId, persistence);
      this.logger.info("Registered session for S3 persistence", {
        sessionId,
        taskId: persistence.taskId,
        runId: persistence.runId,
      });
    }

    this.logger.info("Created new Codex session", { sessionId });

    const models: SessionModelState = {
      availableModels: [
        {
          modelId: "codex",
          name: "OpenAI Codex",
          description: "OpenAI Codex agent",
        },
      ],
      currentModelId: "codex",
    };

    const availableModes = [
      {
        id: "default",
        name: "Default",
        description: "Standard approval mode",
      },
    ];

    return {
      sessionId,
      models,
      modes: {
        currentModeId: "default",
        availableModes,
      },
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Authentication not implemented for Codex");
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    session.cancelled = false;

    const promptText = params.prompt
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("\n");

    this.logger.info("Running Codex prompt", {
      sessionId: params.sessionId,
      promptLength: promptText.length,
      promptPreview: promptText.substring(0, 100),
    });

    for (const chunk of params.prompt) {
      const userNotification: SessionNotification = {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk",
          content: chunk,
        },
      };
      await this.client.sessionUpdate(userNotification);
      this.appendNotification(params.sessionId, userNotification);
    }

    try {
      const streamedTurn = await session.thread.runStreamed(promptText);

      for await (const event of streamedTurn.events) {
        if (session.cancelled) {
          return { stopReason: "cancelled" };
        }

        const notifications = this.convertEventToNotifications(
          event,
          params.sessionId,
        );

        for (const notification of notifications) {
          await this.client.sessionUpdate(notification);
          this.appendNotification(params.sessionId, notification);
        }

        if (event.type === "thread.started" && "id" in event) {
          session.threadId = event.id as string;
          this.client.extNotification("_posthog/sdk_session", {
            sessionId: params.sessionId,
            sdkSessionId: event.id as string,
          });
        }
      }

      return { stopReason: "end_turn" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Codex prompt failed", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw RequestError.internalError(undefined, errorMessage);
    }
  }

  async cancel(params: CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    session.cancelled = true;
    this.logger.info("Cancelled Codex session", {
      sessionId: params.sessionId,
    });
  }

  async setSessionModel(_params: SetSessionModelRequest): Promise<void> {
    // No-op: Codex model is fixed
  }

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    if (params.modeId !== "default") {
      throw new Error(`Mode ${params.modeId} not supported by Codex`);
    }
    return {};
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.resumeSession(params);
  }

  /**
   * Resume a session without replaying history.
   * Client is responsible for fetching and rendering history from S3.
   */
  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    const { sessionId } = params;

    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;

    const existingSession = this.sessions.get(sessionId);
    const threadId = existingSession?.threadId;

    if (threadId) {
      const threadOptions: ThreadOptions = {
        workingDirectory: params.cwd,
      };

      const thread = this.codex.resumeThread(threadId, threadOptions);

      const session: CodexSession = {
        thread,
        threadId,
        cancelled: false,
        notificationHistory: existingSession?.notificationHistory || [],
      };

      this.sessions.set(sessionId, session);
      this.logger.info("Resumed Codex thread", { sessionId, threadId });

      if (persistence && this.sessionStore) {
        this.sessionStore.register(sessionId, persistence);
        this.logger.info("Registered resumed session for S3 persistence", {
          sessionId,
          taskId: persistence.taskId,
          runId: persistence.runId,
        });
      }
    } else {
      this.logger.info("No thread ID found, creating new session", {
        sessionId,
      });
      await this.newSession({
        ...params,
        _meta: { ...(params._meta || {}), sessionId, persistence },
      } as NewSessionRequest);
    }

    return {};
  }

  /**
   * Handle custom extension methods.
   * Per ACP spec, extension methods start with underscore.
   */
  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === "_posthog/session/resume") {
      await this.resumeSession(params as unknown as LoadSessionRequest);
      return {};
    }

    throw RequestError.methodNotFound(method);
  }

  private appendNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.notificationHistory.push(notification);
    }
  }

  private convertEventToNotifications(
    event: ThreadEvent,
    sessionId: string,
  ): SessionNotification[] {
    const notifications: SessionNotification[] = [];

    switch (event.type) {
      case "thread.started":
      case "turn.started":
      case "turn.completed":
        break;

      case "item.started":
        if ("item" in event && event.item) {
          const item = event.item as ThreadItem;
          notifications.push(
            ...this.itemStartedToNotifications(item, sessionId),
          );
        }
        break;

      case "item.updated":
        if ("item" in event && event.item) {
          const item = event.item as ThreadItem;
          notifications.push(
            ...this.itemUpdatedToNotifications(item, sessionId),
          );
        }
        break;

      case "item.completed":
        if ("item" in event && event.item) {
          const item = event.item as ThreadItem;
          notifications.push(
            ...this.itemCompletedToNotifications(item, sessionId),
          );
        }
        break;

      case "turn.failed":
        if ("error" in event) {
          const error = event.error as { message?: string } | undefined;
          notifications.push({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `Turn failed: ${error?.message || "Unknown error"}`,
              },
            },
          });
        }
        break;

      case "error":
        if ("message" in event) {
          notifications.push({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `Error: ${event.message || "Unknown error"}`,
              },
            },
          });
        }
        break;
    }

    return notifications;
  }

  private itemStartedToNotifications(
    item: ThreadItem,
    sessionId: string,
  ): SessionNotification[] {
    const notifications: SessionNotification[] = [];

    switch (item.type) {
      case "command_execution": {
        const cmdItem = item as CommandExecutionItem;
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: cmdItem.id,
            title: `Bash: ${this.truncateCommand(cmdItem.command)}`,
            status: "in_progress",
            rawInput: { command: cmdItem.command },
            _meta: {
              codex: {
                toolName: "Bash",
                command: cmdItem.command,
              },
            },
          },
        });
        break;
      }

      case "file_change": {
        const fileItem = item as FileChangeItem;
        const paths = fileItem.changes.map((c) => c.path).join(", ");
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: fileItem.id,
            title: `File changes: ${paths}`,
            status: "in_progress",
            rawInput: { changes: fileItem.changes },
            _meta: {
              codex: {
                toolName: "FileChange",
                changes: fileItem.changes,
              },
            },
          },
        });
        break;
      }

      case "mcp_tool_call": {
        const mcpItem = item as McpToolCallItem;
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: mcpItem.id,
            title: `MCP: ${mcpItem.server}/${mcpItem.tool}`,
            status: "in_progress",
            rawInput:
              mcpItem.arguments && typeof mcpItem.arguments === "object"
                ? (mcpItem.arguments as Record<string, unknown>)
                : undefined,
            _meta: {
              codex: {
                toolName: "McpToolCall",
                server: mcpItem.server,
                tool: mcpItem.tool,
              },
            },
          },
        });
        break;
      }

      case "web_search": {
        const searchItem = item as WebSearchItem;
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: searchItem.id,
            title: `Web Search: ${searchItem.query}`,
            status: "in_progress",
            rawInput: { query: searchItem.query },
            _meta: {
              codex: {
                toolName: "WebSearch",
                query: searchItem.query,
              },
            },
          },
        });
        break;
      }
    }

    return notifications;
  }

  private itemUpdatedToNotifications(
    item: ThreadItem,
    sessionId: string,
  ): SessionNotification[] {
    const notifications: SessionNotification[] = [];

    if (item.type === "command_execution") {
      const cmdItem = item as CommandExecutionItem;
      if (cmdItem.aggregated_output) {
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: cmdItem.id,
            status: "in_progress",
            _meta: {
              codex: {
                toolName: "Bash",
                output: cmdItem.aggregated_output,
              },
            },
          },
        });
      }
    }

    return notifications;
  }

  private itemCompletedToNotifications(
    item: ThreadItem,
    sessionId: string,
  ): SessionNotification[] {
    const notifications: SessionNotification[] = [];

    switch (item.type) {
      case "agent_message": {
        const text = (item as { text?: string }).text;
        if (text) {
          notifications.push({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text,
              },
            },
          });
        }
        break;
      }

      case "reasoning": {
        const text = (item as { text?: string }).text;
        if (text) {
          notifications.push({
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: {
                type: "text",
                text,
              },
            },
          });
        }
        break;
      }

      case "command_execution": {
        const cmdItem = item as CommandExecutionItem;
        const success = cmdItem.exit_code === 0;
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: cmdItem.id,
            status: success ? "completed" : "failed",
            _meta: {
              codex: {
                toolName: "Bash",
                exitCode: cmdItem.exit_code,
                output: cmdItem.aggregated_output,
              },
            },
          },
        });
        break;
      }

      case "file_change": {
        const fileItem = item as FileChangeItem;
        const success = fileItem.status === "completed";
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: fileItem.id,
            status: success ? "completed" : "failed",
            _meta: {
              codex: {
                toolName: "FileChange",
                changes: fileItem.changes,
              },
            },
          },
        });
        break;
      }

      case "mcp_tool_call": {
        const mcpItem = item as McpToolCallItem;
        const success = mcpItem.status === "completed";
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: mcpItem.id,
            status: success ? "completed" : "failed",
            _meta: {
              codex: {
                toolName: "McpToolCall",
                server: mcpItem.server,
                tool: mcpItem.tool,
                result: mcpItem.result,
                error: mcpItem.error,
              },
            },
          },
        });
        break;
      }

      case "web_search": {
        const searchItem = item as WebSearchItem;
        notifications.push({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: searchItem.id,
            status: "completed",
            _meta: {
              codex: {
                toolName: "WebSearch",
                query: searchItem.query,
              },
            },
          },
        });
        break;
      }

      case "error": {
        const errorItem = item as { id: string; message?: string };
        if (errorItem.message) {
          notifications.push({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `Error: ${errorItem.message}`,
              },
            },
          });
        }
        break;
      }
    }

    return notifications;
  }

  private truncateCommand(command: string, maxLength = 50): string {
    if (command.length <= maxLength) {
      return command;
    }
    return `${command.substring(0, maxLength)}...`;
  }
}
