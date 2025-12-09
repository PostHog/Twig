import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAuthStore } from "../../stores/authStore";

export default function TasksScreen() {
  const router = useRouter();
  const { cloudRegion, projectId } = useAuthStore();

  const handleCreateTask = () => {
    router.push("/chat");
  };

  return (
    <ScrollView className="flex-1 bg-dark-bg">
      <View className="px-6 pt-16 pb-32">
        {/* Header */}
        <View className="mb-10">
          <Text className="mb-2 font-bold text-3xl text-white">Tasks</Text>
          <Text className="text-base text-dark-text-muted">
            Your PostHog tasks
          </Text>
        </View>

        {/* Create New Task Button */}
        <Pressable
          onPress={handleCreateTask}
          className="mb-6 items-center rounded-xl bg-orange-500 py-4 active:bg-orange-600"
        >
          <Text className="font-semibold text-base text-white">
            Create new task
          </Text>
        </Pressable>

        {/* Info Card */}
        <View className="mb-6 rounded-xl bg-dark-surface p-4">
          <View className="flex-row justify-between py-2">
            <Text className="text-dark-text-muted text-sm">Region</Text>
            <Text className="font-medium text-sm text-white">
              {cloudRegion?.toUpperCase() || "N/A"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-dark-text-muted text-sm">Project ID</Text>
            <Text className="font-medium text-sm text-white">
              {projectId || "N/A"}
            </Text>
          </View>
        </View>

        {/* Empty State */}
        <View className="flex-1 items-center justify-center py-20">
          <Text className="text-base text-dark-text-muted">No tasks yet</Text>
        </View>
      </View>
    </ScrollView>
  );
}
