import { logger } from "@renderer/lib/logger";
import { trpcReact, trpcVanilla } from "@renderer/trpc";
import { useNavigationStore } from "@stores/navigationStore";
import { useRegisteredFoldersStore } from "@stores/registeredFoldersStore";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const log = logger.scope("cli-path");

/**
 * Hook that subscribes to CLI open-path events and handles opening repositories.
 * When the user runs `twig /path/to/repo`, this hook:
 * 1. Adds the folder if not already registered
 * 2. Navigates to the task input view with that folder selected
 */
export function useCliPath() {
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );
  const addFolder = useRegisteredFoldersStore((state) => state.addFolder);
  const foldersLoaded = useRegisteredFoldersStore((state) => state.isLoaded);
  const hasFetchedPending = useRef(false);

  const handleOpenPath = useCallback(
    async (targetPath: string) => {
      log.info(`Opening path from CLI: ${targetPath}`);

      try {
        // Add the folder (this also handles git init if needed)
        const folder = await addFolder(targetPath);

        // Navigate to task input with this folder selected
        navigateToTaskInput(folder.id);

        log.info(`Successfully opened path from CLI: ${targetPath}`);
        toast.success(`Opened ${folder.name}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to open path from CLI:", error);
        toast.error(`Failed to open folder: ${message}`);
      }
    },
    [addFolder, navigateToTaskInput],
  );

  // Check for pending path on mount (for cold start via CLI)
  useEffect(() => {
    if (!foldersLoaded || hasFetchedPending.current) return;

    const fetchPending = async () => {
      hasFetchedPending.current = true;
      try {
        const pending = await trpcVanilla.cli.getPendingPath.query();
        if (pending) {
          log.info(`Found pending CLI path: ${pending.path}`);
          handleOpenPath(pending.path);
        }
      } catch (error) {
        log.error("Failed to check for pending CLI path:", error);
      }
    };

    fetchPending();
  }, [foldersLoaded, handleOpenPath]);

  // Subscribe to CLI open-path events (for warm start via CLI)
  trpcReact.cli.onOpenPath.useSubscription(undefined, {
    onData: (data) => {
      log.info(`Received CLI open-path event: ${data.path}`);
      if (!data?.path) return;
      handleOpenPath(data.path);
    },
  });
}
