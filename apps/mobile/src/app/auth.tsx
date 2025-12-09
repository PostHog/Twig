import { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import type { CloudRegion } from "../types/oauth";

const REGIONS: { value: CloudRegion; label: string }[] = [
  { value: "us", label: "US Cloud" },
  { value: "eu", label: "EU Cloud" },
];

// Add dev region in development
if (__DEV__) {
  REGIONS.push({ value: "dev", label: "Development" });
}

export default function AuthScreen() {
  const [selectedRegion, setSelectedRegion] = useState<CloudRegion>("us");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loginWithOAuth } = useAuthStore();

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loginWithOAuth(selectedRegion);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to authenticate";

      if (message.includes("cancelled") || message.includes("cancel")) {
        setError("Authorization cancelled.");
      } else if (message.includes("timed out")) {
        setError("Authorization timed out. Please try again.");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
        <View className="mb-10">
          <Text className="text-3xl font-bold text-white mb-2">
            PostHog Mobile
          </Text>
          <Text className="text-base text-dark-text-muted">
            Sign in with your PostHog account
          </Text>
        </View>

        {/* Form */}
        <View className="gap-4">
          <Text className="text-sm font-medium text-dark-text-muted mb-2">
            PostHog region
          </Text>

          {/* Region Picker */}
          <View className="flex-row gap-3 mb-4">
            {REGIONS.map((region) => (
              <TouchableOpacity
                key={region.value}
                className={`flex-1 py-3 px-4 rounded-lg border items-center ${
                  selectedRegion === region.value
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-dark-border bg-dark-surface"
                }`}
                onPress={() => setSelectedRegion(region.value)}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedRegion === region.value
                      ? "text-orange-500"
                      : "text-dark-text-muted"
                  }`}
                >
                  {region.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error Message */}
          {error && (
            <View className="bg-red-500/10 rounded-lg p-3 border border-red-500">
              <Text className="text-red-500 text-sm">{error}</Text>
            </View>
          )}

          {/* Loading Message */}
          {isLoading && (
            <View className="bg-blue-500/10 rounded-lg p-3 border border-blue-500">
              <Text className="text-blue-500 text-sm">
                Waiting for authorization in your browser...
              </Text>
            </View>
          )}

          {/* Sign In Button */}
          <TouchableOpacity
            className={`py-4 rounded-lg items-center mt-2 ${
              isLoading ? "bg-gray-600" : "bg-orange-500"
            }`}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Sign in with PostHog
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
