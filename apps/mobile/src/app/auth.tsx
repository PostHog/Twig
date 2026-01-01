import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type CloudRegion, useAuthStore } from "@/features/auth";
import { useThemeColors } from "@/lib/theme";

type RegionOption = { value: CloudRegion; label: string };

const PRODUCTION_REGIONS: RegionOption[] = [
  { value: "us", label: "US Cloud" },
  { value: "eu", label: "EU Cloud" },
];

const DEV_REGIONS: RegionOption[] = [
  ...PRODUCTION_REGIONS,
  { value: "dev", label: "Development" },
];

export default function AuthScreen() {
  const themeColors = useThemeColors();

  // Only show dev region in development builds
  const regions = useMemo<RegionOption[]>(
    () => (__DEV__ ? DEV_REGIONS : PRODUCTION_REGIONS),
    [],
  );
  const [selectedRegion, setSelectedRegion] = useState<CloudRegion>("us");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loginWithOAuth } = useAuthStore();

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loginWithOAuth(selectedRegion);
      // Navigate to tabs on success
      router.replace("/(tabs)");
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
    <SafeAreaView className="flex-1 bg-gray-1">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
        <View className="mb-10">
          <Text className="mb-2 font-bold text-3xl text-gray-12">
            PostHog Mobile
          </Text>
          <Text className="text-base text-gray-11">
            Sign in with your PostHog account
          </Text>
        </View>

        {/* Form */}
        <View className="gap-4">
          <Text className="mb-2 font-medium text-gray-11 text-sm">
            PostHog region
          </Text>

          {/* Region Picker */}
          <View className="mb-4 flex-row gap-3">
            {regions.map((region) => (
              <TouchableOpacity
                key={region.value}
                className={`flex-1 items-center rounded-lg border px-4 py-3 ${
                  selectedRegion === region.value
                    ? "border-accent-9 bg-accent-3"
                    : "border-gray-6 bg-gray-3"
                }`}
                onPress={() => setSelectedRegion(region.value)}
              >
                <Text
                  className={`font-medium text-sm ${
                    selectedRegion === region.value
                      ? "text-accent-11"
                      : "text-gray-11"
                  }`}
                >
                  {region.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error Message */}
          {error && (
            <View className="rounded-lg border border-status-error bg-status-error/10 p-3">
              <Text className="text-sm text-status-error">{error}</Text>
            </View>
          )}

          {/* Loading Message */}
          {isLoading && (
            <View className="rounded-lg border border-status-info bg-status-info/10 p-3">
              <Text className="text-sm text-status-info">
                Waiting for authorization in your browser...
              </Text>
            </View>
          )}

          {/* Sign In Button */}
          <TouchableOpacity
            className={`mt-2 items-center rounded-lg py-4 ${
              isLoading ? "bg-gray-7" : "bg-accent-9"
            }`}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={themeColors.gray[12]} />
            ) : (
              <Text className="font-semibold text-accent-contrast text-base">
                Sign in with PostHog
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
