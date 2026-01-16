import { Text, View } from "react-native";

interface HumanMessageProps {
  content: string;
}

export function HumanMessage({ content }: HumanMessageProps) {
  return (
    <View className="px-4 py-2">
      <View className="mt-3 max-w-[95%] rounded bg-accent-3 px-3 py-2">
        <Text className="font-mono text-[13px] text-accent-12 leading-5">
          {content}
        </Text>
      </View>
    </View>
  );
}
