import { useAuthStore } from "@features/auth/stores/authStore";
import { tiptapToMarkdown } from "@features/editor/utils/tiptap-converter";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTaskInputStore } from "@features/task-detail/stores/taskInputStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

const log = logger.scope("task-creation");

interface UseTaskCreationOptions {
  editor: Editor | null;
  selectedDirectory: string;
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

async function startAgentSession(task: Task, repoPath: string): Promise<void> {
  await useSessionStore.getState().connectToTask({
    taskId: task.id,
    repoPath,
  });
}

export function useTaskCreation({
  editor,
  selectedDirectory,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
  const { navigateToTask } = useNavigationStore();
  const { client, isAuthenticated } = useAuthStore();
  const { setRepoPath: saveRepoPath } = useTaskExecutionStore();
  const { autoRunTasks } = useSettingsStore();
  const { clearDraft } = useTaskInputStore();

  const canSubmit =
    !!editor &&
    isAuthenticated &&
    !!client &&
    !!selectedDirectory &&
    !isCreatingTask &&
    !editor.isEmpty;

  const handleSubmit = useCallback(async () => {
    const canSubmit =
      !!editor &&
      isAuthenticated &&
      !!client &&
      !!selectedDirectory &&
      !isCreatingTask &&
      !editor.isEmpty;

    if (!canSubmit) {
      return;
    }

    const content = tiptapToMarkdown(editor.getJSON()).trim();
    if (!content) {
      return;
    }

    let repository: string | undefined;
    if (selectedDirectory) {
      const detected = await window.electronAPI.detectRepo(selectedDirectory);
      if (detected) {
        repository = `${detected.organization}/${detected.repository}`;
      }
    }

    createTask(
      {
        description: content,
        repository,
        autoRun: autoRunTasks,
        createdFrom: "cli",
      },
      {
        onSuccess: async (newTask: Task) => {
          if (selectedDirectory) {
            await saveRepoPath(newTask.id, selectedDirectory);
          }

          navigateToTask(newTask);
          editor.commands.clearContent();
          clearDraft();

          if (autoRunTasks && selectedDirectory) {
            await startAgentSession(newTask, selectedDirectory);
          }
        },
        onError: (error) => {
          log.error("Failed to create task:", error);
        },
      },
    );
  }, [
    editor,
    selectedDirectory,
    createTask,
    saveRepoPath,
    navigateToTask,
    autoRunTasks,
    clearDraft,
    isCreatingTask,
    client,
    isAuthenticated,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
