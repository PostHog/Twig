import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useFileWatcher(repoPath: string | null, taskId?: string) {
  const queryClient = useQueryClient();
  const closeTabsForFile = usePanelLayoutStore((s) => s.closeTabsForFile);

  useEffect(() => {
    if (!repoPath) return;

    window.electronAPI.watcherStart(repoPath).catch((error) => {
      console.error("Failed to start file watcher:", error);
    });

    const unsubFile = window.electronAPI.onFileChanged(
      ({ repoPath: rp, filePath }) => {
        if (rp !== repoPath) return;
        const relativePath = filePath.replace(`${repoPath}/`, "");
        queryClient.invalidateQueries({
          queryKey: ["repo-file", repoPath, relativePath],
        });
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", repoPath],
        });
      },
    );

    const unsubDelete = window.electronAPI.onFileDeleted(
      ({ repoPath: rp, filePath }) => {
        if (rp !== repoPath) return;
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", repoPath],
        });
        if (!taskId) return;
        const relativePath = filePath.replace(`${repoPath}/`, "");
        closeTabsForFile(taskId, relativePath);
      },
    );

    const unsubGit = window.electronAPI.onGitStateChanged(
      ({ repoPath: rp }) => {
        if (rp !== repoPath) return;
        queryClient.invalidateQueries({ queryKey: ["file-at-head", repoPath] });
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", repoPath],
        });
      },
    );

    return () => {
      unsubFile();
      unsubDelete();
      unsubGit();
      window.electronAPI.watcherStop(repoPath);
    };
  }, [repoPath, taskId, queryClient, closeTabsForFile]);
}
