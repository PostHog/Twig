/**
 * Resume - Restore agent state from persisted log
 *
 * Handles resuming a task from any point:
 * - Fetches log from S3
 * - Finds latest tree_snapshot event
 * - Rebuilds conversation from log events
 * - Restores working tree from snapshot
 *
 * The log is the single source of truth for:
 * - Conversation history (user_message, agent_message_chunk, tool_call, tool_result)
 * - Working tree state (tree_snapshot events)
 * - Session metadata (device info, mode changes)
 */

import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { PostHogAPIClient } from "./posthog-api.js";
import { TreeTracker } from "./tree-tracker.js";
import type {
  DeviceInfo,
  StoredNotification,
  TreeSnapshotEvent,
} from "./types.js";
import { Logger } from "./utils/logger.js";

export interface ResumeState {
  conversation: ConversationTurn[];
  latestSnapshot: TreeSnapshotEvent | null;
  interrupted: boolean;
  lastDevice?: DeviceInfo;
  logEntryCount: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: ContentBlock[];
  toolCalls?: ToolCallInfo[];
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: unknown;
  result?: unknown;
}

export interface ResumeConfig {
  taskId: string;
  runId: string;
  repositoryPath: string;
  apiClient: PostHogAPIClient;
  logger?: Logger;
}

/**
 * Resume a task from its persisted log.
 * Returns the rebuilt state for the agent to continue from.
 */
export async function resumeFromLog(
  config: ResumeConfig,
): Promise<ResumeState> {
  const logger =
    config.logger || new Logger({ debug: false, prefix: "[Resume]" });

  logger.info("Resuming from log", {
    taskId: config.taskId,
    runId: config.runId,
  });

  // 1. Fetch task run to get log URL
  const taskRun = await config.apiClient.getTaskRun(
    config.taskId,
    config.runId,
  );

  if (!taskRun.log_url) {
    logger.info("No log URL found, starting fresh");
    return {
      conversation: [],
      latestSnapshot: null,
      interrupted: false,
      logEntryCount: 0,
    };
  }

  // 2. Fetch log entries from S3
  const entries = await config.apiClient.fetchTaskRunLogs(taskRun);

  if (entries.length === 0) {
    logger.info("No log entries found, starting fresh");
    return {
      conversation: [],
      latestSnapshot: null,
      interrupted: false,
      logEntryCount: 0,
    };
  }

  logger.info("Fetched log entries", { count: entries.length });

  // 3. Find latest tree snapshot
  const latestSnapshot = findLatestTreeSnapshot(entries);

  // 4. Apply tree snapshot if present
  if (latestSnapshot) {
    logger.info("Found tree snapshot", {
      treeHash: latestSnapshot.treeHash,
      hasArchiveUrl: !!latestSnapshot.archiveUrl,
      filesChanged: latestSnapshot.filesChanged?.length ?? 0,
      filesDeleted: latestSnapshot.filesDeleted?.length ?? 0,
      interrupted: latestSnapshot.interrupted,
    });

    // Warn if snapshot has no archive URL (can't restore files)
    if (!latestSnapshot.archiveUrl) {
      logger.warn(
        "Snapshot found but has no archive URL - files cannot be restored",
        {
          treeHash: latestSnapshot.treeHash,
          filesChanged: latestSnapshot.filesChanged?.length ?? 0,
        },
      );
    } else {
      const treeTracker = new TreeTracker({
        repositoryPath: config.repositoryPath,
        taskId: config.taskId,
        runId: config.runId,
        apiClient: config.apiClient,
        logger: logger.child("TreeTracker"),
      });

      try {
        await treeTracker.applyTreeSnapshot(latestSnapshot);
        treeTracker.setLastTreeHash(latestSnapshot.treeHash);
        logger.info("Tree snapshot applied successfully", {
          treeHash: latestSnapshot.treeHash,
        });
      } catch (error) {
        logger.warn("Failed to apply tree snapshot, continuing without it", {
          error,
          treeHash: latestSnapshot.treeHash,
        });
      }
    }
  }

  // 5. Rebuild conversation from log
  const conversation = rebuildConversation(entries, logger);

  // 6. Find last device info
  const lastDevice = findLastDeviceInfo(entries);

  logger.info("Resume state rebuilt", {
    turns: conversation.length,
    hasSnapshot: !!latestSnapshot,
    interrupted: latestSnapshot?.interrupted ?? false,
  });

  return {
    conversation,
    latestSnapshot,
    interrupted: latestSnapshot?.interrupted ?? false,
    lastDevice,
    logEntryCount: entries.length,
  };
}

/**
 * Find the latest tree_snapshot event in the log.
 */
