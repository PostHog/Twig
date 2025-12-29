import { Text } from "@components/text";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  onTaskPress?: (taskId: string) => void;
}

export function TaskList({ onTaskPress }: TaskListProps) {
  const { tasks, isLoading, error, refetch } = useTasks();

  const handleTaskPress = (task: Task) => {
    onTaskPress?.(task.id);
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="mb-4 text-center text-red-400">{error}</Text>
        <Pressable
          onPress={refetch}
          className="rounded-lg bg-dark-surface px-4 py-2"
        >
          <Text className="text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading && tasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-dark-text-muted">Loading tasks...</Text>
      </View>
    );
  }

  if (tasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-dark-text-muted">No tasks yet</Text>
        <Text className="mt-2 text-center text-gray-600 text-sm">
          Create a new task to get started
        </Text>
      </View>
    );
  }

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
          onRefresh={refetch}
          tintColor="#f97316"
        />
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}
