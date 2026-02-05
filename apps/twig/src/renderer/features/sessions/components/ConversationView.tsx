import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import {
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import { useSessionViewActions } from "@features/sessions/stores/sessionViewStore";
import type { SessionUpdate, ToolCall } from "@features/sessions/types";
import { ArrowDown, XCircle } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  type UserShellExecuteParams,
} from "@shared/types/session-events";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GitActionMessage, parseGitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { SessionFooter } from "./SessionFooter";
import { QueuedMessageView } from "./session-update/QueuedMessageView";
import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";
import { UserMessage } from "./session-update/UserMessage";
import {
  type UserShellExecute,
  UserShellExecuteView,
} from "./session-update/UserShellExecuteView";

interface Turn {
  type: "turn";
  id: string;
  promptId: number;
  userContent: string;
  items: RenderItem[];
  isComplete: boolean;
  stopReason?: string;
  interruptReason?: string;
  durationMs: number;
  toolCalls: Map<string, ToolCall>;
}

type ConversationItem = Turn | UserShellExecute;

interface ConversationViewProps {
  events: AcpMessage[];
  isPromptPending: boolean;
  promptStartedAt?: number | null;
  repoPath?: string | null;
  isCloud?: boolean;
  taskId?: string;
}

const SCROLL_THRESHOLD = 100;
const SHOW_BUTTON_THRESHOLD = 300;

export function ConversationView({
  events,
  isPromptPending,
  promptStartedAt,
  repoPath,
  isCloud = false,
  taskId,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildConversationItems(events), [events]);
  const lastTurn = items.filter((i): i is Turn => i.type === "turn").pop();

  const pendingPermissions = usePendingPermissionsForTask(taskId ?? "");
  const pendingPermissionsCount = pendingPermissions.size;

  const queuedMessages = useQueuedMessagesForTask(taskId);
  const { removeQueuedMessage } = useSessionActions();
  const { saveScrollPosition, getScrollPosition } = useSessionViewActions();

  const prevItemsLengthRef = useRef(0);
  const prevPendingCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const hasRestoredScrollRef = useRef(false);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !taskId) return;

    const handleScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(distanceFromBottom > SHOW_BUTTON_THRESHOLD);
      saveScrollPosition(taskId, el.scrollTop);
    };

    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      saveScrollPosition(taskId, el.scrollTop);
    };
  }, [taskId, saveScrollPosition]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !taskId) return;

    if (!hasRestoredScrollRef.current) {
      const savedPosition = getScrollPosition(taskId);
      if (savedPosition > 0) {
        el.scrollTop = savedPosition;
        hasRestoredScrollRef.current = true;
        return;
      }
    }

    const isNewContent = items.length > prevItemsLengthRef.current;
    const isNewPending = pendingPermissionsCount > prevPendingCountRef.current;
    prevItemsLengthRef.current = items.length;
    prevPendingCountRef.current = pendingPermissionsCount;

    const prevScrollHeight = prevScrollHeightRef.current || el.scrollHeight;
    const wasNearBottom =
      prevScrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
    prevScrollHeightRef.current = el.scrollHeight;

    if (wasNearBottom || isNewContent || isNewPending) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items, pendingPermissionsCount, taskId, getScrollPosition]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto bg-gray-1 p-2 pb-16"
      >
        <div className="mx-auto max-w-[750px]">
          <div className="flex flex-col gap-3">
            {items.map((item) =>
              item.type === "turn" ? (
                <TurnView
                  key={item.id}
                  turn={item}
                  repoPath={repoPath}
                  isCloud={isCloud}
                />
              ) : (
                <UserShellExecuteView key={item.id} item={item} />
              ),
            )}
            {queuedMessages.map((msg) => (
              <QueuedMessageView
                key={msg.id}
                message={msg}
                onRemove={() => taskId && removeQueuedMessage(taskId, msg.id)}
              />
            ))}
          </div>
          <SessionFooter
            isPromptPending={isPromptPending}
            promptStartedAt={promptStartedAt}
            lastGenerationDuration={
              lastTurn?.isComplete ? lastTurn.durationMs : null
            }
            lastStopReason={lastTurn?.stopReason}
            queuedCount={queuedMessages.length}
            hasPendingPermission={pendingPermissionsCount > 0}
          />
        </div>
      </div>
      {showScrollButton && (
        <Box className="absolute right-4 bottom-4 z-10">
          <Button size="1" variant="solid" onClick={scrollToBottom}>
            <ArrowDown size={14} weight="bold" />
            Scroll to bottom
          </Button>
        </Box>
      )}
    </div>
  );
}

