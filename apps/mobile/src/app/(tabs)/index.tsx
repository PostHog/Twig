import { ScrollView, Text, View } from "react-native";
import { useAuthStore } from "../../stores/authStore";

export default function TasksScreen() {
  const { cloudRegion, projectId } = useAuthStore();

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
