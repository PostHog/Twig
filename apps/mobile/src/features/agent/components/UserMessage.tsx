import { Text, View } from "react-native";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <View className="mt-3 mb-3 max-w-[95%]">
      <View className="bg-amber-500/20 px-3 py-2">
        <Text className="font-mono text-[13px] text-amber-100 leading-5">
          {content}
        </Text>
      </View>
    </View>
  );
}
