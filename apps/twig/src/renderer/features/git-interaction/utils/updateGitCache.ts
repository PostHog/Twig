import type {
  ChangedFile,
  DiffStats,
  GitCommitInfo,
  GitStateSnapshot,
  GitSyncStatus,
  PrStatusOutput,
} from "@main/services/git/schemas";
import type { QueryClient } from "@tanstack/react-query";

export function updateGitCacheFromSnapshot(
  queryClient: QueryClient,
  repoPath: string,
  snapshot: GitStateSnapshot,
): void {
  if (snapshot.changedFiles !== undefined) {
    queryClient.setQueryData<ChangedFile[]>(
      ["changed-files-head", repoPath],
      snapshot.changedFiles,
    );
  }

  if (snapshot.diffStats !== undefined) {
    queryClient.setQueryData<DiffStats>(
      ["git-diff-stats", repoPath],
      snapshot.diffStats,
    );
  }

  if (snapshot.syncStatus !== undefined) {
    queryClient.setQueryData<GitSyncStatus>(
      ["git-sync-status", repoPath],
      snapshot.syncStatus,
    );
  }

  if (snapshot.latestCommit !== undefined) {
    queryClient.setQueryData<GitCommitInfo | null>(
      ["git-latest-commit", repoPath],
      snapshot.latestCommit,
    );
  }

  if (snapshot.prStatus !== undefined) {
    const currentBranch = snapshot.syncStatus?.currentBranch ?? null;
    queryClient.setQueryData<PrStatusOutput>(
      ["git-pr-status", repoPath, currentBranch],
      snapshot.prStatus,
    );
  }
}
