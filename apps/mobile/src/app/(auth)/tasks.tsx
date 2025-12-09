import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";

export default function TasksScreen() {
  const { cloudRegion, projectId } = useAuthStore();

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
        <View className="mb-10">
          <Text className="text-3xl font-bold text-white mb-2">Tasks</Text>
          <Text className="text-base text-dark-text-muted">
            Your PostHog tasks
          </Text>
        </View>

        {/* Info Card */}
        <View className="bg-dark-surface rounded-xl p-4 mb-6">
          <View className="flex-row justify-between py-2">
            <Text className="text-sm text-dark-text-muted">Region</Text>
            <Text className="text-sm font-medium text-white">
              {cloudRegion?.toUpperCase() || "N/A"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-sm text-dark-text-muted">Project ID</Text>
            <Text className="text-sm font-medium text-white">
              {projectId || "N/A"}
            </Text>
          </View>
        </View>

        {/* Empty State */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-dark-text-muted text-base">No tasks yet</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
