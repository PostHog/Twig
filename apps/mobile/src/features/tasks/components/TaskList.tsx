import { Text } from "@components/text";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useAuthStore } from "@/features/auth";
import { useThemeColors } from "@/lib/theme";
import { useIntegrations } from "../hooks/useIntegrations";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  onTaskPress?: (taskId: string) => void;
  onCreateTask?: () => void;
}

interface ConnectGitHubEmptyStateProps {
  onConnected?: () => void;
}

function ConnectGitHubEmptyState({
  onConnected,
}: ConnectGitHubEmptyStateProps) {
  const { cloudRegion, projectId, getCloudUrlFromRegion } = useAuthStore();
  const themeColors = useThemeColors();

  const handleConnectGitHub = async () => {
    if (!cloudRegion || !projectId) return;
    const baseUrl = getCloudUrlFromRegion(cloudRegion);
    // Use the authorize endpoint which redirects to GitHub App installation
    const authorizeUrl = `${baseUrl}/api/environments/${projectId}/integrations/authorize/?kind=github`;

    // Open in-app browser - will auto-detect when user returns
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      "posthog://github/callback",
    );

    // When browser session ends (dismiss, cancel, or redirect), refresh integrations
    if (
      result.type === "dismiss" ||
      result.type === "cancel" ||
      result.type === "success"
    ) {
      onConnected?.();
    }
  };

  return (
    <View className="flex-1 items-center justify-center p-6">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-gray-3">
        <Text className="text-3xl">🔗</Text>
      </View>
      <Text className="mb-2 text-center font-semibold text-gray-12 text-lg">
        Connect GitHub
      </Text>
      <Text className="mb-6 text-center text-gray-11 text-sm">
        Let PostHog work on your repositories.
      </Text>
      <Pressable
        onPress={handleConnectGitHub}
        className="rounded-lg px-6 py-3"
        style={{ backgroundColor: themeColors.accent[9] }}
      >
        <Text className="font-semibold text-accent-contrast">
          Connect GitHub
        </Text>
      </Pressable>
    </View>
  );
}

interface CreateTaskEmptyStateProps {
  onCreateTask?: () => void;
}

function CreateTaskEmptyState({ onCreateTask }: CreateTaskEmptyStateProps) {
  const themeColors = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center p-6">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-gray-3">
        <Text className="text-3xl">✨</Text>
      </View>
      <Text className="mb-2 text-center font-semibold text-gray-12 text-lg">
        No tasks yet
      </Text>
      <Text className="mb-6 text-center text-gray-11 text-sm">
        Create your first task to get PostHog working.
      </Text>
      {onCreateTask && (
        <Pressable
          onPress={onCreateTask}
          className="rounded-lg px-6 py-3"
          style={{ backgroundColor: themeColors.accent[9] }}
        >
          <Text className="font-semibold text-accent-contrast">
            Create task
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function TaskList({ onTaskPress, onCreateTask }: TaskListProps) {
  const { tasks, isLoading, error, refetch } = useTasks();
  const { hasGithubIntegration, refetch: refetchIntegrations } =
    useIntegrations();
  const themeColors = useThemeColors();

  const handleTaskPress = (task: Task) => {
    onTaskPress?.(task.id);
  };

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchIntegrations()]);
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="mb-4 text-center text-status-error">{error}</Text>
        <Pressable
          onPress={handleRefresh}
          className="rounded-lg bg-gray-3 px-4 py-2"
        >
          <Text className="text-gray-12">Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Show loading while tasks are loading OR while we haven't checked integrations yet (when no tasks)
  const isInitialLoading =
    (isLoading && tasks.length === 0) ||
    (tasks.length === 0 && hasGithubIntegration === null);

  if (isInitialLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={themeColors.accent[9]} />
        <Text className="mt-4 text-gray-11">Loading tasks...</Text>
      </View>
    );
  }

  // No GitHub connection and no tasks - prompt to connect GitHub
  if (hasGithubIntegration === false && tasks.length === 0) {
    return <ConnectGitHubEmptyState onConnected={handleRefresh} />;
  }

  // Has GitHub connection but no tasks - prompt to create first task
  if (tasks.length === 0) {
    return <CreateTaskEmptyState onCreateTask={onCreateTask} />;
  }

  // Has tasks - show the list (regardless of GitHub connection status)
  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TaskItem task={item} onPress={handleTaskPress} />
      )}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor={themeColors.accent[9]}
        />
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}
