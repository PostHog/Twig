import { Text } from "@components/text";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { TaskList } from "@/features/tasks";

export default function TasksScreen() {
  const router = useRouter();

  const handleCreateTask = () => {
    router.push("/task");
  };

  const handleTaskPress = (taskId: string) => {
    router.push(`/task/${taskId}`);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-gray-6 border-b px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-2xl text-gray-12">Tasks</Text>
            <Text className="text-gray-11 text-sm">Your PostHog tasks</Text>
          </View>
          <Pressable
            onPress={handleCreateTask}
            className="rounded-lg bg-accent-9 px-4 py-2"
          >
            <Text className="font-semibold text-accent-contrast text-sm">
              New task
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Task List */}
      <TaskList onTaskPress={handleTaskPress} onCreateTask={handleCreateTask} />
    </View>
  );
}
