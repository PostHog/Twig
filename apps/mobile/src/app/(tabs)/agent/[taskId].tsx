import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AgentSessionView } from "../../../features/agent/components/AgentSessionView";
import { getTask } from "../../../features/agent/lib/agentApi";
import { useAgentSessionStore } from "../../../features/agent/stores/agentSessionStore";
import type { Task } from "../../../features/agent/types/agent";

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectToTask, disconnectFromTask, sendPrompt, getSessionForTask } =
    useAgentSessionStore();

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

  const handleCancel = useCallback(() => {
    // For cloud runs, we don't have a direct cancel mechanism
    // The agent will complete its current operation
    console.log("Cancel requested - cloud runs complete their current operation");
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6b7280" />
          <Text className="text-neutral-500 mt-4">Loading conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !task) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900">
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-red-500 text-center mb-4">
            {error || "Task not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="bg-neutral-800 px-6 py-3 rounded-xl"
          >
            <Text className="text-white">Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-neutral-700">
        <Pressable onPress={() => router.back()} className="mr-4">
          <Text className="text-blue-500 text-base">Back</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-white font-medium" numberOfLines={1}>
            {task.title || "Conversation"}
          </Text>
          {task.repository && (
            <Text className="text-neutral-400 text-sm" numberOfLines={1}>
              {task.repository}
            </Text>
          )}
        </View>
        {session && (
          <View
            className={`px-2 py-1 rounded ${
              session.status === "connected"
                ? "bg-green-900"
                : session.status === "connecting"
                  ? "bg-yellow-900"
                  : "bg-red-900"
            }`}
          >
            <Text className="text-white text-xs">{session.status}</Text>
          </View>
        )}
      </View>

      <AgentSessionView
        events={session?.events ?? []}
        isPromptPending={session?.isPromptPending ?? false}
        onSendPrompt={handleSendPrompt}
        onCancel={handleCancel}
      />
    </SafeAreaView>
  );
}
