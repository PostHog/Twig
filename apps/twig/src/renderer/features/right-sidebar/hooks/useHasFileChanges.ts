import { useCwd } from "@features/sidebar/hooks/useCwd";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";

export function useHasFileChanges(taskId: string): boolean {
  const repoPath = useCwd(taskId);

  const { data: changedFiles = [] } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  return changedFiles.length > 0;
}
