import { Text } from "@components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DynamicColorIOS,
  Platform,
  Pressable,
  View,
} from "react-native";
import {
  getTask,
  type Task,
  TaskSessionView,
  useTaskSessionStore,
} from "@/features/tasks";
import { useThemeColors } from "@/lib/theme";

export default function TaskDetailScreen() {
  const { id: taskId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const themeColors = useThemeColors();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectToTask, disconnectFromTask, sendPrompt, getSessionForTask } =
    useTaskSessionStore();

  const session = taskId ? getSessionForTask(taskId) : undefined;

  useEffect(() => {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    getTask(taskId)
      .then((fetchedTask) => {
        setTask(fetchedTask);
        return connectToTask(fetchedTask);
      })
      .catch((err) => {
        console.error("Failed to load task:", err);
        setError("Failed to load task");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      disconnectFromTask(taskId);
    };
  }, [taskId, connectToTask, disconnectFromTask]);

  const handleSendPrompt = useCallback(
    (text: string) => {
      if (!taskId) return;
      sendPrompt(taskId, text).catch((err) => {
        console.error("Failed to send prompt:", err);
      });
    },
    [taskId, sendPrompt],
  );

  const handleOpenTask = useCallback(
    (newTaskId: string) => {
      router.push(`/task/${newTaskId}`);
    },
    [router],
  );

  const headerRight = useCallback(() => {
    if (!session) return null;

    const statusColors = {
      connected:
        Platform.OS === "ios"
          ? DynamicColorIOS({
              dark: themeColors.status.success,
              light: themeColors.status.success,
            })
          : themeColors.status.success,
      connecting:
        Platform.OS === "ios"
          ? DynamicColorIOS({
              dark: themeColors.status.warning,
              light: themeColors.status.warning,
            })
          : themeColors.status.warning,
      disconnected:
        Platform.OS === "ios"
          ? DynamicColorIOS({
              dark: themeColors.status.error,
              light: themeColors.status.error,
            })
          : themeColors.status.error,
      error:
        Platform.OS === "ios"
          ? DynamicColorIOS({
              dark: themeColors.status.error,
              light: themeColors.status.error,
            })
          : themeColors.status.error,
    };

    const color =
      statusColors[session.status as keyof typeof statusColors] ??
      statusColors.disconnected;

    return (
      <Text style={{ color }} className="font-medium text-xs">
        {session.status}
      </Text>
    );
  }, [session, themeColors]);

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: false,
            headerTitle: "Loading...",
            headerStyle: { backgroundColor: themeColors.background },
            headerTintColor: themeColors.gray[12],
            presentation: "modal",
          }}
        />
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" color={themeColors.accent[9]} />
          <Text className="mt-4 text-gray-11">Loading task...</Text>
        </View>
      </>
    );
  }

  if (error || !task) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: false,
            headerTitle: "Error",
            headerStyle: { backgroundColor: themeColors.background },
            headerTintColor: themeColors.gray[12],
            presentation: "modal",
          }}
        />
        <View className="flex-1 items-center justify-center bg-background px-4">
          <Text className="mb-4 text-center text-status-error">
            {error || "Task not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-gray-3 px-4 py-2"
          >
            <Text className="text-gray-12">Go back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerTitle: task.title || "Task",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
          headerTitleStyle: {
            fontWeight: "600",
          },
          headerRight,
          presentation: "modal",
        }}
      />
      <View className="flex-1 bg-background">
        <TaskSessionView
          events={session?.events ?? []}
          isPromptPending={session?.isPromptPending ?? false}
          onSendPrompt={handleSendPrompt}
          onOpenTask={handleOpenTask}
        />
      </View>
    </>
  );
}
