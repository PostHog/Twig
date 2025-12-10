import { useRouter } from "expo-router";
import {
  ArrowsClockwise,
  Brain,
  FileText,
  GitBranch,
  Globe,
  type IconProps,
  ListChecks,
  MagnifyingGlass,
  PencilSimple,
  Play,
  Terminal,
  Trash,
  Wrench,
} from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createTask, runTaskInCloud } from "../features/agent/lib/agentApi";

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
  | "create_task"
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
  create_task: ListChecks,
  other: Wrench,
};

interface CreateTaskArgs {
  title?: string;
  description?: string;
  repository?: string;
}

interface ToolCallMessageProps {
  toolName: string;
  kind?: ToolKind;
  status: ToolStatus;
  args?: Record<string, unknown>;
  result?: unknown;
  hasHumanMessageAfter?: boolean;
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

function CreateTaskPreview({
  args,
  showAction,
}: {
  args: CreateTaskArgs;
  showAction: boolean;
}) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunTask = async () => {
    if (!args.description) return;

    setIsRunning(true);
    setError(null);

    try {
      const task = await createTask({
        title: args.title,
        description: args.description,
        repository: args.repository,
      });

      await runTaskInCloud(task.id);
      router.push(`/agent/${task.id}`);
    } catch (err) {
      console.error("Failed to create/run task:", err);
      setError(err instanceof Error ? err.message : "Failed to run task");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <View className="mt-2 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800/50">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-neutral-700 border-b px-3 py-2">
        <ListChecks size={14} color="#f1a82c" />
        <Text className="font-mono text-[12px] text-neutral-400">New task</Text>
      </View>

      {/* Content */}
      <View className="px-3 py-3">
        {/* Title */}
        {args.title && (
          <Text className="mb-2 font-medium text-[14px] text-white">
            {args.title}
          </Text>
        )}

        {/* Description */}
        {args.description && (
          <Text
            className="mb-3 text-[13px] text-neutral-300 leading-5"
            numberOfLines={4}
          >
            {args.description}
          </Text>
        )}

        {/* Repository */}
        {args.repository && (
          <View
            className={
              showAction
                ? "mb-3 flex-row items-center gap-1.5"
                : "flex-row items-center gap-1.5"
            }
          >
            <GitBranch size={12} color="#6e6e6b" />
            <Text className="font-mono text-[12px] text-neutral-500">
              {args.repository}
            </Text>
          </View>
        )}

        {/* Error message */}
        {error && (
          <View className="mb-3 rounded bg-red-900/30 px-2 py-1.5">
            <Text className="text-[12px] text-red-400">{error}</Text>
          </View>
        )}

        {/* Action button */}
        {showAction && (
          <TouchableOpacity
            onPress={handleRunTask}
            disabled={isRunning || !args.description}
            className={`flex-row items-center justify-center gap-2 rounded-lg px-4 py-2.5 ${
              isRunning ? "bg-orange-500/50" : "bg-orange-500"
            }`}
            activeOpacity={0.7}
          >
            {isRunning ? (
              <ActivityIndicator size={14} color="#fff" />
            ) : (
              <Play size={14} color="#fff" weight="fill" />
            )}
            <Text className="font-medium text-[13px] text-white">
              {isRunning ? "Starting..." : "Run this task"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ToolCallMessage({
  toolName,
  kind,
  status,
  args,
  result,
  hasHumanMessageAfter,
}: ToolCallMessageProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading = status === "pending" || status === "running";
  const isFailed = status === "error";
  const hasDetails = args || result !== undefined;
  const displayTitle = formatToolTitle(toolName, args);
  const KindIcon = kind ? kindIcons[kind] : Wrench;

  const isCreateTask =
    toolName.toLowerCase() === "create_task" || kind === "create_task";

  // For create_task, show rich preview instead of expandable
  if (isCreateTask && args) {
    return (
      <View className="px-4 py-1">
        <View className="mb-1 flex-row items-center gap-2">
          {isLoading ? (
            <ActivityIndicator size={12} color="#6e6e6b" />
          ) : (
            <ListChecks size={12} color="#f1a82c" />
          )}
          <Text className="font-mono text-[13px] text-neutral-400">
            create_task
          </Text>
        </View>
        <CreateTaskPreview
          args={args as CreateTaskArgs}
          showAction={!hasHumanMessageAfter}
        />
      </View>
    );
  }

  return (
    <View className="px-4 py-0.5">
      <Pressable
        onPress={() => hasDetails && setIsOpen(!isOpen)}
        className="flex-row items-center gap-2"
        disabled={!hasDetails}
      >
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
