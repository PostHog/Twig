import { ActivityIndicator, Text, View } from "react-native";
import type { AssistantToolCall } from "../types/max";
import { ToolCallMessage } from "./ToolCallMessage";

interface AIMessageProps {
  content: string;
  isLoading?: boolean;
  thinkingText?: string;
  toolCalls?: AssistantToolCall[];
  hasHumanMessageAfter?: boolean;
}

export function AIMessage({
  content,
  isLoading,
  thinkingText,
  toolCalls,
  hasHumanMessageAfter,
}: AIMessageProps) {
  return (
    <View className="py-2">
      {toolCalls && toolCalls.length > 0 && (
        <View className="mb-1">
          {toolCalls.map((tc) => (
            <ToolCallMessage
              key={tc.id}
              toolName={tc.name}
              status="completed"
              args={tc.args}
              hasHumanMessageAfter={hasHumanMessageAfter}
            />
          ))}
        </View>
      )}
      {(content || isLoading) && (
        <View className="max-w-[95%] px-4 py-1">
          {isLoading && !content ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#f1a82c" />
              <Text className="font-mono text-[13px] text-neutral-400 italic">
                {thinkingText || "Generating..."}
              </Text>
            </View>
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
