import {
  ArrowsClockwise,
  Brain,
  CaretRight,
  FileText,
  Globe,
  type IconProps,
  MagnifyingGlass,
  PencilSimple,
  Terminal,
  Trash,
  Wrench,
} from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type ToolStatus = "pending" | "running" | "completed" | "error";
type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

type PhosphorIcon = React.ComponentType<IconProps>;

const kindIcons: Record<ToolKind, PhosphorIcon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: FileText,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  other: Wrench,
};

interface ToolCallMessageProps {
  toolName: string;
  kind?: ToolKind;
  status: ToolStatus;
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

export function ToolCallMessage({
  toolName,
  kind,
  status,
  args,
  result,
}: ToolCallMessageProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading = status === "pending" || status === "running";
  const isFailed = status === "error";
  const hasDetails = args || result !== undefined;
  const displayTitle = formatToolTitle(toolName, args);
  const KindIcon = kind ? kindIcons[kind] : Wrench;

  return (
    <View className="px-4 py-0.5">
      <Pressable
        onPress={() => hasDetails && setIsOpen(!isOpen)}
        className="flex-row items-center gap-2"
        disabled={!hasDetails}
      >
        {/* Caret */}
        <CaretRight
          size={12}
          color="#6e6e6b"
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
        />

        {/* Status indicator */}
        {isLoading ? (
          <ActivityIndicator size={12} color="#6e6e6b" />
        ) : (
          <KindIcon size={12} color="#6e6e6b" />
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
      {isOpen && hasDetails && (
        <View className="mt-2 ml-4">
          {args && (
            <View className="mb-2">
              <Text className="mb-1 font-mono text-[13px] text-neutral-400">
                Arguments
              </Text>
              <View className="rounded bg-amber-500/20 p-2">
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
              <View className="rounded bg-neutral-800/50 p-2">
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
