import { ConnectivityScreen } from "@components/ConnectivityScreen";
import { MainLayout } from "@components/MainLayout";
import { AuthScreen } from "@features/auth/components/AuthScreen";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { useConnectivity } from "@renderer/hooks/useConnectivity";
import { initializePostHog } from "@renderer/lib/analytics";
import { trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@utils/toast";
import { useEffect, useState } from "react";

function App() {
  const { isAuthenticated, initializeOAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const { isOnline, isChecking, check } = useConnectivity();

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  // Global workspace error listener for toasts
  useEffect(() => {
    const subscription = trpcVanilla.workspace.onError.subscribe(undefined, {
      onData: (data) => {
        toast.error("Workspace error", { description: data.message });
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    initializeOAuth().finally(() => setIsLoading(false));
  }, [initializeOAuth]);

  if (!isOnline) {
    return <ConnectivityScreen isChecking={isChecking} onRetry={check} />;
  }

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

  return isAuthenticated ? <MainLayout /> : <AuthScreen />;
}

export default App;
