import { CopyIcon } from "@phosphor-icons/react";
import { Code, Flex, Tooltip } from "@radix-ui/themes";
import { toast } from "@utils/toast";
import type React from "react";
import { useCallback } from "react";

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  const lastTwo = parts.slice(-2).join("/");
  return `~/.../${lastTwo}`;
}

interface WorktreePathDisplayProps {
  worktreePath: string;
}

export function WorktreePathDisplay({
  worktreePath,
}: WorktreePathDisplayProps) {
  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(worktreePath);
    toast.success("Path copied to clipboard");
  }, [worktreePath]);

  return (
    <Tooltip content="Click to copy path">
      <Flex
        align="center"
        gap="1"
        onClick={handleCopyPath}
        style={
          {
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
            cursor: "pointer",
          } as React.CSSProperties
        }
      >
        <Code size="1" color="gray" variant="ghost" style={{ opacity: 0.6 }}>
          {shortenPath(worktreePath)}
        </Code>
        <CopyIcon size={14} style={{ opacity: 0.6 }} />
      </Flex>
    </Tooltip>
  );
}
