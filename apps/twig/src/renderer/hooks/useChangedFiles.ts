import { trpcVanilla } from "@renderer/trpc/client";
import type { ChangedFile } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export const CHANGED_FILES_QUERY_KEY = "changed-files-head";

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

function computeDiffStats(files: ChangedFile[]): DiffStats {
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const file of files) {
    filesChanged++;
    linesAdded += file.linesAdded ?? 0;
    linesRemoved += file.linesRemoved ?? 0;
  }

  return { filesChanged, linesAdded, linesRemoved };
}

interface UseChangedFilesOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export function useChangedFiles(
  repoPath: string | null | undefined,
  options: UseChangedFilesOptions = {},
) {
  const { enabled = true, refetchInterval } = options;

  const {
    data: changedFiles = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [CHANGED_FILES_QUERY_KEY, repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: enabled && !!repoPath,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval,
    placeholderData: (prev) => prev,
  });

  const diffStats = useMemo(
    () => computeDiffStats(changedFiles),
    [changedFiles],
  );

  return {
    changedFiles,
    diffStats,
    isLoading,
    error,
  };
}

export function useDiffStats(
  repoPath: string | null | undefined,
  options: UseChangedFilesOptions = {},
) {
  const { diffStats, isLoading, error } = useChangedFiles(repoPath, options);
  return { diffStats, isLoading, error };
}
