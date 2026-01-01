import { router } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "@/features/auth";

export default function SettingsScreen() {
  const { logout, cloudRegion } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/auth");
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-32">
        {/* Header */}
        <View className="mb-10">
          <Text className="mb-2 font-bold text-3xl text-gray-12">Profile</Text>
          <Text className="text-base text-gray-11">Your account settings</Text>
        </View>

        {/* Account Info */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Account
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Region</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {cloudRegion?.toUpperCase() || "N/A"}
            </Text>
          </View>
        </View>

        {/* Placeholder Content */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Preferences
          </Text>
          <Text className="text-center text-gray-11 text-sm">
            More settings coming soon...
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="items-center rounded-lg border border-status-error bg-status-error/10 py-4"
          onPress={handleLogout}
        >
          <Text className="font-semibold text-base text-status-error">
            Sign out
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
