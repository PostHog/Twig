import { useAuthStore } from "@features/auth/stores/authStore";
import {
  extractFileMentions,
  tiptapToMarkdown,
} from "@features/editor/utils/tiptap-converter";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { logger } from "@renderer/lib/logger";
import type {
  TaskCreationInput,
  TaskService,
} from "@renderer/services/task/service";
import type { WorkspaceMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import type { Editor } from "@tiptap/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const log = logger.scope("task-creation");

interface UseTaskCreationOptions {
  editor: Editor | null;
  selectedDirectory: string;
  selectedRepository?: string | null;
  githubIntegrationId?: number;
  workspaceMode: WorkspaceMode;
  branch?: string | null;
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

/**
 * Helper function to prepare saga input from editor state
 */
function prepareTaskInput(
  editor: Editor,
  options: {
    selectedDirectory: string;
    selectedRepository?: string | null;
    githubIntegrationId?: number;
    workspaceMode: WorkspaceMode;
    branch?: string | null;
    autoRun: boolean;
  },
): TaskCreationInput {
  const editorJson = editor.getJSON();
  return {
    content: tiptapToMarkdown(editorJson).trim(),
    filePaths: extractFileMentions(editorJson),
    repoPath: options.selectedDirectory,
    repository: options.selectedRepository,
    githubIntegrationId: options.githubIntegrationId,
    workspaceMode: options.workspaceMode,
    branch: options.branch,
    autoRun: options.autoRun,
  };
}

/**
 * Get user-friendly error message from failed step
 */
function getErrorMessage(failedStep: string, error: string): string {
  const messages: Record<string, string> = {
    validation: error,
    repo_detection: "Failed to detect repository",
    task_creation: "Failed to create task",
    workspace_creation: "Failed to create workspace",
    cloud_run: "Failed to start cloud execution",
    agent_session: "Failed to start agent session",
  };
  return messages[failedStep] ?? error;
}

/**
 * Hook for creating tasks with workspace provisioning.
 *
 * This hook is intentionally thin - it only handles:
 * - Preparing input from editor state
 * - Calling TaskService (which owns the saga)
 * - Handling UI effects (clear editor, navigate, show toast)
 *
 * Business logic is handled by TaskService + TaskCreationSaga.
 */
export function useTaskCreation({
  editor,
  selectedDirectory,
  selectedRepository,
  githubIntegrationId,
  workspaceMode,
  branch,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const { navigateToTask } = useNavigationStore();
  const { isAuthenticated } = useAuthStore();
  const { autoRunTasks } = useSettingsStore();
  const { invalidateTasks } = useCreateTask();

  const isCloudMode = workspaceMode === "cloud";
  const canSubmit =
    !!editor &&
    isAuthenticated &&
    (isCloudMode ? !!selectedRepository : !!selectedDirectory) &&
    !isCreatingTask &&
    !editor.isEmpty;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !editor) return;

    setIsCreatingTask(true);

    try {
      const input = prepareTaskInput(editor, {
        selectedDirectory,
        selectedRepository,
        githubIntegrationId,
        workspaceMode,
        branch,
        autoRun: autoRunTasks,
      });

      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
      const result = await taskService.createTask(input);

      if (result.success) {
        const { task } = result.data;

        // Invalidate tasks query
        invalidateTasks();

        // Navigate to the new task
        navigateToTask(task);

        // Clear editor
        editor.commands.clearContent();

        log.info("Task created successfully", { taskId: task.id });
      } else {
        const message = getErrorMessage(result.failedStep, result.error);
        toast.error(message);
        log.error("Task creation failed", {
          failedStep: result.failedStep,
          error: result.error,
        });
      }
    } catch (error) {
      // Unexpected error (not from saga)
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to create task: ${message}`);
      log.error("Unexpected error during task creation", { error });
    } finally {
      setIsCreatingTask(false);
    }
  }, [
    canSubmit,
    editor,
    selectedDirectory,
    selectedRepository,
    githubIntegrationId,
    workspaceMode,
    branch,
    autoRunTasks,
    invalidateTasks,
    navigateToTask,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
