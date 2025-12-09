import { ActivityIndicator, Text, View } from "react-native";

interface AIMessageProps {
  content: string;
  isLoading?: boolean;
  thinkingText?: string;
}

export function AIMessage({
  content,
  isLoading,
  thinkingText,
}: AIMessageProps) {
  return (
    <View className="items-start px-4 py-2">
      <View className="max-w-[85%] rounded-2xl rounded-bl-md bg-dark-surface px-4 py-3">
        {isLoading && !content ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#a3a3a3" />
            <Text className="text-base text-dark-text-muted italic">
              {thinkingText || "Thinking..."}
            </Text>
          </View>
        ) : (
          <Text className="text-base text-dark-text leading-6">{content}</Text>
        )}
      </View>
    </View>
  );
}
