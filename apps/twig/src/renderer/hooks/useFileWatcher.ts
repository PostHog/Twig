import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { logger } from "@renderer/lib/logger";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

const log = logger.scope("file-watcher");

// Debounce time for arr query invalidations (ms)
const ARR_INVALIDATION_DEBOUNCE_MS = 100;

export function useFileWatcher(repoPath: string | null, taskId?: string) {
  const queryClient = useQueryClient();
  const closeTabsForFile = usePanelLayoutStore((s) => s.closeTabsForFile);
  const utils = trpcReact.useUtils();
  const arrInvalidationTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Debounced invalidation of arr queries (listUnassigned, workspaceStatus)
  // to avoid excessive refetches when many files change rapidly
  const invalidateArrQueries = () => {
    if (arrInvalidationTimer.current) {
      clearTimeout(arrInvalidationTimer.current);
    }
    arrInvalidationTimer.current = setTimeout(() => {
      if (repoPath) {
        utils.arr.listUnassigned.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      }
      arrInvalidationTimer.current = null;
    }, ARR_INVALIDATION_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!repoPath) return;

    trpcVanilla.fileWatcher.start.mutate({ repoPath }).catch((error) => {
      log.error("Failed to start file watcher:", error);
    });

    return () => {
      trpcVanilla.fileWatcher.stop.mutate({ repoPath });
      if (arrInvalidationTimer.current) {
        clearTimeout(arrInvalidationTimer.current);
      }
    };
  }, [repoPath]);

  trpcReact.fileWatcher.onFileChanged.useSubscription(undefined, {
    enabled: !!repoPath,
    onData: ({ repoPath: rp, filePath }) => {
      if (rp !== repoPath) return;
      const relativePath = filePath.replace(`${repoPath}/`, "");
      queryClient.invalidateQueries({
        queryKey: ["repo-file", repoPath, relativePath],
      });
      queryClient.invalidateQueries({
        queryKey: ["changed-files-head", repoPath],
      });
      queryClient.invalidateQueries({
        queryKey: ["diff-stats", repoPath],
      });
      // Also invalidate jj workspace file queries (for any workspace)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            (key[0] === "workspace-file" &&
              key[1] === repoPath &&
              key[3] === relativePath) ||
            (key[0] === "workspace-file-parent" &&
              key[1] === repoPath &&
              key[3] === relativePath)
          );
        },
      });
      // Invalidate arr queries (listUnassigned, workspaceStatus) for immediate UI updates
      invalidateArrQueries();
    },
  });

  trpcReact.fileWatcher.onFileDeleted.useSubscription(undefined, {
    enabled: !!repoPath,
    onData: ({ repoPath: rp, filePath }) => {
      if (rp !== repoPath) return;
      queryClient.invalidateQueries({
        queryKey: ["changed-files-head", repoPath],
      });
      queryClient.invalidateQueries({
        queryKey: ["diff-stats", repoPath],
      });
      // Invalidate arr queries for immediate UI updates
      invalidateArrQueries();
      if (!taskId) return;
      const relativePath = filePath.replace(`${repoPath}/`, "");
      closeTabsForFile(taskId, relativePath);
    },
  });

  trpcReact.fileWatcher.onGitStateChanged.useSubscription(undefined, {
    enabled: !!repoPath,
    onData: ({ repoPath: rp }) => {
      if (rp !== repoPath) return;
      queryClient.invalidateQueries({ queryKey: ["file-at-head", repoPath] });
      queryClient.invalidateQueries({
        queryKey: ["changed-files-head", repoPath],
      });
      queryClient.invalidateQueries({
        queryKey: ["diff-stats", repoPath],
      });
      queryClient.invalidateQueries({
        queryKey: ["git-sync-status", repoPath],
      });
      // Invalidate arr queries for immediate UI updates
      invalidateArrQueries();
    },
  });
}
