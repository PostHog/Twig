import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { logger } from "@renderer/lib/logger";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const log = logger.scope("file-watcher");

export function useFileWatcher(repoPath: string | null, taskId?: string) {
  const queryClient = useQueryClient();
  const closeTabsForFile = usePanelLayoutStore((s) => s.closeTabsForFile);

  useEffect(() => {
    if (!repoPath) return;

    trpcVanilla.fileWatcher.start.mutate({ repoPath }).catch((error) => {
      log.error("Failed to start file watcher:", error);
    });

    return () => {
      trpcVanilla.fileWatcher.stop.mutate({ repoPath });
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
    },
  });
}
