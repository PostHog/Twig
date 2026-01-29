import type { ContentBlock } from "@agentclientprotocol/sdk";
import { Saga } from "@posthog/shared";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import { TreeTracker } from "../tree-tracker.js";
import type {
  DeviceInfo,
  StoredNotification,
  TreeSnapshotEvent,
} from "../types.js";
import { Logger } from "../utils/logger.js";

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

export interface ResumeInput {
  taskId: string;
  runId: string;
  repositoryPath: string;
  apiClient: PostHogAPIClient;
  logger?: Logger;
}

export interface ResumeOutput {
  conversation: ConversationTurn[];
  latestSnapshot: TreeSnapshotEvent | null;
  snapshotApplied: boolean;
  interrupted: boolean;
  lastDevice?: DeviceInfo;
  logEntryCount: number;
}

export class ResumeSaga extends Saga<ResumeInput, ResumeOutput> {
  protected async execute(input: ResumeInput): Promise<ResumeOutput> {
    const { taskId, runId, repositoryPath, apiClient } = input;
    const logger =
      input.logger || new Logger({ debug: false, prefix: "[Resume]" });

    // Step 1: Fetch task run (read-only)
    const taskRun = await this.readOnlyStep("fetch_task_run", () =>
      apiClient.getTaskRun(taskId, runId),
    );

    if (!taskRun.log_url) {
      this.log.info("No log URL found, starting fresh");
      return this.emptyResult();
    }

    // Step 2: Fetch log entries (read-only)
    const entries = await this.readOnlyStep("fetch_logs", () =>
      apiClient.fetchTaskRunLogs(taskRun),
    );

    if (entries.length === 0) {
      this.log.info("No log entries found, starting fresh");
      return this.emptyResult();
    }

    this.log.info("Fetched log entries", { count: entries.length });

    // Step 3: Find latest snapshot (read-only, pure computation)
    const latestSnapshot = await this.readOnlyStep("find_snapshot", () =>
      Promise.resolve(this.findLatestTreeSnapshot(entries)),
    );

    // Step 4: Apply snapshot if present (wrapped in step for consistent logging)
    // Note: We use a try/catch inside the step because snapshot failure should NOT fail the saga
    let snapshotApplied = false;
    if (latestSnapshot?.archiveUrl) {
      this.log.info("Found tree snapshot", {
        treeHash: latestSnapshot.treeHash,
        hasArchiveUrl: true,
        changes: latestSnapshot.changes?.length ?? 0,
        interrupted: latestSnapshot.interrupted,
      });

      await this.step({
        name: "apply_snapshot",
        execute: async () => {
          const treeTracker = new TreeTracker({
            repositoryPath,
            taskId,
            runId,
            apiClient,
            logger: logger.child("TreeTracker"),
          });

          try {
            await treeTracker.applyTreeSnapshot(latestSnapshot);
            treeTracker.setLastTreeHash(latestSnapshot.treeHash);
            snapshotApplied = true;
            this.log.info("Tree snapshot applied successfully", {
              treeHash: latestSnapshot.treeHash,
            });
          } catch (error) {
            // Log but don't fail - continue with conversation rebuild
            // ApplySnapshotSaga handles its own rollback internally
            this.log.warn(
              "Failed to apply tree snapshot, continuing without it",
              {
                error: error instanceof Error ? error.message : String(error),
                treeHash: latestSnapshot.treeHash,
              },
            );
          }
        },
        rollback: async () => {
          // Inner ApplySnapshotSaga handles its own rollback
        },
      });
    } else if (latestSnapshot) {
      this.log.warn(
        "Snapshot found but has no archive URL - files cannot be restored",
        {
          treeHash: latestSnapshot.treeHash,
          changes: latestSnapshot.changes?.length ?? 0,
        },
      );
    }

    // Step 5: Rebuild conversation (read-only, pure computation)
    const conversation = await this.readOnlyStep("rebuild_conversation", () =>
      Promise.resolve(this.rebuildConversation(entries)),
    );

    // Step 6: Find device info (read-only, pure computation)
    const lastDevice = await this.readOnlyStep("find_device", () =>
      Promise.resolve(this.findLastDeviceInfo(entries)),
    );

    this.log.info("Resume state rebuilt", {
      turns: conversation.length,
      hasSnapshot: !!latestSnapshot,
      snapshotApplied,
      interrupted: latestSnapshot?.interrupted ?? false,
    });

    return {
      conversation,
      latestSnapshot,
      snapshotApplied,
      interrupted: latestSnapshot?.interrupted ?? false,
      lastDevice,
      logEntryCount: entries.length,
    };
  }

  private emptyResult(): ResumeOutput {
    return {
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    };
  }

  private findLatestTreeSnapshot(
    entries: StoredNotification[],
  ): TreeSnapshotEvent | null {
    const sdkPrefixedMethod = `_${POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT}`;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const method = entry.notification?.method;
      if (
        method === sdkPrefixedMethod ||
        method === POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT
      ) {
        const params = entry.notification.params as
          | TreeSnapshotEvent
          | undefined;
        if (params?.treeHash) {
          return params;
        }
      }
    }
    return null;
  }

  private findLastDeviceInfo(
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

  private rebuildConversation(
    entries: StoredNotification[],
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

            const content = update.content as ContentBlock | ContentBlock[];
            const contentArray = Array.isArray(content) ? content : [content];
            turns.push({
              role: "user",
              content: contentArray,
            });
            break;
          }

          case "agent_message_chunk": {
            const content = update.content as ContentBlock | undefined;
            if (content) {
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
            const meta = (update._meta as Record<string, unknown>)
              ?.claudeCode as Record<string, unknown> | undefined;
            if (meta) {
              const toolCallId = meta.toolCallId as string | undefined;
              const toolName = meta.toolName as string | undefined;
              const toolInput = meta.toolInput;
              const toolResponse = meta.toolResponse;

              if (toolCallId && toolName) {
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

                if (toolResponse !== undefined) {
                  toolCall.result = toolResponse;
                }
              }
            }
            break;
          }

          case "tool_result": {
            const meta = (update._meta as Record<string, unknown>)
              ?.claudeCode as Record<string, unknown> | undefined;
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

    if (currentAssistantContent.length > 0 || currentToolCalls.length > 0) {
      turns.push({
        role: "assistant",
        content: currentAssistantContent,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
      });
    }

    return turns;
  }
}
