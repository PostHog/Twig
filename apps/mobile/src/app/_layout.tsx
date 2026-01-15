import "../../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { PostHogProvider } from "posthog-react-native";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/features/auth";
import { posthog, useScreenTracking } from "@/lib/posthog";
import { queryClient } from "@/lib/queryClient";
import { darkTheme, lightTheme, useThemeColors } from "@/lib/theme";

function RootLayoutNav() {
  const { isLoading, initializeAuth } = useAuthStore();
  const themeColors = useThemeColors();

  useScreenTracking();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={themeColors.accent[9]} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: themeColors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />

      {/* Chat routes - regular stack navigation */}
      <Stack.Screen
        name="chat/index"
        options={{
          headerShown: true,
          headerBackTitle: "",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
        }}
      />

      {/* Task routes - modal presentation */}
      <Stack.Screen
        name="task/index"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "New task",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.accent[9],
        }}
      />
      <Stack.Screen
        name="task/[id]"
        options={{
          presentation: "modal",
          headerShown: true,
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const themeVars = colorScheme === "dark" ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <PostHogProvider
          client={posthog}
          autocapture={{
            captureTouches: true,
            captureScreens: false, // We handle screen tracking manually for expo-router
          }}
        >
          <QueryClientProvider client={queryClient}>
            <View style={themeVars} className="flex-1">
              <RootLayoutNav />
            </View>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          </QueryClientProvider>
        </PostHogProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
