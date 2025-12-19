import { router } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "../../features/auth";

export default function SettingsScreen() {
  const { logout, cloudRegion } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/auth");
  };

  return (
    <ScrollView className="flex-1 bg-dark-bg">
      <View className="px-6 pt-16 pb-32">
        {/* Header */}
        <View className="mb-10">
          <Text className="mb-2 font-bold text-3xl text-white">Profile</Text>
          <Text className="text-base text-dark-text-muted">
            Your account settings
          </Text>
        </View>

        {/* Account Info */}
        <View className="mb-6 rounded-xl bg-dark-surface p-4">
          <Text className="mb-4 font-semibold text-lg text-white">Account</Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-dark-text-muted text-sm">Region</Text>
            <Text className="font-medium text-sm text-white">
              {cloudRegion?.toUpperCase() || "N/A"}
            </Text>
          </View>
        </View>

        {/* Placeholder Content */}
        <View className="mb-6 rounded-xl bg-dark-surface p-4">
          <Text className="mb-4 font-semibold text-lg text-white">
            Preferences
          </Text>
          <Text className="text-center text-dark-text-muted text-sm">
            More settings coming soon...
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="items-center rounded-lg border border-red-500/30 bg-red-500/10 py-4"
          onPress={handleLogout}
        >
          <Text className="font-semibold text-base text-red-500">Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
