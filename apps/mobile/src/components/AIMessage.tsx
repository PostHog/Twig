import { ActivityIndicator, Text, View } from "react-native";
import type { AssistantToolCall } from "../types/max";
import { ToolCallMessage } from "./ToolCallMessage";

interface AIMessageProps {
  content: string;
  isLoading?: boolean;
  thinkingText?: string;
  toolCalls?: AssistantToolCall[];
}

export function AIMessage({
  content,
  isLoading,
  thinkingText,
  toolCalls,
}: AIMessageProps) {
  return (
    <View className="items-start py-2">
      {toolCalls && toolCalls.length > 0 && (
        <View className="mb-1 w-full">
          {toolCalls.map((tc) => (
            <ToolCallMessage
              key={tc.id}
              toolName={tc.name}
              status="completed"
              args={tc.args}
            />
          ))}
        </View>
      )}
      {(content || isLoading) && (
        <View className="mx-4 max-w-[85%] rounded-2xl rounded-bl-md bg-dark-surface px-4 py-3">
          {isLoading && !content ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#a3a3a3" />
              <Text className="text-base text-dark-text-muted italic">
                {thinkingText || "Thinking..."}
              </Text>
            </View>
          ) : (
            <Text className="text-base text-dark-text leading-6">
              {content}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
