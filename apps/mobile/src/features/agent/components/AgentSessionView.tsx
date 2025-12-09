import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SessionEvent, SessionNotification } from "../types/agent";
import { AgentMessage } from "./AgentMessage";
import { ToolCallBlock } from "./ToolCallBlock";
import { UserMessage } from "./UserMessage";

interface AgentSessionViewProps {
  events: SessionEvent[];
  isPromptPending: boolean;
  onSendPrompt: (text: string) => void;
  onCancel?: () => void;
}

interface ToolData {
  toolName: string;
  toolCallId: string;
  status: "pending" | "running" | "completed" | "error";
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
): ToolData["status"] {
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

export function AgentSessionView({
  events,
  isPromptPending,
  onSendPrompt,
  onCancel,
}: AgentSessionViewProps) {
  const [inputText, setInputText] = useState("");

  const messages = useMemo(() => processEvents(events), [events]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    onSendPrompt(text);
    setInputText("");
  }, [inputText, onSendPrompt]);

  const renderMessage = useCallback(({ item }: { item: ParsedMessage }) => {
    switch (item.type) {
      case "user":
        return <UserMessage content={item.content} />;
      case "agent":
        return <AgentMessage content={item.content} />;
      case "tool":
        return item.toolData ? (
          <ToolCallBlock
            toolName={item.toolData.toolName}
            status={item.toolData.status}
            args={item.toolData.args}
            result={item.toolData.result}
          />
        ) : null;
      default:
        return null;
    }
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
      keyboardVerticalOffset={100}
    >
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ flexDirection: "column-reverse", padding: 16 }}
        ListHeaderComponent={
          isPromptPending ? (
            <View className="flex-row items-center gap-2 mb-2">
              <ActivityIndicator size="small" color="#6b7280" />
              <Text className="text-gray-500 text-sm">Thinking...</Text>
            </View>
          ) : null
        }
      />

      <View className="border-t border-neutral-700 px-4 py-3">
        <View className="flex-row items-end gap-2">
          <TextInput
            className="flex-1 bg-neutral-800 text-white px-4 py-3 rounded-2xl text-base"
            placeholder="Type a message..."
            placeholderTextColor="#6b7280"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={10000}
            editable={!isPromptPending}
          />
          {isPromptPending ? (
            <Pressable
              onPress={onCancel}
              className="bg-red-600 px-4 py-3 rounded-2xl"
            >
              <Text className="text-white font-medium">Stop</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim()}
              className={`px-4 py-3 rounded-2xl ${
                inputText.trim() ? "bg-blue-600" : "bg-neutral-700"
              }`}
            >
              <Text
                className={`font-medium ${
                  inputText.trim() ? "text-white" : "text-neutral-500"
                }`}
              >
                Send
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
