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
          <Text className="mb-2 font-bold text-3xl text-white">Settings</Text>
          <Text className="text-base text-dark-text-muted">
            App preferences
          </Text>
        </View>

        {/* Placeholder Content */}
        <View className="mb-6 rounded-xl bg-dark-surface p-4">
          <Text className="text-center text-dark-text-muted text-sm">
            Settings coming soon...
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="items-center rounded-lg border border-dark-border bg-dark-surface py-4"
          onPress={handleLogout}
        >
          <Text className="font-semibold text-base text-white">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
