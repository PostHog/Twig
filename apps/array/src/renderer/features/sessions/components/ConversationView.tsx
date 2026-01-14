import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GitActionMessage, parseGitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { SessionFooter } from "./SessionFooter";
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
  durationMs: number;
  toolCalls: Map<string, ToolCall>;
}

type ConversationItem = Turn | UserShellExecute;

interface ConversationViewProps {
  events: AcpMessage[];
  isPromptPending: boolean;
  repoPath?: string | null;
  isCloud?: boolean;
  taskId?: string;
}

const SCROLL_THRESHOLD = 100;
const SHOW_BUTTON_THRESHOLD = 300;

export function ConversationView({
  events,
  isPromptPending,
  repoPath,
  isCloud = false,
  taskId,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildConversationItems(events), [events]);
  const lastTurn = items.filter((i): i is Turn => i.type === "turn").pop();

  // Track pending permissions for scroll triggering
  const pendingPermissions = usePendingPermissionsForTask(taskId ?? "");
  const pendingPermissionsCount = pendingPermissions.size;

  const isNearBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(0);
  const prevPendingCountRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Update isNearBottom on scroll
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= SCROLL_THRESHOLD;
      setShowScrollButton(distanceFromBottom > SHOW_BUTTON_THRESHOLD);
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll to bottom on first render, new content, or new pending permissions
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNewContent = items.length > prevItemsLengthRef.current;
    const isNewPending = pendingPermissionsCount > prevPendingCountRef.current;
    prevItemsLengthRef.current = items.length;
    prevPendingCountRef.current = pendingPermissionsCount;

    if (isNearBottomRef.current || isNewContent || isNewPending) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items, pendingPermissionsCount]);

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
        className="scrollbar-hide absolute inset-0 overflow-auto bg-white p-2 pb-16 dark:bg-gray-1"
      >
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.type === "turn" ? (
              <TurnView
                key={item.id}
                turn={item}
                repoPath={repoPath}
                isCloud={isCloud}
                taskId={taskId}
              />
            ) : (
              <UserShellExecuteView key={item.id} item={item} />
            ),
          )}
        </div>
        <SessionFooter
          isPromptPending={isPromptPending}
          lastGenerationDuration={
            lastTurn?.isComplete ? lastTurn.durationMs : null
          }
          lastStopReason={lastTurn?.stopReason}
        />
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
  taskId?: string;
}

const TurnView = memo(function TurnView({
  turn,
  repoPath,
  isCloud = false,
  taskId,
}: TurnViewProps) {
  const wasCancelled = turn.stopReason === "cancelled";
  const gitAction = parseGitActionMessage(turn.userContent);
  const showGitResult =
    gitAction.isGitAction && gitAction.actionType && turn.isComplete;

  return (
    <Box className="flex flex-col gap-2">
      {gitAction.isGitAction && gitAction.actionType ? (
        <GitActionMessage actionType={gitAction.actionType} />
      ) : (
        <UserMessage content={turn.userContent} />
      )}
      {turn.items.map((item, i) => (
        <SessionUpdateView
          key={`${item.sessionUpdate}-${i}`}
          item={item}
          toolCalls={turn.toolCalls}
          taskId={taskId}
          turnCancelled={wasCancelled}
        />
      ))}
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
              Interrupted by user
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
      turn.stopReason = (msg.result as { stopReason?: string })?.stopReason;
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

  // Find first visible text block (skip hidden context blocks)
  const textBlock = p.prompt.find((b): b is TextBlockWithMeta => {
    if (b.type !== "text") return false;
    const meta = (b as TextBlockWithMeta)._meta;
    return !meta?.ui?.hidden;
  });
  return textBlock?.text ?? "";
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
    case "current_mode_update":
      turn.items.push(update);
      break;
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
