import { File, GitBranch } from "@phosphor-icons/react";
import { Box, Button, Dialog, Flex, RadioCards, Text } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { useEffect, useMemo, useState } from "react";

interface ConflictInfo {
  file: string;
  workspaces: string[];
}

interface ConflictResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictInfo[];
  repoPath: string;
  /** Map of workspace name to task info for display */
  workspaceToTask?: Map<string, { title?: string }>;
}

export function ConflictResolutionModal({
  open,
  onOpenChange,
  conflicts,
  repoPath,
  workspaceToTask,
}: ConflictResolutionModalProps) {
  const utils = trpcReact.useUtils();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");

  // Get unique workspaces across all conflicts
  const allWorkspaces = useMemo(() => {
    const workspaces = new Set<string>();
    for (const conflict of conflicts) {
      for (const ws of conflict.workspaces) {
        workspaces.add(ws);
      }
    }
    return Array.from(workspaces);
  }, [conflicts]);

  // Initialize selection when conflicts change
  useEffect(() => {
    if (allWorkspaces.length > 0 && !selectedWorkspace) {
      setSelectedWorkspace(allWorkspaces[0]);
    }
  }, [allWorkspaces, selectedWorkspace]);

  // Build choices map from selected workspace
  const choices = useMemo(() => {
    const result: Record<string, string> = {};
    for (const conflict of conflicts) {
      result[conflict.file] = selectedWorkspace;
    }
    return result;
  }, [conflicts, selectedWorkspace]);

  const resolveMutation = trpcReact.arr.resolveConflictsBatch.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.arr.focusStatus.invalidate({ cwd: repoPath }),
        utils.arr.listConflicts.invalidate({ cwd: repoPath }),
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath }),
        utils.arr.listUnassigned.invalidate({ cwd: repoPath }),
      ]);
      onOpenChange(false);
    },
  });

  const handleResolve = () => {
    resolveMutation.mutate({
      choices,
      cwd: repoPath,
    });
  };

  const getTaskTitle = (workspace: string) => {
    return workspaceToTask?.get(workspace)?.title;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 600 }}>
        <Dialog.Title>Resolve conflicts</Dialog.Title>

        <Text as="p" size="2" color="gray" mb="3">
          The following files are modified in multiple workspaces.
        </Text>
        <Text as="p" size="2" color="gray" mb="3">
          Choose which workspace to bring to the foreground.
        </Text>

        <Box
          mb="4"
          p="2"
          style={{
            backgroundColor: "var(--gray-2)",
            borderRadius: "var(--radius-2)",
          }}
        >
          <Flex direction="column" gap="1">
            {conflicts.map((conflict) => (
              <Flex key={conflict.file} align="center" gap="2">
                <File size={14} style={{ color: "var(--gray-10)" }} />
                <Text
                  size="2"
                  style={{ fontFamily: "var(--code-font-family)" }}
                >
                  {conflict.file}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Box>

        <RadioCards.Root
          value={selectedWorkspace}
          onValueChange={setSelectedWorkspace}
          color="green"
          columns={String(allWorkspaces.length)}
          gap="2"
          size="1"
        >
          {allWorkspaces.map((workspace) => {
            const taskTitle = getTaskTitle(workspace);
            return (
              <RadioCards.Item key={workspace} value={workspace}>
                <Flex direction="column" gap="1" width="100%">
                  <Text size="2" weight="medium">
                    {taskTitle || "Untitled task"}
                  </Text>
                  <Flex align="center" gap="1">
                    <GitBranch size={12} style={{ color: "var(--gray-9)" }} />
                    <Text size="1" color="gray">
                      {workspace}
                    </Text>
                  </Flex>
                </Flex>
              </RadioCards.Item>
            );
          })}
        </RadioCards.Root>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={handleResolve}
            disabled={!selectedWorkspace || resolveMutation.isPending}
          >
            {resolveMutation.isPending ? "Resolving..." : "Resolve"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