interface TurnViewProps {
  turn: Turn;
  repoPath?: string | null;
  isCloud?: boolean;
}

function getInterruptMessage(reason?: string): string {
  switch (reason) {
    case "moving_to_worktree":
      return "Paused while worktree is focused";
    default:
      return "Interrupted by user";
  }
}

const TurnView = memo(function TurnView({
  turn,
  repoPath,
  isCloud = false,
}: TurnViewProps) {
  const wasCancelled = turn.stopReason === "cancelled";
  const gitAction = parseGitActionMessage(turn.userContent);
  const showGitResult =
    gitAction.isGitAction && gitAction.actionType && turn.isComplete;

  const showUserMessage = turn.userContent.trim().length > 0;

  // Check if a compacting status should show as complete
  // (complete if there are items after it in the turn)
  const isCompactingComplete = (index: number, item: RenderItem) => {
    if (
      item.sessionUpdate === "status" &&
      (item as { status?: string }).status === "compacting"
    ) {
      return index < turn.items.length - 1;
    }
    return false;
  };

  return (
    <Box className="flex flex-col gap-2">
      {showUserMessage &&
        (gitAction.isGitAction && gitAction.actionType ? (
          <GitActionMessage actionType={gitAction.actionType} />
        ) : (
          <UserMessage content={turn.userContent} />
        ))}
      {turn.items.map((item, i) => {
        // For status items, compute isComplete at render time
        const renderItem =
          item.sessionUpdate === "status" &&
          (item as { status?: string }).status === "compacting"
            ? { ...item, isComplete: isCompactingComplete(i, item) }
            : item;
        return (
          <SessionUpdateView
            key={`${item.sessionUpdate}-${i}`}
            item={renderItem}
            toolCalls={turn.toolCalls}
            turnCancelled={wasCancelled}
            turnComplete={turn.isComplete}
          />
        );
      })}
      {showGitResult && repoPath && gitAction.actionType && (
        <GitActionResult
          actionType={gitAction.actionType}
          repoPath={repoPath}
          turnId={turn.id}
          isCloud={isCloud}
        />
      )}
      {wasCancelled && (
        <Box className="border-gray-4 border-l-2 py-0.5 pl-3">
          <Flex align="center" gap="2" className="text-gray-9">
            <XCircle size={14} />
            <Text size="1" color="gray">
              {getInterruptMessage(turn.interruptReason)}
            </Text>
          </Flex>
        </Box>
      )}
    </Box>
  );
});

// --- Event Processing ---

function buildConversationItems(events: AcpMessage[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  let currentTurn: Turn | null = null;
  // Map prompt request IDs to their turns for matching responses
  const pendingPrompts = new Map<number, Turn>();
  let shellExecuteCounter = 0;

  for (const event of events) {
    const msg = event.message;

    // User shell execute notification - standalone item
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_array/user_shell_execute"
    ) {
      const params = msg.params as UserShellExecuteParams;
      items.push({
        type: "user_shell_execute",
        id: `shell-exec-${shellExecuteCounter++}`,
        command: params.command,
        cwd: params.cwd,
        result: params.result,
      });
      continue;
    }

    // session/prompt request - starts a new turn
    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      const userContent = extractUserContent(msg.params);

      currentTurn = {
        type: "turn",
        id: `turn-${msg.id}`,
        promptId: msg.id,
        userContent,
        items: [],
        isComplete: false,
        durationMs: 0,
        toolCalls: new Map(),
      };
      currentTurn.durationMs = -event.ts; // Will add end timestamp later

      pendingPrompts.set(msg.id, currentTurn);
      items.push(currentTurn);
      continue;
    }

    // session/prompt response - ends the turn
    if (isJsonRpcResponse(msg) && pendingPrompts.has(msg.id)) {
      const turn = pendingPrompts.get(msg.id);
      if (!turn) continue;
      turn.isComplete = true;
      turn.durationMs += event.ts; // Complete the duration calculation
      const result = msg.result as {
        stopReason?: string;
        _meta?: { interruptReason?: string };
      };
      turn.stopReason = result?.stopReason;
      turn.interruptReason = result?._meta?.interruptReason;
      pendingPrompts.delete(msg.id);
      continue;
    }

    // session/update notification - add to current turn
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "session/update" &&
      currentTurn
    ) {
      const update = (msg.params as SessionNotification)?.update;
      if (!update) continue;

      processSessionUpdate(currentTurn, update);
      continue;
    }

    // PostHog console messages
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_posthog/console" &&
      currentTurn
    ) {
      const params = msg.params as { level?: string; message?: string };
      if (params?.message) {
        currentTurn.items.push({
          sessionUpdate: "console",
          level: params.level ?? "info",
          message: params.message,
          timestamp: new Date(event.ts).toISOString(),
        });
      }
    }

    // Compact boundary messages
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_posthog/compact_boundary" &&
      currentTurn
    ) {
      const params = msg.params as {
        trigger: "manual" | "auto";
        preTokens: number;
      };
      currentTurn.items.push({
        sessionUpdate: "compact_boundary",
        trigger: params.trigger,
        preTokens: params.preTokens,
      });
    }

    // Status messages (e.g., compacting in progress)
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_posthog/status" &&
      currentTurn
    ) {
      const params = msg.params as {
        status: string;
      };
      currentTurn.items.push({
        sessionUpdate: "status",
        status: params.status,
      });
    }

    // Task notification messages (background task completion)
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_posthog/task_notification" &&
      currentTurn
    ) {
      const params = msg.params as {
        taskId: string;
        status: "completed" | "failed" | "stopped";
        summary: string;
        outputFile: string;
      };
      currentTurn.items.push({
        sessionUpdate: "task_notification",
        taskId: params.taskId,
        status: params.status,
        summary: params.summary,
        outputFile: params.outputFile,
      });
    }
  }

  return items;
}

