import { Text, View } from "react-native";

interface FailureMessageProps {
  content?: string;
}

export function FailureMessage({ content }: FailureMessageProps) {
  return (
    <View className="px-4 py-2">
      <View className="max-w-[95%] rounded bg-status-error/15 px-3 py-2">
        <Text className="font-mono text-[13px] text-status-error leading-5">
          {content || "Something went wrong. Please try again."}
        </Text>
      </View>
    </View>
  );
}
