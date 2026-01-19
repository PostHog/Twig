import { useUpdateTask } from "@features/tasks/hooks/useTasks";
import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useState } from "react";

const log = logger.scope("rename-dialog");

interface RenameTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameTaskDialog({
  task,
  open,
  onOpenChange,
}: RenameTaskDialogProps) {
  const [newTitle, setNewTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const updateTask = useUpdateTask();

  useEffect(() => {
    if (task && open) {
      setNewTitle(task.title);
      setErrorMessage(null);
    }
  }, [task, open]);

  const handleRename = useCallback(async () => {
    if (!task || !newTitle.trim()) {
      return;
    }

    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        updates: { title: newTitle.trim() },
      });
      onOpenChange(false);
    } catch (error) {
      log.error("Failed to rename task", error);
      setErrorMessage("Failed to rename task. Please try again.");
    }
  }, [task, newTitle, updateTask, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleRename();
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [handleRename, onOpenChange],
  );

  if (!task) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="450px" size="1">
        <Flex direction="column">
          <Dialog.Title size="2">Rename task</Dialog.Title>
          <TextField.Root
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={task.title}
            autoFocus
            size="1"
            mb="2"
          />
          {errorMessage && (
            <Text size="1" color="red">
              {errorMessage}
            </Text>
          )}
          <Flex justify="end" gap="3" mt="2">
            <Button
              size="1"
              type="button"
              variant="soft"
              color="gray"
              onClick={() => onOpenChange(false)}
              disabled={updateTask.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="1"
              onClick={handleRename}
              disabled={updateTask.isPending || !newTitle.trim()}
              loading={updateTask.isPending}
            >
              Save
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
