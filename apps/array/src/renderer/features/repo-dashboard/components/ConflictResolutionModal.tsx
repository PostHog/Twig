import { File, Warning } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  RadioGroup,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { useEffect, useState } from "react";

interface ConflictInfo {
  file: string;
  workspaces: string[];
}

interface ConflictResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictInfo[];
  repoPath: string;
}

export function ConflictResolutionModal({
  open,
  onOpenChange,
  conflicts,
  repoPath,
}: ConflictResolutionModalProps) {
  const utils = trpcReact.useUtils();
  const [choices, setChoices] = useState<Record<string, string>>({});

  // Initialize choices when conflicts change
  useEffect(() => {
    const initialChoices: Record<string, string> = {};
    for (const conflict of conflicts) {
      if (conflict.workspaces.length > 0) {
        initialChoices[conflict.file] = conflict.workspaces[0];
      }
    }
    setChoices(initialChoices);
  }, [conflicts]);

  const resolveMutation = trpcReact.arr.resolveConflictsBatch.useMutation({
    onSuccess: () => {
      utils.arr.focusStatus.invalidate({ cwd: repoPath });
      utils.arr.listConflicts.invalidate({ cwd: repoPath });
      utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      onOpenChange(false);
    },
  });

  const handleChoiceChange = (file: string, workspace: string) => {
    setChoices((prev) => ({ ...prev, [file]: workspace }));
  };

  const handleResolveAll = () => {
    resolveMutation.mutate({
      choices,
      cwd: repoPath,
    });
  };

  const allResolved = conflicts.every((c) => choices[c.file]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 600 }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Warning size={20} style={{ color: "var(--red-9)" }} />
            Resolve Conflicts
          </Flex>
        </Dialog.Title>

        <Dialog.Description size="2" color="gray" mb="4">
          {conflicts.length} file{conflicts.length !== 1 ? "s" : ""} have
          conflicting changes across workspaces. Choose which version to keep
          for each file.
        </Dialog.Description>

        <ScrollArea style={{ maxHeight: 400 }}>
          <Flex direction="column" gap="4">
            {conflicts.map((conflict) => (
              <Box
                key={conflict.file}
                p="3"
                style={{
                  backgroundColor: "var(--gray-2)",
                  borderRadius: "var(--radius-2)",
                }}
              >
                <Flex direction="column" gap="3">
                  <Flex align="center" gap="2">
                    <File size={14} />
                    <Text
                      size="2"
                      weight="medium"
                      style={{ fontFamily: "monospace" }}
                    >
                      {conflict.file}
                    </Text>
                    <Badge color="red" size="1">
                      {conflict.workspaces.length} versions
                    </Badge>
                  </Flex>

                  <RadioGroup.Root
                    value={choices[conflict.file] || ""}
                    onValueChange={(value) =>
                      handleChoiceChange(conflict.file, value)
                    }
                  >
                    <Flex direction="column" gap="2">
                      {conflict.workspaces.map((workspace) => (
                        <RadioGroup.Item key={workspace} value={workspace}>
                          <Text size="2">
                            Keep changes from <strong>{workspace}</strong>
                          </Text>
                        </RadioGroup.Item>
                      ))}
                    </Flex>
                  </RadioGroup.Root>
                </Flex>
              </Box>
            ))}
          </Flex>
        </ScrollArea>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={handleResolveAll}
            disabled={!allResolved || resolveMutation.isPending}
          >
            {resolveMutation.isPending
              ? "Resolving..."
              : `Resolve ${conflicts.length} Conflict${conflicts.length !== 1 ? "s" : ""}`}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
