import { Text, View } from "react-native";

interface FailureMessageProps {
  content?: string;
}

export function FailureMessage({ content }: FailureMessageProps) {
  return (
    <View className="items-start px-4 py-2">
      <View className="max-w-[85%] rounded-2xl rounded-bl-md bg-red-900/30 px-4 py-3">
        <Text className="text-base text-red-300 leading-6">
          {content || "Something went wrong. Please try again."}
        </Text>
      </View>
    </View>
  );
}
