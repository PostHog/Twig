import { differenceInHours, format, formatDistanceToNow } from "date-fns";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../../../components/text";
import type { Task } from "../types";

interface TaskItemProps {
  task: Task;
  onPress: (task: Task) => void;
}

const statusColorMap: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-green-500/20", text: "text-green-400" },
  failed: { bg: "bg-red-500/20", text: "text-red-400" },
  in_progress: { bg: "bg-blue-500/20", text: "text-blue-400" },
  started: { bg: "bg-amber-500/20", text: "text-amber-400" },
  backlog: { bg: "bg-gray-500/20", text: "text-gray-400" },
};

const statusDisplayMap: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  in_progress: "In progress",
  started: "Started",
  backlog: "Backlog",
};

function TaskItemComponent({ task, onPress }: TaskItemProps) {
  const createdAt = new Date(task.created_at);
  const hoursSinceCreated = differenceInHours(new Date(), createdAt);
  const timeDisplay =
    hoursSinceCreated < 24
      ? formatDistanceToNow(createdAt, { addSuffix: true })
      : format(createdAt, "MMM d");

  const prUrl = task.latest_run?.output?.pr_url as string | undefined;
  const hasPR = !!prUrl;
  const status = hasPR ? "completed" : task.latest_run?.status || "backlog";
  const isCloudTask = task.latest_run?.environment === "cloud";

  const statusColors = statusColorMap[status] || statusColorMap.backlog;

  return (
    <Pressable
      onPress={() => onPress(task)}
      className="border-dark-border border-b px-3 py-3 active:bg-dark-surface"
    >
      <View className="flex-row items-center gap-2">
        {/* Slug */}
        <Text className="flex-shrink-0 text-gray-500 text-xs">{task.slug}</Text>

        {/* Status Badge */}
        <View className={`rounded px-1.5 py-0.5 ${statusColors.bg}`}>
          <Text className={`text-xs ${statusColors.text}`}>
            {statusDisplayMap[status] || status}
          </Text>
        </View>

        {/* Cloud indicator */}
        {isCloudTask && (
          <View className="flex-row items-center gap-1 opacity-70">
            <Text className="text-gray-500 text-xs">☁️</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        className="mt-1 font-medium text-sm text-white"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {task.title}
      </Text>

      {/* Description preview */}
      {task.description && (
        <Text
          className="mt-0.5 text-gray-400 text-xs"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {task.description}
        </Text>
      )}

      {/* Bottom row: repo + time */}
      <View className="mt-1.5 flex-row items-center justify-between">
        <Text className="text-gray-500 text-xs" numberOfLines={1}>
          {task.repository || "No repository"}
        </Text>
        <Text className="flex-shrink-0 text-gray-600 text-xs">
          {timeDisplay}
        </Text>
      </View>
    </Pressable>
  );
}

export const TaskItem = memo(TaskItemComponent);
