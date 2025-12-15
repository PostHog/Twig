import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type SmartGitAction =
  | "commit-push"
  | "publish"
  | "push"
  | "pull"
  | "sync"
  | "create-pr"
  | null;

export interface GitStatus {
  hasChanges: boolean;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  currentBranch: string | null;
  isFeatureBranch: boolean;
  smartAction: SmartGitAction;
  isLoading: boolean;
  isFetched: boolean;
}

interface GitStatusOptions {
  repoPath: string | null;
  hasChanges: boolean;
  enabled?: boolean;
}

function determineSmartAction(
  hasChanges: boolean,
  ahead: number,
  behind: number,
  hasRemote: boolean,
  isFeatureBranch: boolean,
  isFetched: boolean,
): SmartGitAction {
  if (!isFetched) {
    return null;
  }

  // Priority order for smart action:
  // 1. If there are uncommitted changes -> commit & push
  // 2. If branch has no remote -> publish branch
  // 3. If behind remote -> pull (or sync if also ahead)
  // 4. If ahead of remote -> push
  // 5. If synced on a feature branch -> create PR
  // 6. Otherwise -> null (up to date on default branch)

  if (hasChanges) {
    return "commit-push";
  }

  if (!hasRemote) {
    return "publish";
  }

  if (behind > 0 && ahead > 0) {
    return "sync";
  }

  if (behind > 0) {
    return "pull";
  }

  if (ahead > 0) {
    return "push";
  }

  if (isFeatureBranch) {
    return "create-pr";
  }

  return null;
}

export function useGitStatus({
  repoPath,
  hasChanges,
  enabled = true,
}: GitStatusOptions): GitStatus {
  const {
    data: syncStatus,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ["git-sync-status", repoPath],
    queryFn: () => window.electronAPI.getGitSyncStatus(repoPath as string),
    enabled: enabled && !!repoPath,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const ahead = syncStatus?.ahead ?? 0;
  const behind = syncStatus?.behind ?? 0;
  const hasRemote = syncStatus?.hasRemote ?? true;
  const currentBranch = syncStatus?.currentBranch ?? null;
  const isFeatureBranch = syncStatus?.isFeatureBranch ?? false;

  const smartAction = determineSmartAction(
    hasChanges,
    ahead,
    behind,
    hasRemote,
    isFeatureBranch,
    isFetched,
  );

  return {
    hasChanges,
    ahead,
    behind,
    hasRemote,
    currentBranch,
    isFeatureBranch,
    smartAction,
    isLoading,
    isFetched,
  };
}

export const GIT_ACTION_PROMPTS: Record<
  Exclude<SmartGitAction, null>,
  string
> = {
  "commit-push":
    "Commit all current changes with an appropriate commit message that describes what was done, then push to origin.",
  publish:
    "Push this branch to origin to publish it (create the remote tracking branch).",
  push: "Push the committed changes to origin.",
  pull: "Pull the latest changes from origin.",
  sync: "Pull the latest changes from origin, then push local commits to sync with the remote.",
  "create-pr":
    "Create a pull request for this branch with an appropriate title and description summarizing the changes.",
};

export const GIT_ACTION_LABELS: Record<
  Exclude<SmartGitAction, null>,
  string
> = {
  "commit-push": "Commit & Push",
  publish: "Publish Branch",
  push: "Push",
  pull: "Pull",
  sync: "Sync",
  "create-pr": "Create PR",
};
