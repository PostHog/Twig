import { router } from "expo-router";
import {
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthStore, useUserQuery } from "@/features/auth";

export default function SettingsScreen() {
  const { logout, cloudRegion, getCloudUrlFromRegion } = useAuthStore();
  const { data: userData } = useUserQuery();

  const handleLogout = async () => {
    await logout();
    router.replace("/auth");
  };

  const handleOpenSettings = () => {
    if (!cloudRegion) return;
    const baseUrl = getCloudUrlFromRegion(cloudRegion);
    Linking.openURL(`${baseUrl}/settings`);
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-12 pb-12">
        {/* Header */}
        <View className="mb-8">
          <Text className="font-bold text-3xl text-gray-12">Settings</Text>
        </View>

        {/* Organization */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Organization
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Region</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {cloudRegion?.toUpperCase() || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Display name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.organization?.name || "—"}
            </Text>
          </View>
        </View>

        {/* Project */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Project
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Display name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.team?.name || "—"}
            </Text>
          </View>
        </View>

        {/* Profile */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Profile
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">First name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.first_name || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Last name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.last_name || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Email</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.email || "—"}
            </Text>
          </View>
        </View>

        {/* All Settings Button */}
        <TouchableOpacity
          className="mb-6 items-center rounded-lg border border-gray-6 bg-gray-3 py-4"
          onPress={handleOpenSettings}
        >
          <Text className="font-semibold text-base text-gray-12">
            All settings
          </Text>
        </TouchableOpacity>

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
