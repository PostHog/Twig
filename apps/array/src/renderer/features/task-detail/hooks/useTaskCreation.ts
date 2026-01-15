import { useAuthStore } from "@features/auth/stores/authStore";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import type { EditorContent } from "@features/message-editor/utils/content";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useConnectivity } from "@hooks/useConnectivity";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { logger } from "@renderer/lib/logger";
import type {
  TaskCreationInput,
  TaskService,
} from "@renderer/services/task/service";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const log = logger.scope("task-creation");

interface UseTaskCreationOptions {
  editorRef: React.RefObject<MessageEditorHandle | null>;
  selectedDirectory: string;
  selectedRepository?: string | null;
  githubIntegrationId?: number;
  branch?: string | null;
  editorIsEmpty: boolean;
  executionMode?: "plan" | "acceptEdits";
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

function contentToXml(content: EditorContent): string {
  return content.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const chip = seg.chip;
      switch (chip.type) {
        case "file":
          return `<file path="${chip.id}" />`;
        case "command":
          return `/${chip.label}`;
        case "error":
          return `<error id="${chip.id}" />`;
        case "experiment":
          return `<experiment id="${chip.id}" />`;
        case "insight":
          return `<insight id="${chip.id}" />`;
        case "feature_flag":
          return `<feature_flag id="${chip.id}" />`;
        default:
          return `@${chip.label}`;
      }
    })
    .join("");
}

function extractFileMentionsFromContent(content: EditorContent): string[] {
  const filePaths: string[] = [];
  for (const seg of content.segments) {
    if (seg.type === "chip" && seg.chip.type === "file") {
      if (!filePaths.includes(seg.chip.id)) {
        filePaths.push(seg.chip.id);
      }
    }
  }
  return filePaths;
}

function prepareTaskInput(
  content: EditorContent,
  options: {
    selectedDirectory: string;
    selectedRepository?: string | null;
    githubIntegrationId?: number;
    branch?: string | null;
    autoRun: boolean;
    executionMode?: "plan" | "acceptEdits";
  },
): TaskCreationInput {
  return {
    content: contentToXml(content).trim(),
    filePaths: extractFileMentionsFromContent(content),
    repoPath: options.selectedDirectory,
    repository: options.selectedRepository,
    githubIntegrationId: options.githubIntegrationId,
    branch: options.branch,
    autoRun: options.autoRun,
    executionMode: options.executionMode,
  };
}

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

export function useTaskCreation({
  editorRef,
  selectedDirectory,
  selectedRepository,
  githubIntegrationId,
  branch,
  editorIsEmpty,
  executionMode,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const { navigateToTask } = useNavigationStore();
  const { isAuthenticated } = useAuthStore();
  const { autoRunTasks } = useSettingsStore();
  const { invalidateTasks } = useCreateTask();
  const { isOnline } = useConnectivity();

  const canSubmit =
    !!editorRef.current &&
    isAuthenticated &&
    isOnline &&
    !!selectedDirectory &&
    !isCreatingTask &&
    !editorIsEmpty;

  const handleSubmit = useCallback(async () => {
    const editor = editorRef.current;
    if (!canSubmit || !editor) return;

    setIsCreatingTask(true);

    try {
      const content = editor.getContent();
      const input = prepareTaskInput(content, {
        selectedDirectory,
        selectedRepository,
        githubIntegrationId,
        branch,
        autoRun: autoRunTasks,
        executionMode,
      });

      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
      const result = await taskService.createTask(input);

      if (result.success) {
        const { task } = result.data;

        // Invalidate tasks query
        invalidateTasks(task);

        // Navigate to the new task
        navigateToTask(task);

        // Clear editor
        editor.clear();

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
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to create task: ${message}`);
      log.error("Unexpected error during task creation", { error });
    } finally {
      setIsCreatingTask(false);
    }
  }, [
    canSubmit,
    editorRef,
    selectedDirectory,
    selectedRepository,
    githubIntegrationId,
    branch,
    autoRunTasks,
    executionMode,
    invalidateTasks,
    navigateToTask,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
