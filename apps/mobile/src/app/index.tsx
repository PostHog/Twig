import "../../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import TasksScreen from "./(auth)/tasks";
import AuthScreen from "./auth";

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, isLoading, initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return isAuthenticated ? <TasksScreen /> : <AuthScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <View className="flex-1 bg-dark-bg">
          <AppContent />
          <StatusBar style="light" />
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
