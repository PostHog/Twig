/**
 * Pure transformation functions for session data.
 * No side effects, no store access - just data transformations.
 */
import type {
  AvailableCommand,
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EXECUTION_MODES, type ExecutionMode } from "@shared/types";
import type {
  AcpMessage,
  JsonRpcMessage,
  StoredLogEntry,
  UserShellExecuteParams,
} from "@shared/types/session-events";
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
} from "@shared/types/session-events";
import { includesAny } from "./string";

/**
 * Get available execution modes based on user permissions.
 */
export function getExecutionModes(
  allowBypassPermissions: boolean,
): ExecutionMode[] {
  return allowBypassPermissions
    ? EXECUTION_MODES
    : EXECUTION_MODES.filter((m) => m !== "bypassPermissions");
}

/**
 * Cycle to the next execution mode.
 */
export function cycleExecutionMode(
  current: ExecutionMode,
  allowBypassPermissions: boolean,
): ExecutionMode {
  const modes = getExecutionModes(allowBypassPermissions);
  const currentIndex = modes.indexOf(current);
  if (currentIndex === -1) {
    return "default";
  }
  const nextIndex = (currentIndex + 1) % modes.length;
  return modes[nextIndex];
}

/**
 * Convert a stored log entry to an ACP message.
 */
export function storedEntryToAcpMessage(entry: StoredLogEntry): AcpMessage {
  return {
    type: "acp_message",
    ts: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
    message: (entry.notification ?? {}) as JsonRpcMessage,
  };
}

/**
 * Create a user message event for display.
 */
export function createUserMessageEvent(text: string, ts: number): AcpMessage {
  return {
    type: "acp_message",
    ts,
    message: {
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text },
        },
      } as SessionNotification,
    },
  };
}

/**
 * Create a user shell execute event.
 * When id is provided, it's used to track async execution (start/complete).
 * When result is undefined, it represents a command that's still running.
 */
export function createUserShellExecuteEvent(
  command: string,
  cwd: string,
  result?: { stdout: string; stderr: string; exitCode: number },
  id?: string,
): AcpMessage {
  return {
    type: "acp_message",
    ts: Date.now(),
    message: {
      jsonrpc: "2.0",
      method: "_array/user_shell_execute",
      params: { id, command, cwd, result },
    },
  };
}

/**
 * Collects completed user shell executes that occurred after the last prompt request.
 * These are included as hidden context in the next prompt so the agent
 * knows what commands the user ran between turns.
 *
 * Scans backwards from the end of events, stopping at the most recent
 * session/prompt request (not response), collecting any _array/user_shell_execute
 * notifications found along the way. Deduplicates by ID, keeping only completed executes.
 */
export function getUserShellExecutesSinceLastPrompt(
  events: AcpMessage[],
): UserShellExecuteParams[] {
  const execMap = new Map<string, UserShellExecuteParams>();

  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;

    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") break;

    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_array/user_shell_execute"
    ) {
      const params = msg.params as UserShellExecuteParams;
      if (params.result && params.id && !execMap.has(params.id)) {
        execMap.set(params.id, params);
      }
    }
  }

  return Array.from(execMap.values()).reverse();
}

/**
 * Convert shell executes to content blocks for prompt context.
 */
export function shellExecutesToContextBlocks(
  shellExecutes: UserShellExecuteParams[],
): ContentBlock[] {
  return shellExecutes
    .filter((cmd) => cmd.result)
    .map((cmd) => ({
      type: "text" as const,
      text: `[User executed command in ${cmd.cwd}]\n$ ${cmd.command}\n${
        cmd.result?.stdout || cmd.result?.stderr || "(no output)"
      }`,
      _meta: { ui: { hidden: true } },
    }));
}

/**
 * Convert stored log entries to ACP messages.
 * Optionally prepends a user message with the task description.
 */
export function convertStoredEntriesToEvents(
  entries: StoredLogEntry[],
  taskDescription?: string,
): AcpMessage[] {
  const events: AcpMessage[] = [];

  if (taskDescription) {
    const startTs = entries[0]?.timestamp
      ? new Date(entries[0].timestamp).getTime() - 1
      : Date.now();
    events.push(createUserMessageEvent(taskDescription, startTs));
  }

  for (const entry of entries) {
    events.push(storedEntryToAcpMessage(entry));
  }

  return events;
}

/**
 * Extract available commands from session events.
 * Scans backwards to find the most recent available_commands_update.
 */
export function extractAvailableCommandsFromEvents(
  events: AcpMessage[],
): AvailableCommand[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;
    if (
      "method" in msg &&
      msg.method === "session/update" &&
      !("id" in msg) &&
      "params" in msg
    ) {
      const params = msg.params as SessionNotification | undefined;
      const update = params?.update;
      if (update?.sessionUpdate === "available_commands_update") {
        return update.availableCommands || [];
      }
    }
  }
  return [];
}

/**
 * Extract user prompts from session events.
 * Returns an array of user prompt strings, most recent last.
 */
export function extractUserPromptsFromEvents(events: AcpMessage[]): string[] {
  const prompts: string[] = [];

  for (const event of events) {
    const msg = event.message;
    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      const params = msg.params as { prompt?: ContentBlock[] };
      if (params?.prompt?.length) {
        // Find first visible text block (skip hidden context blocks)
        const textBlock = params.prompt.find((b) => {
          if (b.type !== "text") return false;
          const meta = (b as { _meta?: { ui?: { hidden?: boolean } } })._meta;
          return !meta?.ui?.hidden;
        });
        if (textBlock && textBlock.type === "text") {
          prompts.push(textBlock.text);
        }
      }
    }
  }

  return prompts;
}

/**
 * Extract prompt text from ContentBlocks, filtering out hidden blocks.
 */
export function extractPromptText(prompt: string | ContentBlock[]): string {
  if (typeof prompt === "string") return prompt;

  return (prompt as ContentBlock[])
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

/**
 * Convert prompt input to ContentBlocks.
 */
export function normalizePromptToBlocks(
  prompt: string | ContentBlock[],
): ContentBlock[] {
  return typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;
}

/**
 * Error patterns that indicate a fatal session error requiring restart.
 * These errors mean the underlying session/process is unrecoverable.
 */
const FATAL_SESSION_ERROR_PATTERNS = [
  "Internal error",
  "process exited",
  "Session did not end",
  "not ready for writing",
  "Session not found",
] as const;

/**
 * Check if a prompt error is fatal (session unrecoverable).
 * Fatal errors require session restart rather than simple retry.
 */
export function isFatalSessionError(
  errorMessage: string,
  errorDetails?: string,
): boolean {
  return (
    includesAny(errorMessage, FATAL_SESSION_ERROR_PATTERNS) ||
    includesAny(errorDetails, FATAL_SESSION_ERROR_PATTERNS)
  );
}
