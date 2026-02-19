import { ErrorBoundary } from "@components/ErrorBoundary";
import { LoginTransition } from "@components/LoginTransition";
import { MainLayout } from "@components/MainLayout";
import { TwigAuthScreen } from "@features/auth/components/TwigAuthScreen";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import { OnboardingFlow } from "@features/onboarding/components/OnboardingFlow";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { initializePostHog } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { initializeConnectivityStore } from "@renderer/stores/connectivityStore";
import { useFocusStore } from "@renderer/stores/focusStore";
import { useThemeStore } from "@renderer/stores/themeStore";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@utils/toast";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const log = logger.scope("app");

function App() {
  const { isAuthenticated, hasCompletedOnboarding } = useTwigAuthStore();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const [isLoading, setIsLoading] = useState(true);
  const [showTransition, setShowTransition] = useState(false);
  const wasInMainApp = useRef(isAuthenticated && hasCompletedOnboarding);

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  // Initialize connectivity monitoring
  useEffect(() => {
    return initializeConnectivityStore();
  }, []);

  // Dev-only inbox demo command for local QA from the renderer console.
  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    void import("@features/inbox/devtools/inboxDemoConsole").then(
      ({ registerInboxDemoConsoleCommand }) => {
        registerInboxDemoConsoleCommand();
      },
    );
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

  // Global branch change listener - updates store when branch is renamed
  trpcReact.workspace.onBranchChanged.useSubscription(undefined, {
    onData: (data) => {
      const workspace = useWorkspaceStore.getState().getWorkspace(data.taskId);
      if (workspace) {
        useWorkspaceStore.getState().updateWorkspace(data.taskId, {
          ...workspace,
          branchName: data.branchName,
        });
      }
    },
  });

  // Listen for branch renames when a worktree is focused
  trpcReact.focus.onBranchRenamed.useSubscription(undefined, {
    onData: ({ worktreePath, newBranch }) => {
      useFocusStore.getState().updateSessionBranch(worktreePath, newBranch);
      const workspaces = useWorkspaceStore.getState().workspaces;
      for (const [taskId, workspace] of Object.entries(workspaces)) {
        if (workspace.worktreePath === worktreePath) {
          useWorkspaceStore.getState().updateWorkspace(taskId, {
            ...workspace,
            branchName: newBranch,
          });
        }
      }
    },
  });

  // Auto-unfocus when user manually checks out to a different branch
  trpcReact.focus.onForeignBranchCheckout.useSubscription(undefined, {
    onData: async ({ focusedBranch, foreignBranch }) => {
      log.warn(
        `Foreign branch checkout detected: ${focusedBranch} -> ${foreignBranch}. Auto-unfocusing.`,
      );
      await useFocusStore.getState().disableFocus();
    },
  });

  // Wait for twigAuthStore to hydrate from electronStorage
  useEffect(() => {
    const checkHydration = async () => {
      if (!useTwigAuthStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          useTwigAuthStore.persist.onFinishHydration(() => resolve());
        });
      }
      setIsLoading(false);
    };
    checkHydration();
  }, []);

  // Handle transition into main app (from onboarding completion)
  useEffect(() => {
    const isInMainApp = isAuthenticated && hasCompletedOnboarding;
    if (!wasInMainApp.current && isInMainApp) {
      setShowTransition(true);
    }
    wasInMainApp.current = isInMainApp;
  }, [isAuthenticated, hasCompletedOnboarding]);

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

  // Three-phase rendering: auth → onboarding → main app
  const renderContent = () => {
    if (!isAuthenticated) {
      return (
        <motion.div
          key="auth"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <TwigAuthScreen />
        </motion.div>
      );
    }

    if (!hasCompletedOnboarding) {
      return (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <OnboardingFlow />
        </motion.div>
      );
    }

    return (
      <motion.div
        key="main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: showTransition ? 1.5 : 0 }}
      >
        <MainLayout />
      </motion.div>
    );
  };

  return (
    <ErrorBoundary name="App">
      <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
      <LoginTransition
        isAnimating={showTransition}
        isDarkMode={isDarkMode}
        onComplete={handleTransitionComplete}
      />
    </ErrorBoundary>
  );
}

export default App;
