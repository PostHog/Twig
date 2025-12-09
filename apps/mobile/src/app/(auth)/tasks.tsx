import { Link } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";

export default function TasksScreen() {
  const { cloudRegion, projectId, logout } = useAuthStore();

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <View className="flex-1 px-6 pt-16">
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

        {/* Chat Links */}
        <Link href="/(auth)/agent" className="mb-3 rounded-xl bg-blue-600 p-4">
          <Text className="text-center font-medium text-white">
            Array Agent
          </Text>
        </Link>
        <Link href="/chat" className="mb-6 rounded-xl bg-dark-surface p-4">
          <Text className="text-center font-medium text-white">
            PostHog AI (Max)
          </Text>
        </Link>

        {/* Empty State */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-dark-text-muted">No tasks yet</Text>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={logout}
          className="mb-6 rounded-xl bg-dark-surface p-4"
        >
          <Text className="text-center font-medium text-red-500">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
