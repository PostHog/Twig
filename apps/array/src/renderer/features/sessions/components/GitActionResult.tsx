import {
  ArrowSquareOut,
  CheckCircle,
  GitCommit,
  GitPullRequest,
} from "@phosphor-icons/react";
import { Badge, Box, Button, Flex, Text } from "@radix-ui/themes";

interface GitResult {
  type: "commit" | "pr";
  sha?: string;
  message?: string;
  prNumber?: string;
  prUrl?: string;
  prTitle?: string;
}

// Parse agent response for commit SHAs and PR URLs
export function parseGitResults(content: string): GitResult[] {
  const results: GitResult[] = [];

  // Match commit SHA patterns (7-40 hex chars, often after "commit" or in backticks)
  // Look for patterns like: "committed as `abc1234`" or "commit abc1234" or "SHA: abc1234"
  const commitPatterns = [
    /commit(?:ted)?[:\s]+[`']?([a-f0-9]{7,40})[`']?/gi,
    /sha[:\s]+[`']?([a-f0-9]{7,40})[`']?/gi,
    /\[([a-f0-9]{7,40})\]/g,
  ];

  const seenShas = new Set<string>();
  for (const pattern of commitPatterns) {
    for (const match of content.matchAll(pattern)) {
      const sha = match[1].toLowerCase();
      if (!seenShas.has(sha)) {
        seenShas.add(sha);
        results.push({ type: "commit", sha });
      }
    }
  }

  // Match GitHub PR URLs
  const prUrlPattern = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/gi;
  const seenPrs = new Set<string>();
  for (const prMatch of content.matchAll(prUrlPattern)) {
    const prUrl = prMatch[0];
    const prNumber = prMatch[3];
    if (!seenPrs.has(prNumber)) {
      seenPrs.add(prNumber);
      results.push({ type: "pr", prNumber, prUrl });
    }
  }

  return results;
}

interface GitActionResultProps {
  results: GitResult[];
}

export function GitActionResult({ results }: GitActionResultProps) {
  if (results.length === 0) {
    return null;
  }

  const handleOpenUrl = (url: string) => {
    window.electronAPI.openExternal(url);
  };

  const commits = results.filter((r) => r.type === "commit");
  const prs = results.filter((r) => r.type === "pr");

  return (
    <Box className="mt-3 rounded-lg border border-green-6 bg-green-2 p-3">
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <CheckCircle size={16} weight="fill" className="text-green-9" />
          <Text size="2" weight="medium" className="text-green-11">
            Git Action Completed
          </Text>
        </Flex>

        {commits.length > 0 && (
          <Flex direction="column" gap="1">
            {commits.map((commit) => (
              <Flex key={commit.sha} align="center" gap="2">
                <GitCommit size={14} className="text-gray-10" />
                <Text size="1" className="font-mono text-gray-11">
                  {commit.sha?.slice(0, 7)}
                </Text>
                <Badge size="1" color="gray" variant="soft">
                  Committed
                </Badge>
              </Flex>
            ))}
          </Flex>
        )}

        {prs.length > 0 && (
          <Flex direction="column" gap="2">
            {prs.map((pr) => (
              <Flex key={pr.prNumber} align="center" gap="2">
                <GitPullRequest size={14} className="text-purple-9" />
                <Text size="1" weight="medium">
                  PR #{pr.prNumber}
                </Text>
                {pr.prUrl ? (
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() => handleOpenUrl(pr.prUrl as string)}
                  >
                    <ArrowSquareOut size={12} />
                    View PR
                  </Button>
                ) : null}
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
