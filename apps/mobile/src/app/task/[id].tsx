import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DynamicColorIOS,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Text } from "@components/text";
import {
  getTask,
  TaskSessionView,
  useTaskSessionStore,
  type Task,
} from "@/features/tasks";

export default function TaskDetailScreen() {
  const { id: taskId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    connectToTask,
    disconnectFromTask,
    sendPrompt,
    cancelPrompt,
    getSessionForTask,
  } = useTaskSessionStore();

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
          ? DynamicColorIOS({ dark: "#4ade80", light: "#16a34a" })
          : "#4ade80",
      connecting:
        Platform.OS === "ios"
          ? DynamicColorIOS({ dark: "#facc15", light: "#ca8a04" })
          : "#facc15",
      disconnected:
        Platform.OS === "ios"
          ? DynamicColorIOS({ dark: "#f87171", light: "#dc2626" })
          : "#f87171",
      error:
        Platform.OS === "ios"
          ? DynamicColorIOS({ dark: "#f87171", light: "#dc2626" })
          : "#f87171",
    };

    const color =
      statusColors[session.status as keyof typeof statusColors] ??
      statusColors.disconnected;

    return (
      <Text style={{ color }} className="text-xs font-medium">
        {session.status}
      </Text>
    );
  }, [session]);

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: false,
            headerTitle: "Loading...",
            headerStyle: { backgroundColor: "#09090b" },
            headerTintColor: "#fff",
            presentation: "modal",
          }}
        />
        <View className="flex-1 items-center justify-center bg-dark-bg">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-4 text-dark-text-muted">Loading task...</Text>
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
            headerStyle: { backgroundColor: "#09090b" },
            headerTintColor: "#fff",
            presentation: "modal",
          }}
        />
        <View className="flex-1 items-center justify-center bg-dark-bg px-4">
          <Text className="mb-4 text-center text-red-400">
            {error || "Task not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-dark-surface px-4 py-2"
          >
            <Text className="text-white">Go Back</Text>
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
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "600",
          },
          headerRight,
          presentation: "modal",
        }}
      />
      <View className="flex-1 bg-dark-bg">
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

