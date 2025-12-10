import { Text, View } from "react-native";

interface AgentMessageProps {
  content: string;
}

export function AgentMessage({ content }: AgentMessageProps) {
  return (
    <View className="mb-3 max-w-[95%] py-1">
      <Text className="font-mono text-[13px] text-neutral-200 leading-5">
        {content}
      </Text>
    </View>
  );
}
