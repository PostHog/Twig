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
import { useThemeColors } from "@/lib/theme";

export type ToolStatus = "pending" | "running" | "completed" | "error";
export type ToolKind =
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

export interface ToolMessageProps {
  toolName: string;
  kind?: ToolKind;
  status: ToolStatus;
  args?: Record<string, unknown>;
  result?: unknown;
  hasHumanMessageAfter?: boolean;
  onOpenTask?: (taskId: string) => void;
}

export function formatToolTitle(
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
  onOpenTask,
}: {
  args: CreateTaskArgs;
  showAction: boolean;
  onOpenTask?: (taskId: string) => void;
}) {
  const router = useRouter();
  const themeColors = useThemeColors();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunTask = async () => {
    if (!args.description) return;

    setIsRunning(true);
    setError(null);

    try {
      // Dynamic import to avoid circular dependency
      const { createTask, runTaskInCloud } = await import("../../tasks/api");

      const task = await createTask({
        title: args.title,
        description: args.description,
        repository: args.repository,
      });

      await runTaskInCloud(task.id);

      if (onOpenTask) {
        onOpenTask(task.id);
      } else {
        router.push(`/task/${task.id}`);
      }
    } catch (err) {
      console.error("Failed to create/run task:", err);
      setError(err instanceof Error ? err.message : "Failed to run task");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <View className="mt-2 overflow-hidden rounded-lg border border-gray-7 bg-gray-3">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-gray-7 px-3 py-2">
        <ListChecks size={14} color={themeColors.accent[9]} />
        <Text className="font-mono text-[12px] text-gray-11">New task</Text>
      </View>

      {/* Content */}
      <View className="px-3 py-3">
        {/* Title */}
        {args.title && (
          <Text className="mb-2 font-medium text-[14px] text-gray-12">
            {args.title}
          </Text>
        )}

        {/* Description */}
        {args.description && (
          <Text
            className="mb-3 text-[13px] text-gray-11 leading-5"
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
            <GitBranch size={12} color={themeColors.gray[9]} />
            <Text className="font-mono text-[12px] text-gray-9">
              {args.repository}
            </Text>
          </View>
        )}

        {/* Error message */}
        {error && (
          <View className="mb-3 rounded bg-status-error/20 px-2 py-1.5">
            <Text className="text-[12px] text-status-error">{error}</Text>
          </View>
        )}

        {/* Action button */}
        {showAction && (
          <TouchableOpacity
            onPress={handleRunTask}
            disabled={isRunning || !args.description}
            className={`flex-row items-center justify-center gap-2 rounded-lg px-4 py-2.5 ${
              isRunning ? "bg-accent-9/50" : "bg-accent-9"
            }`}
            activeOpacity={0.7}
          >
            {isRunning ? (
              <ActivityIndicator
                size={14}
                color={themeColors.accent.contrast}
              />
            ) : (
              <Play
                size={14}
                color={themeColors.accent.contrast}
                weight="fill"
              />
            )}
            <Text className="font-medium text-[13px] text-accent-contrast">
              {isRunning ? "Starting..." : "Open this task"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ToolMessage({
  toolName,
  kind,
  status,
  args,
  result,
  hasHumanMessageAfter,
  onOpenTask,
}: ToolMessageProps) {
  const themeColors = useThemeColors();
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
            <ActivityIndicator size={12} color={themeColors.gray[9]} />
          ) : (
            <ListChecks size={12} color={themeColors.accent[9]} />
          )}
          <Text className="font-mono text-[13px] text-gray-11">
            create_task
          </Text>
        </View>
        <CreateTaskPreview
          args={args as CreateTaskArgs}
          showAction={!hasHumanMessageAfter}
          onOpenTask={onOpenTask}
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
          <ActivityIndicator size={12} color={themeColors.gray[9]} />
        ) : (
          <KindIcon size={12} color={themeColors.gray[9]} />
        )}

        {/* Tool name */}
        <Text className="font-mono text-[13px] text-gray-12" numberOfLines={1}>
          {displayTitle}
        </Text>

        {/* Failed indicator */}
        {isFailed && (
          <Text className="font-mono text-[13px] text-gray-9">(Failed)</Text>
        )}
      </Pressable>

      {/* Expanded content */}
      {isOpen && hasDetails && (
        <View className="mt-2 ml-4">
          {args && (
            <View className="mb-2">
              <Text className="mb-1 font-mono text-[13px] text-gray-11">
                Arguments
              </Text>
              <View className="rounded bg-accent-3 p-2">
                <Text className="font-mono text-[13px] text-accent-12">
                  {JSON.stringify(args, null, 2)}
                </Text>
              </View>
            </View>
          )}
          {result !== undefined && (
            <View>
              <Text className="mb-1 font-mono text-[13px] text-gray-11">
                Result
              </Text>
              <View className="rounded bg-gray-3 p-2">
                <Text
                  className="font-mono text-[13px] text-gray-11"
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
