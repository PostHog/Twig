import { MainLayout } from "@components/MainLayout";
import { DragDropProvider } from "@dnd-kit/react";
import { AuthScreen } from "@features/auth/components/AuthScreen";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { initializePostHog } from "@renderer/lib/analytics";
import { useEffect, useState } from "react";
import { useDragDropHandlers } from "@/renderer/hooks/useDragDropHandlers";
import { useRecordingQuerySync } from "@/renderer/hooks/useRecordingQuerySync";
import {
  initializeRecordingService,
  shutdownRecordingService,
} from "@/renderer/services/recordingService";

function App() {
  const { isAuthenticated, initializeOAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const dragDropHandlers = useDragDropHandlers();

  useRecordingQuerySync();

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  useEffect(() => {
    initializeOAuth().finally(() => setIsLoading(false));
  }, [initializeOAuth]);

  // Initialize recording service when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    console.log("[App] Initializing recording service");
    initializeRecordingService();

    // Cleanup on unmount
    return () => {
      console.log("[App] Shutting down recording service");
      shutdownRecordingService();
    };
  }, [isAuthenticated]);

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

  const content = isAuthenticated ? <MainLayout /> : <AuthScreen />;

  return <DragDropProvider {...dragDropHandlers}>{content}</DragDropProvider>;
}

export default App;