interface TextBlockWithMeta {
  type: "text";
  text: string;
  _meta?: { ui?: { hidden?: boolean } };
}

function extractUserContent(params: unknown): string {
  const p = params as { prompt?: ContentBlock[] };
  if (!p?.prompt?.length) return "";

  // Concatenate all visible text blocks (skip hidden context blocks)
  const visibleTextBlocks = p.prompt.filter((b): b is TextBlockWithMeta => {
    if (b.type !== "text") return false;
    const meta = (b as TextBlockWithMeta)._meta;
    return !meta?.ui?.hidden;
  });

  return visibleTextBlocks.map((b) => b.text).join("");
}

function mergeToolCallUpdate(existing: ToolCall, update: SessionUpdate) {
  const { sessionUpdate: _, ...rest } = update;
  Object.assign(existing, rest);
}

function processSessionUpdate(turn: Turn, update: SessionUpdate) {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
      // Skip - we get user content from the prompt request
      break;

    case "agent_message_chunk":
    case "agent_thought_chunk":
      if (update.content.type === "text") {
        appendTextChunk(turn, update);
      }
      break;

    case "tool_call": {
      const existing = turn.toolCalls.get(update.toolCallId);
      if (existing) {
        // Update existing tool call (same toolCallId sent again)
        Object.assign(existing, update);
      } else {
        // New tool call - clone to allow mutation from updates
        const toolCall = { ...update };
        turn.toolCalls.set(update.toolCallId, toolCall);
        turn.items.push(toolCall);
      }
      break;
    }

    case "tool_call_update": {
      const existing = turn.toolCalls.get(update.toolCallId);
      if (existing) {
        mergeToolCallUpdate(existing, update);
      }
      break;
    }

    case "plan":
    case "available_commands_update":
    case "config_option_update":
      turn.items.push(update);
      break;

    // Handle custom session updates
    default: {
      // Check for our custom session update types
      const customUpdate = update as unknown as {
        sessionUpdate: string;
        status?: string;
        errorType?: string;
        message?: string;
      };
      if (
        customUpdate.sessionUpdate === "status" ||
        customUpdate.sessionUpdate === "error"
      ) {
        turn.items.push(customUpdate as unknown as SessionUpdate);
      }
      break;
    }
  }
}

function appendTextChunk(
  turn: Turn,
  update: SessionUpdate & {
    sessionUpdate: "agent_message_chunk" | "agent_thought_chunk";
  },
) {
  if (update.content.type !== "text") return;

  const last = turn.items[turn.items.length - 1];
  if (
    last?.sessionUpdate === update.sessionUpdate &&
    "content" in last &&
    last.content.type === "text"
  ) {
    // Replace with new object containing appended text (SDK objects are frozen)
    turn.items[turn.items.length - 1] = {
      ...last,
      content: { type: "text", text: last.content.text + update.content.text },
    };
  } else {
    // Clone to avoid mutating frozen SDK objects
    turn.items.push({
      ...update,
      content: { ...update.content },
    });
  }
}
