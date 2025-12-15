import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { SessionUpdate, ToolCall } from "@features/sessions/types";
import { XCircle } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { memo, useEffect, useMemo, useRef } from "react";
import { GitActionMessage, parseGitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { SessionFooter } from "./SessionFooter";
import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";
import { UserMessage } from "./session-update/UserMessage";

interface Turn {
  id: string;
  promptId: number;
  userContent: string;
  items: RenderItem[];
  isComplete: boolean;
  stopReason?: string;
  durationMs: number;
  toolCalls: Map<string, ToolCall>;
}

interface ConversationViewProps {
  events: AcpMessage[];
  isPromptPending: boolean;
  repoPath?: string | null;
  isCloud?: boolean;
}

export function ConversationView({
  events,
  isPromptPending,
  repoPath,
  isCloud = false,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const turns = useMemo(() => buildTurns(events), [events]);
  const lastTurn = turns[turns.length - 1];
  const lastTurnComplete = lastTurn?.isComplete ?? true;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hide flex-1 overflow-auto bg-white p-2 pb-16 dark:bg-gray-1"
    >
      <div className="flex flex-col gap-3">
        {turns.map((turn) => (
          <TurnView
            key={turn.id}
            turn={turn}
            repoPath={repoPath}
            isCloud={isCloud}
          />
        ))}
      </div>
      <SessionFooter
        isPromptPending={isPromptPending || !lastTurnComplete}
        lastGenerationDuration={
          lastTurn?.isComplete ? lastTurn.durationMs : null
        }
        lastStopReason={lastTurn?.stopReason}
      />
    </div>
  );
}

interface TurnViewProps {
  turn: Turn;
  repoPath?: string | null;
  isCloud?: boolean;
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
          turnCancelled={wasCancelled}
        />
      ))}
      {showGitResult && repoPath && (
        <GitActionResult
          actionType={gitAction.actionType!}
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

function buildTurns(events: AcpMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  // Map prompt request IDs to their turns for matching responses
  const pendingPrompts = new Map<number, Turn>();

  for (const event of events) {
    const msg = event.message;

    // session/prompt request - starts a new turn
    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      const userContent = extractUserContent(msg.params);

      current = {
        id: `turn-${msg.id}`,
        promptId: msg.id,
        userContent,
        items: [],
        isComplete: false,
        durationMs: 0,
        toolCalls: new Map(),
      };
      current.durationMs = -event.ts; // Will add end timestamp later

      pendingPrompts.set(msg.id, current);
      turns.push(current);
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
      current
    ) {
      const update = (msg.params as SessionNotification)?.update;
      if (!update) continue;

      processSessionUpdate(current, update);
      continue;
    }

    // PostHog console messages
    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_posthog/console" &&
      current
    ) {
      const params = msg.params as { level?: string; message?: string };
      if (params?.message) {
        current.items.push({
          sessionUpdate: "console",
          level: params.level ?? "info",
          message: params.message,
          timestamp: new Date(event.ts).toISOString(),
        });
      }
    }
  }

  return turns;
}

function extractUserContent(params: unknown): string {
  const p = params as { prompt?: ContentBlock[] };
  if (!p?.prompt?.length) return "";

  const textBlock = p.prompt.find(
    (b): b is { type: "text"; text: string } => b.type === "text",
  );
  return textBlock?.text ?? "";
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
        // Merge update but preserve sessionUpdate as "tool_call" for rendering
        const { sessionUpdate: _, ...rest } = update;
        Object.assign(existing, rest);
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
