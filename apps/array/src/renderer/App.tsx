import { ErrorBoundary } from "@components/ErrorBoundary";
import { MainLayout } from "@components/MainLayout";
import { AuthScreen } from "@features/auth/components/AuthScreen";
import { useAuthStore } from "@features/auth/stores/authStore";
import { useUserNotifications } from "@hooks/useUserNotifications";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { initializePostHog } from "@renderer/lib/analytics";
import { useEffect, useState } from "react";

function App() {
  const { isAuthenticated, initializeOAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  // Global notification listener - handles all main process notifications
  useUserNotifications();

  useEffect(() => {
    initializeOAuth().finally(() => setIsLoading(false));
  }, [initializeOAuth]);

  if (isLoading) {
    return (
      <Flex align="center" justify="center" minHeight="100vh">
        <Flex align="center" gap="3">
          <Spinner size="3" />
          <Text color="gray">Loading...</Text>
        </Flex>
      </Flex>
    );
  }

  return (
    <ErrorBoundary>
      {isAuthenticated ? <MainLayout /> : <AuthScreen />}
    </ErrorBoundary>
  );
}

export default App;