function findLatestTreeSnapshot(
  entries: StoredNotification[],
): TreeSnapshotEvent | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    // Note: snapshots can be written two ways:
    // 1. Via extNotification (ACP SDK adds underscore prefix) → __posthog/tree_snapshot
    // 2. Via direct API call → _posthog/tree_snapshot
    const method = entry.notification?.method;
    if (
      method === "__posthog/tree_snapshot" ||
      method === "_posthog/tree_snapshot"
    ) {
      const params = entry.notification.params as TreeSnapshotEvent | undefined;
      if (params?.treeHash) {
        return params;
      }
    }
  }
  return null;
}

/**
 * Find the last device info from log entries.
 */
function findLastDeviceInfo(
  entries: StoredNotification[],
): DeviceInfo | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const params = entry.notification?.params as
      | { device?: DeviceInfo }
      | undefined;
    if (params?.device) {
      return params.device;
    }
  }
  return undefined;
}

/**
 * Rebuild conversation turns from log entries.
 * Parses session/update events to extract user messages, assistant messages, and tool calls.
 */
function rebuildConversation(
  entries: StoredNotification[],
  logger: Logger,
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentAssistantContent: ContentBlock[] = [];
  let currentToolCalls: ToolCallInfo[] = [];

  for (const entry of entries) {
    const method = entry.notification?.method;
    const params = entry.notification?.params as Record<string, unknown>;

    if (method === "session/update" && params?.update) {
      const update = params.update as Record<string, unknown>;
      const sessionUpdate = update.sessionUpdate as string;

      switch (sessionUpdate) {
        case "user_message":
        case "user_message_chunk": {
          // Flush any pending assistant content
          if (
            currentAssistantContent.length > 0 ||
            currentToolCalls.length > 0
          ) {
            turns.push({
              role: "assistant",
              content: currentAssistantContent,
              toolCalls:
                currentToolCalls.length > 0 ? currentToolCalls : undefined,
            });
            currentAssistantContent = [];
            currentToolCalls = [];
          }

          // Add user turn
          const content = update.content as ContentBlock | ContentBlock[];
          const contentArray = Array.isArray(content) ? content : [content];
          turns.push({
            role: "user",
            content: contentArray,
          });
          break;
        }

        case "agent_message_chunk": {
          // Accumulate assistant content
          const content = update.content as ContentBlock | undefined;
          if (content) {
            // Merge text blocks if possible
            if (
              content.type === "text" &&
              currentAssistantContent.length > 0 &&
              currentAssistantContent[currentAssistantContent.length - 1]
                .type === "text"
            ) {
              const lastBlock = currentAssistantContent[
                currentAssistantContent.length - 1
              ] as { type: "text"; text: string };
              lastBlock.text += (
                content as { type: "text"; text: string }
              ).text;
            } else {
              currentAssistantContent.push(content);
            }
          }
          break;
        }

        case "tool_call":
        case "tool_call_update": {
          const meta = (update._meta as Record<string, unknown>)?.claudeCode as
            | Record<string, unknown>
            | undefined;
          if (meta) {
            const toolCallId = meta.toolCallId as string | undefined;
            const toolName = meta.toolName as string | undefined;
            const toolInput = meta.toolInput;
            const toolResponse = meta.toolResponse;

            if (toolCallId && toolName) {
              // Find or create tool call entry
              let toolCall = currentToolCalls.find(
                (tc) => tc.toolCallId === toolCallId,
              );
              if (!toolCall) {
                toolCall = {
                  toolCallId,
                  toolName,
                  input: toolInput,
                };
                currentToolCalls.push(toolCall);
              }

              // Update with result if present
              if (toolResponse !== undefined) {
                toolCall.result = toolResponse;
              }
            }
          }
          break;
        }

        case "tool_result": {
          const meta = (update._meta as Record<string, unknown>)?.claudeCode as
            | Record<string, unknown>
            | undefined;
          if (meta) {
            const toolCallId = meta.toolCallId as string | undefined;
            const toolResponse = meta.toolResponse;

            if (toolCallId) {
              const toolCall = currentToolCalls.find(
                (tc) => tc.toolCallId === toolCallId,
              );
              if (toolCall && toolResponse !== undefined) {
                toolCall.result = toolResponse;
              }
            }
          }
          break;
        }
      }
    }
  }

  // Flush any remaining assistant content
  if (currentAssistantContent.length > 0 || currentToolCalls.length > 0) {
    turns.push({
      role: "assistant",
      content: currentAssistantContent,
      toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
    });
  }

  logger.debug("Rebuilt conversation", {
    turns: turns.length,
    userTurns: turns.filter((t) => t.role === "user").length,
    assistantTurns: turns.filter((t) => t.role === "assistant").length,
  });

  return turns;
}

/**
 * Convert resumed conversation back to API format for continuation.
 */
export function conversationToPromptHistory(
  conversation: ConversationTurn[],
): Array<{ role: "user" | "assistant"; content: ContentBlock[] }> {
  return conversation.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
}
