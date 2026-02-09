import {
  ArrowSquareOut,
  CheckCircle,
  GitCommit,
  GitPullRequest,
} from "@phosphor-icons/react";
import { Badge, Box, Button, Flex, Text } from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { trpcVanilla } from "@/renderer/trpc";
import type { GitActionType } from "./GitActionMessage";

interface GitActionResultProps {
  actionType: GitActionType;
  repoPath: string;
  turnId: string;
}

export function GitActionResult({
  actionType,
  repoPath,
  turnId,
}: GitActionResultProps) {
  const { data: commitInfo } = useQuery({
    queryKey: ["git-latest-commit", repoPath, turnId],
    queryFn: () =>
      trpcVanilla.git.getLatestCommit.query({ directoryPath: repoPath }),
    enabled: !!repoPath,
    staleTime: 0,
  });

  const { data: repoInfo } = useQuery({
    queryKey: ["git-repo-info", repoPath, turnId],
    queryFn: () =>
      trpcVanilla.git.getGitRepoInfo.query({ directoryPath: repoPath }),
    enabled: !!repoPath,
    staleTime: 30000,
  });

  const handleOpenUrl = (url: string) => {
    trpcVanilla.os.openExternal.mutate({ url });
  };

  const showCommit = commitInfo != null;
  const showPrLink = repoInfo?.compareUrl != null;

  if (!showCommit && !showPrLink) {
    return null;
  }

  return (
    <Box className="mt-3 rounded-lg border border-green-6 bg-green-2 p-3">
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <CheckCircle size={16} weight="fill" className="text-green-9" />
          <Text size="2" weight="medium" className="text-green-11">
            {getCompletionLabel(actionType)}
          </Text>
        </Flex>

        {showCommit && commitInfo && (
          <Flex align="center" gap="2" className="mt-1">
            <GitCommit size={14} className="text-gray-10" />
            <Text size="1" className="font-mono text-gray-11">
              {commitInfo.shortSha}
            </Text>
            <Text
              size="1"
              className="text-gray-11"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "200px",
              }}
            >
              {commitInfo.message}
            </Text>
            <Badge size="1" color="green" variant="soft">
              Latest
            </Badge>
          </Flex>
        )}

        {showPrLink && repoInfo?.compareUrl && (
          <Flex align="center" gap="2" className="mt-1">
            <GitPullRequest size={14} className="text-purple-9" />
            <Text size="1" weight="medium">
              {repoInfo.currentBranch}
            </Text>
            <Button
              size="1"
              variant="ghost"
              onClick={() => handleOpenUrl(repoInfo.compareUrl as string)}
            >
              <ArrowSquareOut size={12} />
              Open on GitHub
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  );
}

function getCompletionLabel(actionType: GitActionType): string {
  switch (actionType) {
    case "commit-push":
      return "Changes Committed & Pushed";
    case "push":
      return "Changes Pushed";
    case "pull":
      return "Changes Pulled";
    case "sync":
      return "Repository Synced";
    case "publish":
      return "Branch Published";
    case "create-pr":
      return "Ready for Pull Request";
    default:
      return "Git Action Completed";
  }
}
