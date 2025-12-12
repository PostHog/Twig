import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type SmartGitAction =
  | "commit-push"
  | "publish"
  | "push"
  | "pull"
  | "sync"
  | null;

export interface GitStatus {
  hasChanges: boolean;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  currentBranch: string | null;
  smartAction: SmartGitAction;
  isLoading: boolean;
  isFetched: boolean;
}

interface GitStatusOptions {
  repoPath: string | null;
  hasChanges: boolean;
}

function determineSmartAction(
  hasChanges: boolean,
  ahead: number,
  behind: number,
  hasRemote: boolean,
  isFetched: boolean,
): SmartGitAction {
  // Don't show any action until we have fetched data at least once
  if (!isFetched) {
    return null;
  }

  // Priority order for smart action:
  // 1. If there are uncommitted changes -> commit & push
  // 2. If branch has no remote -> publish branch
  // 3. If behind remote -> pull (or sync if also ahead)
  // 4. If ahead of remote -> push
  // 5. Otherwise -> null (up to date)

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

  return null;
}

export function useGitStatus({
  repoPath,
  hasChanges,
}: GitStatusOptions): GitStatus {
  const {
    data: syncStatus,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ["git-sync-status", repoPath],
    queryFn: () => window.electronAPI.getGitSyncStatus(repoPath as string),
    enabled: !!repoPath,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds (less frequent)
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid flicker
    placeholderData: keepPreviousData, // Keep previous data while refetching
  });

  const ahead = syncStatus?.ahead ?? 0;
  const behind = syncStatus?.behind ?? 0;
  const hasRemote = syncStatus?.hasRemote ?? true; // Default to true to avoid "Publish" flash
  const currentBranch = syncStatus?.currentBranch ?? null;

  const smartAction = determineSmartAction(
    hasChanges,
    ahead,
    behind,
    hasRemote,
    isFetched,
  );

  return {
    hasChanges,
    ahead,
    behind,
    hasRemote,
    currentBranch,
    smartAction,
    isLoading,
    isFetched,
  };
}

// Prompt templates for each action
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
};

// Labels for each action
export const GIT_ACTION_LABELS: Record<
  Exclude<SmartGitAction, null>,
  string
> = {
  "commit-push": "Commit & Push",
  publish: "Publish Branch",
  push: "Push",
  pull: "Pull",
  sync: "Sync",
};
