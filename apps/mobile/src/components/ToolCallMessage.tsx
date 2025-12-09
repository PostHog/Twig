import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type ToolStatus = "pending" | "running" | "completed" | "error";

interface ToolCallMessageProps {
  toolName: string;
  status: ToolStatus;
  args?: Record<string, unknown>;
  result?: unknown;
}

// Icon components using text/emoji (simple approach for RN)
function ToolIcon({ status }: { status: ToolStatus }) {
  if (status === "pending" || status === "running") {
    return <ActivityIndicator size={12} color="#a3a3a3" />;
  }
  return <Text className="text-dark-text-muted text-xs">⚙️</Text>;
}

function CaretIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <Text
      className="text-dark-text-muted text-xs"
      style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
    >
      ▶
    </Text>
  );
}

export function ToolCallMessage({
  toolName,
  status,
  args,
  result,
}: ToolCallMessageProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isFailed = status === "error";
  const hasDetails = args || result !== undefined;

  return (
    <View className="px-4 py-1">
      <Pressable
        onPress={() => hasDetails && setIsOpen(!isOpen)}
        className="flex-row items-center gap-2 rounded-lg bg-dark-surface/50 px-3 py-2"
        style={{ opacity: hasDetails ? 1 : 0.7 }}
      >
        <CaretIcon isOpen={isOpen} />
        <ToolIcon status={status} />
        <Text className="font-mono text-dark-text-muted text-sm">
          {toolName}
        </Text>
        {isFailed && <Text className="text-red-400 text-xs">(Failed)</Text>}
      </Pressable>

      {isOpen && hasDetails && (
        <View className="mt-1 ml-6 overflow-hidden rounded-lg bg-dark-surface p-3">
          {args && (
            <View className="mb-2">
              <Text className="mb-1 font-medium text-dark-text-muted text-xs">
                Arguments
              </Text>
              <Text className="font-mono text-dark-text text-xs">
                {JSON.stringify(args, null, 2)}
              </Text>
            </View>
          )}
          {result !== undefined && (
            <View>
              <Text className="mb-1 font-medium text-dark-text-muted text-xs">
                Result
              </Text>
              <Text
                className="font-mono text-dark-text text-xs"
                numberOfLines={10}
              >
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
