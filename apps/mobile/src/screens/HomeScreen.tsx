import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';

export function HomeScreen() {
  const { logout, cloudRegion, projectId } = useAuthStore();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
        <View className="mb-10">
          <Text className="text-3xl font-bold text-white mb-2">
            Welcome!
          </Text>
          <Text className="text-base text-dark-text-muted">
            You're signed in to PostHog
          </Text>
        </View>

        {/* Info Card */}
        <View className="bg-dark-surface rounded-xl p-4 mb-6">
          <View className="flex-row justify-between py-2">
            <Text className="text-sm text-dark-text-muted">Region</Text>
            <Text className="text-sm font-medium text-white">
              {cloudRegion?.toUpperCase() || 'N/A'}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-sm text-dark-text-muted">Project ID</Text>
            <Text className="text-sm font-medium text-white">
              {projectId || 'N/A'}
            </Text>
          </View>
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
