import { Text, View } from "react-native";
import type { AssistantToolCall } from "../types";
import { ToolMessage } from "./ToolMessage";

interface AgentMessageProps {
  content: string;
  isLoading?: boolean;
  thinkingText?: string;
  toolCalls?: AssistantToolCall[];
  hasHumanMessageAfter?: boolean;
  onOpenTask?: (taskId: string) => void;
}

export function AgentMessage({
  content,
  isLoading,
  thinkingText,
  toolCalls,
  hasHumanMessageAfter,
  onOpenTask,
}: AgentMessageProps) {
  return (
    <View className="py-2">
      {toolCalls && toolCalls.length > 0 && (
        <View className="mb-1">
          {toolCalls.map((tc) => (
            <ToolMessage
              key={tc.id}
              toolName={tc.name}
              status="completed"
              args={tc.args}
              hasHumanMessageAfter={hasHumanMessageAfter}
              onOpenTask={onOpenTask}
            />
          ))}
        </View>
      )}
      {(content || isLoading) && (
        <View className="max-w-[95%] px-4 py-1">
          {isLoading && !content ? (
            <Text className="font-mono text-[13px] text-neutral-400 italic">
              {thinkingText || "Generating..."}
            </Text>
          ) : (
            <Text className="font-mono text-[13px] text-neutral-200 leading-5">
              {content}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
