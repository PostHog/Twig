import './global.css';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuthStore } from './src/stores/authStore';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, isLoading, initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return isAuthenticated ? <HomeScreen /> : <AuthScreen />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <View className="flex-1 bg-dark-bg">
        <AppContent />
        <StatusBar style="light" />
      </View>
    </QueryClientProvider>
  );
}
