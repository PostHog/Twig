import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useFileWatcher(repoPath: string | null, taskId?: string) {
  const queryClient = useQueryClient();
  const closeTabsForFile = usePanelLayoutStore((s) => s.closeTabsForFile);

  useEffect(() => {
    if (!repoPath || !window.electronAPI) return;

    const currentRepoPath = repoPath;

    window.electronAPI.watcherStart(currentRepoPath).catch((error) => {
      console.error("Failed to start file watcher:", error);
    });

    const unsubFile = window.electronAPI.onFileChanged(
      ({ repoPath: rp, filePath }) => {
        if (rp !== currentRepoPath) return;
        const relativePath = filePath.replace(`${currentRepoPath}/`, "");
        queryClient.invalidateQueries({
          queryKey: ["repo-file", currentRepoPath, relativePath],
        });
        // Also refresh the changed files list since git status output changed
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", currentRepoPath],
        });
      },
    );

    const unsubDelete = window.electronAPI.onFileDeleted(
      ({ repoPath: rp, filePath }) => {
        if (rp !== currentRepoPath) return;
        // Refresh the changed files list
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", currentRepoPath],
        });
        if (!taskId) return;
        const relativePath = filePath.replace(`${currentRepoPath}/`, "");
        closeTabsForFile(taskId, relativePath);
      },
    );

    const unsubGit = window.electronAPI.onGitStateChanged(
      ({ repoPath: rp }) => {
        if (rp !== currentRepoPath) return;
        queryClient.invalidateQueries({
          queryKey: ["file-at-head", currentRepoPath],
        });
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", currentRepoPath],
        });
      },
    );

    return () => {
      unsubFile();
      unsubDelete();
      unsubGit();
      window.electronAPI.watcherStop(currentRepoPath);
    };
  }, [repoPath, taskId, queryClient, closeTabsForFile]);
}
