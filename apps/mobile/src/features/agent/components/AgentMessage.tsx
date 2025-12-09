import { Text, View } from "react-native";

interface AgentMessageProps {
  content: string;
}

export function AgentMessage({ content }: AgentMessageProps) {
  return (
    <View className="flex-row justify-start mb-2">
      <View className="bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
        <Text className="text-white text-base">{content}</Text>
      </View>
    </View>
  );
}
