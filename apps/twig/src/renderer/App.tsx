import { LoginTransition } from "@components/LoginTransition";
import { MainLayout } from "@components/MainLayout";
import { AuthScreen } from "@features/auth/components/AuthScreen";
import { useAuthStore } from "@features/auth/stores/authStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { initializePostHog } from "@renderer/lib/analytics";
import { initializeConnectivityStore } from "@renderer/stores/connectivityStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@utils/toast";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

function App() {
  const { isAuthenticated, initializeOAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [showTransition, setShowTransition] = useState(false);
  const wasAuthenticated = useRef(isAuthenticated);

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  // Initialize connectivity monitoring
  useEffect(() => {
    return initializeConnectivityStore();
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

  // Global workspace promotion listener - updates store and shows toast
  useEffect(() => {
    const subscription = trpcVanilla.workspace.onPromoted.subscribe(undefined, {
      onData: (data) => {
        // Update the workspace in the store with the new worktree info
        const workspace = useWorkspaceStore
          .getState()
          .getWorkspace(data.taskId);
        if (workspace) {
          useWorkspaceStore.getState().updateWorkspace(data.taskId, {
            ...workspace,
            mode: "worktree",
            worktreePath: data.worktree.worktreePath,
            worktreeName: data.worktree.worktreeName,
            branchName: data.worktree.branchName,
            baseBranch: data.worktree.baseBranch,
          });
        }

        // Show toast to let user know what happened
        toast.info(
          "Task moved to worktree",
          `Task is now working in its own worktree on branch "${data.fromBranch}"`,
        );
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    initializeOAuth().finally(() => setIsLoading(false));
  }, [initializeOAuth]);

  // Handle auth state change for transition
  useEffect(() => {
    if (!wasAuthenticated.current && isAuthenticated) {
      // User just logged in - trigger transition
      setShowTransition(true);
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  const handleTransitionComplete = () => {
    setShowTransition(false);
  };

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
    <>
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="auth"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AuthScreen />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: showTransition ? 1.5 : 0 }}
          >
            <MainLayout />
          </motion.div>
        )}
      </AnimatePresence>
      <LoginTransition
        isAnimating={showTransition}
        onComplete={handleTransitionComplete}
      />
    </>
  );
}

export default App;
