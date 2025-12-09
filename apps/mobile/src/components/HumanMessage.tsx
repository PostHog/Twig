import { Text, View } from "react-native";

interface HumanMessageProps {
  content: string;
}

export function HumanMessage({ content }: HumanMessageProps) {
  return (
    <View className="items-end px-4 py-2">
      <View className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-500 px-4 py-3">
        <Text className="text-base text-white leading-6">{content}</Text>
      </View>
    </View>
  );
}
