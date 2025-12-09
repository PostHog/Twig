import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";

export default function SettingsScreen() {
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
        <View className="mb-10">
          <Text className="text-3xl font-bold text-white mb-2">Settings</Text>
          <Text className="text-base text-dark-text-muted">
            App preferences
          </Text>
        </View>

        {/* Placeholder Content */}
        <View className="bg-dark-surface rounded-xl p-4 mb-6">
          <Text className="text-sm text-dark-text-muted text-center">
            Settings coming soon...
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="bg-dark-surface py-4 rounded-lg items-center border border-dark-border"
          onPress={handleLogout}
        >
          <Text className="text-white text-base font-semibold">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
