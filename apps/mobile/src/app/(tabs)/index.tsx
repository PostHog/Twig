import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "../../components/text";
import { TaskList } from "../../features/tasks/components/TaskList";

export default function TasksScreen() {
  const router = useRouter();

  const handleCreateTask = () => {
    router.push("/agent");
  };

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header */}
      <View className="border-dark-border border-b px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-2xl text-white">Tasks</Text>
            <Text className="text-dark-text-muted text-sm">
              Your PostHog tasks
            </Text>
          </View>
          <Pressable
            onPress={handleCreateTask}
            className="rounded-lg bg-orange-500 px-4 py-2 active:bg-orange-600"
          >
            <Text className="font-semibold text-sm text-white">New task</Text>
          </Pressable>
        </View>
      </View>

      {/* Task List */}
      <TaskList />
    </View>
  );
}
