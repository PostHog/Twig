import { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import {
  AgentMessage,
  ChatInput,
  HumanMessage,
  ToolMessage,
  type ToolStatus,
} from "@/features/chat";
import type { SessionEvent, SessionNotification } from "../types";

interface TaskSessionViewProps {
  events: SessionEvent[];
  isPromptPending: boolean;
  onSendPrompt: (text: string) => void;
  onOpenTask?: (taskId: string) => void;
}

interface ToolData {
  toolName: string;
  toolCallId: string;
  status: ToolStatus;
  args?: Record<string, unknown>;
  result?: unknown;
}

interface ParsedMessage {
  id: string;
  type: "user" | "agent" | "tool";
  content: string;
  toolData?: ToolData;
}

function mapToolStatus(
  status?: "pending" | "in_progress" | "completed" | "failed" | null,
): ToolStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "in_progress":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "error";
    default:
      return "pending";
  }
}

function parseSessionNotification(notification: SessionNotification): {
  type: "user" | "agent" | "tool" | "tool_update";
  content?: string;
  toolData?: ToolData;
} | null {
  const { update } = notification;
  if (!update?.sessionUpdate) {
    return null;
  }

  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk": {
      if (update.content?.type === "text") {
        return {
          type:
            update.sessionUpdate === "user_message_chunk" ? "user" : "agent",
          content: update.content.text,
        };
      }
      return null;
    }
    case "tool_call": {
      return {
        type: "tool",
        toolData: {
          toolName: update.title ?? "Unknown Tool",
          toolCallId: update.toolCallId ?? "",
          status: mapToolStatus(update.status),
          args: update.rawInput,
        },
      };
    }
    case "tool_call_update": {
      return {
        type: "tool_update",
        toolData: {
          toolName: update.title ?? "Unknown Tool",
          toolCallId: update.toolCallId ?? "",
          status: mapToolStatus(update.status),
          args: update.rawInput,
          result: update.rawOutput,
        },
      };
    }
    default:
      return null;
  }
}

function processEvents(events: SessionEvent[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  let pendingAgentText = "";
  let agentMessageCount = 0;
  const toolMessages = new Map<string, ParsedMessage>();

  const flushAgentText = () => {
    if (!pendingAgentText) return;
    messages.push({
      id: `agent-${agentMessageCount++}`,
      type: "agent",
      content: pendingAgentText,
    });
    pendingAgentText = "";
  };

  for (const event of events) {
    if (event.type !== "session_update") continue;

    const parsed = parseSessionNotification(event.notification);
    if (!parsed) continue;

    switch (parsed.type) {
      case "user":
        flushAgentText();
        messages.push({
          id: `user-${event.ts}`,
          type: "user",
          content: parsed.content ?? "",
        });
        break;
      case "agent":
        pendingAgentText += parsed.content ?? "";
        break;
      case "tool":
        flushAgentText();
        if (parsed.toolData) {
          const msg: ParsedMessage = {
            id: `tool-${parsed.toolData.toolCallId}`,
            type: "tool",
            content: "",
            toolData: parsed.toolData,
          };
          toolMessages.set(parsed.toolData.toolCallId, msg);
          messages.push(msg);
        }
        break;
      case "tool_update":
        if (parsed.toolData) {
          const existing = toolMessages.get(parsed.toolData.toolCallId);
          if (existing?.toolData) {
            existing.toolData.status = parsed.toolData.status;
            existing.toolData.result = parsed.toolData.result;
          }
        }
        break;
    }
  }

  flushAgentText();
  return messages;
}

export function TaskSessionView({
  events,
  isPromptPending,
  onSendPrompt,
  onOpenTask,
}: TaskSessionViewProps) {
  const messages = useMemo(() => processEvents(events), [events]);

  const renderMessage = useCallback(
    ({ item }: { item: ParsedMessage }) => {
      switch (item.type) {
        case "user":
          return <HumanMessage content={item.content} />;
        case "agent":
          return <AgentMessage content={item.content} onOpenTask={onOpenTask} />;
        case "tool":
          return item.toolData ? (
            <ToolMessage
              toolName={item.toolData.toolName}
              status={item.toolData.status}
              args={item.toolData.args}
              result={item.toolData.result}
              onOpenTask={onOpenTask}
            />
          ) : null;
        default:
          return null;
      }
    },
    [onOpenTask],
  );

  return (
    <View className="flex-1">
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{
          flexDirection: "column-reverse",
          paddingVertical: 16,
        }}
        ListHeaderComponent={
          isPromptPending ? (
            <View className="mb-2 flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#f1a82c" />
              <Text className="font-mono text-[13px] text-neutral-400 italic">
                Thinking...
              </Text>
            </View>
          ) : null
        }
      />

      <ChatInput onSend={onSendPrompt} disabled={isPromptPending} />
    </View>
  );
}

