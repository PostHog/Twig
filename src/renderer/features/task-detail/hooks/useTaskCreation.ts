import { useAuthStore } from "@features/auth/stores/authStore";
import { tiptapToMarkdown } from "@features/editor/utils/tiptap-converter";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTaskInputStore } from "@features/task-detail/stores/taskInputStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import type { RepositoryConfig, Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

interface UseTaskCreationOptions {
  editor: Editor | null;
  selectedDirectory: string;
  detectedRepo: RepositoryConfig | null;
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

/**
 * Hook to manage task creation and submission
 * Handles:
 * - Task creation with repo config
 * - Directory persistence
 * - Navigation to new task
 * - Auto-run logic
 * - Draft cleanup
 */
export function useTaskCreation({
  editor,
  selectedDirectory,
  detectedRepo,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
  const { navigateToTask } = useNavigationStore();
  const { client, isAuthenticated } = useAuthStore();
  const {
    setRepoPath: saveRepoPath,
    setRunMode,
    runTask,
  } = useTaskExecutionStore();
  const { autoRunTasks, defaultRunMode, lastUsedRunMode } = useSettingsStore();
  const { clearDraft } = useTaskInputStore();

  const canSubmit =
    !!editor &&
    !!isAuthenticated &&
    !!client &&
    !!selectedDirectory &&
    !isCreatingTask &&
    !editor.isEmpty;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !editor) {
      return;
    }

    const content = tiptapToMarkdown(editor.getJSON()).trim();
    if (!content) {
      return;
    }

    const repositoryConfig = detectedRepo || undefined;

    createTask(
      {
        description: content,
        repositoryConfig,
        autoRun: autoRunTasks,
        createdFrom: "cli",
      },
      {
        onSuccess: (newTask: Task) => {
          if (selectedDirectory) {
            saveRepoPath(newTask.id, selectedDirectory);
          }

          navigateToTask(newTask);
          editor.commands.clearContent();
          clearDraft();

          if (autoRunTasks) {
            let runMode: "local" | "cloud" = "local";

            if (defaultRunMode === "cloud") {
              runMode = "cloud";
            } else if (defaultRunMode === "last_used") {
              runMode = lastUsedRunMode;
            }

            setRunMode(newTask.id, runMode);
            runTask(newTask.id, newTask);
          }
        },
        onError: (error) => {
          console.error("Failed to create task:", error);
        },
      },
    );
  }, [
    canSubmit,
    editor,
    selectedDirectory,
    detectedRepo,
    createTask,
    saveRepoPath,
    navigateToTask,
    autoRunTasks,
    defaultRunMode,
    lastUsedRunMode,
    setRunMode,
    runTask,
    clearDraft,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
