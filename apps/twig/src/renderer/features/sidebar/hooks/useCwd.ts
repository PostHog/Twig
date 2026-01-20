import { useWorkspaceStore } from "@renderer/features/workspace/stores/workspaceStore";

export function useCwd(taskId: string): string | undefined {
  const workspace = useWorkspaceStore((state) => state.workspaces[taskId]);

  if (!workspace) return undefined;

  return workspace.worktreePath ?? workspace.folderPath;
}
