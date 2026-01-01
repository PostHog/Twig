import "../../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/features/auth";
import { useThemeColors } from "@/lib/useThemeColors";

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isLoading, initializeAuth } = useAuthStore();
  const themeColors = useThemeColors();

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

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <RootLayoutNav />
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
