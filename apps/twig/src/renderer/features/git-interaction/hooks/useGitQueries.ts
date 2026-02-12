import { trpcVanilla } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";

const EMPTY_DIFF_STATS = { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };

const GIT_QUERY_DEFAULTS = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
} as const;

export function useGitQueries(repoPath?: string) {
  const enabled = !!repoPath;

  const { data: isRepo = false, isLoading: isRepoLoading } = useQuery({
    queryKey: ["git-validate-repo", repoPath],
    queryFn: () =>
      trpcVanilla.git.validateRepo.query({ directoryPath: repoPath as string }),
    enabled,
    ...GIT_QUERY_DEFAULTS,
  });

  const repoEnabled = enabled && isRepo;

  const { data: changedFiles = [], isLoading: changesLoading } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: repoEnabled,
    ...GIT_QUERY_DEFAULTS,
    refetchOnMount: "always",
    placeholderData: (prev) => prev,
  });

  const { data: diffStats = EMPTY_DIFF_STATS } = useQuery({
    queryKey: ["git-diff-stats", repoPath],
    queryFn: () =>
      trpcVanilla.git.getDiffStats.query({
        directoryPath: repoPath as string,
      }),
    enabled: repoEnabled,
    ...GIT_QUERY_DEFAULTS,
    placeholderData: (prev) => prev ?? EMPTY_DIFF_STATS,
  });

  const { data: syncStatus, isLoading: syncLoading } = useQuery({
    queryKey: ["git-sync-status", repoPath],
    queryFn: () =>
      trpcVanilla.git.getGitSyncStatus.query({
        directoryPath: repoPath as string,
      }),
    enabled: repoEnabled,
    ...GIT_QUERY_DEFAULTS,
    refetchInterval: 60_000,
  });

  const { data: repoInfo } = useQuery({
    queryKey: ["git-repo-info", repoPath],
    queryFn: () =>
      trpcVanilla.git.getGitRepoInfo.query({
        directoryPath: repoPath as string,
      }),
    enabled: repoEnabled,
    ...GIT_QUERY_DEFAULTS,
    staleTime: 60_000,
  });

  const { data: ghStatus } = useQuery({
    queryKey: ["git-gh-status"],
    queryFn: () => trpcVanilla.git.getGhStatus.query(),
    enabled,
    ...GIT_QUERY_DEFAULTS,
    staleTime: 60_000,
  });

  const currentBranch = syncStatus?.currentBranch ?? null;

  const { data: prStatus } = useQuery({
    queryKey: ["git-pr-status", repoPath, currentBranch],
    queryFn: () =>
      trpcVanilla.git.getPrStatus.query({ directoryPath: repoPath as string }),
    enabled: repoEnabled && !!ghStatus?.installed && !!currentBranch,
    ...GIT_QUERY_DEFAULTS,
  });

  const { data: latestCommit } = useQuery({
    queryKey: ["git-latest-commit", repoPath],
    queryFn: () =>
      trpcVanilla.git.getLatestCommit.query({
        directoryPath: repoPath as string,
      }),
    enabled: repoEnabled,
    ...GIT_QUERY_DEFAULTS,
  });

  const hasChanges = changedFiles.length > 0;
  const ahead = syncStatus?.ahead ?? 0;
  const behind = syncStatus?.behind ?? 0;
  const hasRemote = syncStatus?.hasRemote ?? true;
  const defaultBranch = repoInfo?.defaultBranch ?? null;

  return {
    isRepo,
    isRepoLoading,
    changedFiles,
    changesLoading,
    diffStats,
    syncStatus,
    syncLoading,
    repoInfo,
    ghStatus,
    prStatus,
    latestCommit,
    hasChanges,
    ahead,
    behind,
    hasRemote,
    currentBranch,
    defaultBranch,
    isLoading: isRepoLoading || changesLoading || syncLoading,
  };
}
