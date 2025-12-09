import { useState } from "react";
import { Pressable, Text, View } from "react-native";

interface ToolCallBlockProps {
  toolName: string;
  status: "pending" | "running" | "completed" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

function getStatusColor(status: ToolCallBlockProps["status"]): string {
  switch (status) {
    case "pending":
      return "text-yellow-500";
    case "running":
      return "text-blue-500";
    case "completed":
      return "text-green-500";
    case "error":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

function getStatusText(status: ToolCallBlockProps["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running...";
    case "completed":
      return "Done";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function ToolCallBlock({
  toolName,
  status,
  args,
  result,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="mb-2">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1">
            <Text className="text-neutral-400 text-sm">Tool:</Text>
            <Text
              className="text-white text-sm font-mono flex-1"
              numberOfLines={1}
            >
              {toolName}
            </Text>
          </View>
          <Text className={`text-sm ${getStatusColor(status)}`}>
            {getStatusText(status)}
          </Text>
        </View>
      </Pressable>

      {expanded && (args || result !== undefined) ? (
        <View className="bg-neutral-950 border border-neutral-700 border-t-0 rounded-b-lg px-3 py-2">
          {args ? (
            <View className="mb-2">
              <Text className="text-neutral-400 text-xs mb-1">Arguments:</Text>
              <Text className="text-neutral-300 text-xs font-mono">
                {JSON.stringify(args, null, 2)}
              </Text>
            </View>
          ) : null}
          {result !== undefined ? (
            <View>
              <Text className="text-neutral-400 text-xs mb-1">Result:</Text>
              <Text
                className="text-neutral-300 text-xs font-mono"
                numberOfLines={10}
              >
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
