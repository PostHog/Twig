import { Text, View } from "react-native";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <View className="flex-row justify-end mb-2">
      <View className="bg-blue-600 rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
        <Text className="text-white text-base">{content}</Text>
      </View>
    </View>
  );
}
