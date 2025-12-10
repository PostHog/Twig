import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface ToolCallBlockProps {
  toolName: string;
  status: "pending" | "running" | "completed" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

function formatToolTitle(
  toolName: string,
  args?: Record<string, unknown>,
): string {
  if (!args) return toolName;

  // Format common tool patterns like the desktop app
  if (toolName.toLowerCase() === "grep" && args.pattern) {
    return `grep "${args.pattern}"`;
  }
  if (toolName.toLowerCase() === "read_file" && args.target_file) {
    return "Read File";
  }
  if (toolName.toLowerCase() === "write" && args.file_path) {
    return "Write File";
  }
  if (toolName.toLowerCase() === "search_replace") {
    return "Search Replace";
  }

  return toolName;
}

export function ToolCallBlock({
  toolName,
  status,
  args,
  result,
}: ToolCallBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading = status === "pending" || status === "running";
  const isFailed = status === "error";
  const hasContent = args || result !== undefined;
  const displayTitle = formatToolTitle(toolName, args);

  return (
    <View className="py-0.5">
      <Pressable
        onPress={() => hasContent && setIsOpen(!isOpen)}
        className="flex-row items-center gap-2"
        disabled={!hasContent}
      >
        {/* Caret */}
        <Text
          className="text-neutral-500 text-xs"
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
        >
          {hasContent ? "›" : " "}
        </Text>

        {/* Status indicator */}
        {isLoading ? (
          <ActivityIndicator size={12} color="#6e6e6b" />
        ) : (
          <Text className="font-mono text-[10px] text-neutral-500">○</Text>
        )}

        {/* Tool name */}
        <Text
          className="font-mono text-[13px] text-neutral-200"
          numberOfLines={1}
        >
          {displayTitle}
        </Text>

        {/* Failed indicator */}
        {isFailed && (
          <Text className="font-mono text-[13px] text-neutral-500">
            (Failed)
          </Text>
        )}
      </Pressable>

      {/* Expanded content */}
      {isOpen && hasContent && (
        <View className="mt-2 ml-4">
          {args && (
            <View className="mb-2">
              <Text className="mb-1 font-mono text-[13px] text-neutral-400">
                Arguments
              </Text>
              <View className="bg-amber-500/20 p-2">
                <Text className="font-mono text-[13px] text-amber-100">
                  {JSON.stringify(args, null, 2)}
                </Text>
              </View>
            </View>
          )}
          {result !== undefined && (
            <View>
              <Text className="mb-1 font-mono text-[13px] text-neutral-400">
                Result
              </Text>
              <View className="bg-neutral-800/50 p-2">
                <Text
                  className="font-mono text-[13px] text-neutral-300"
                  numberOfLines={10}
                >
                  {typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
