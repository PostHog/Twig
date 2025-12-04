import type { ContentBlock } from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import {
  buildPromptBlocks,
  extractFileMentions,
  tiptapToMarkdown,
} from "@features/editor/utils/tiptap-converter";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTaskInputStore } from "@features/task-detail/stores/taskInputStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";
import type { Task, WorkspaceMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

const log = logger.scope("task-creation");

interface UseTaskCreationOptions {
  editor: Editor | null;
  selectedDirectory: string;
  workspaceMode: WorkspaceMode;
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

async function startAgentSession(
  task: Task,
  repoPath: string,
  initialPrompt?: ContentBlock[],
): Promise<void> {
  await useSessionStore.getState().connectToTask({
    task,
    repoPath,
    initialPrompt,
  });
}

export function useTaskCreation({
  editor,
  selectedDirectory,
  workspaceMode,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const {
    mutate: createTask,
    isPending: isCreatingTask,
    invalidateTasks,
  } = useCreateTask();
  const { navigateToTask } = useNavigationStore();
  const { client, isAuthenticated } = useAuthStore();
  const { setRepoPath: saveRepoPath, setWorkspaceMode: saveWorkspaceMode } =
    useTaskExecutionStore();
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

    const editorJson = editor.getJSON();
    const content = tiptapToMarkdown(editorJson).trim();
    if (!content) {
      return;
    }

    // Extract file mentions for building prompt content blocks
    const filePaths = extractFileMentions(editorJson);

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
          // Save workspace mode preference
          saveWorkspaceMode(newTask.id, workspaceMode);
          useSettingsStore.getState().setLastUsedWorkspaceMode(workspaceMode);

          // Also save the run mode and local workspace mode separately for UI
          if (workspaceMode === "cloud") {
            useSettingsStore.getState().setLastUsedRunMode("cloud");
          } else {
            useSettingsStore.getState().setLastUsedRunMode("local");
            useSettingsStore
              .getState()
              .setLastUsedLocalWorkspaceMode(workspaceMode);
          }

          if (workspaceMode === "cloud") {
            if (selectedDirectory) {
              try {
                await useWorkspaceStore
                  .getState()
                  .ensureWorkspace(newTask.id, selectedDirectory, "cloud");
              } catch (error) {
                log.error("Failed to create cloud workspace:", error);
              }
            }

            try {
              const updatedTask = await client.runTaskInCloud(newTask.id);
              log.info("Started cloud task", { taskId: newTask.id });
              invalidateTasks();
              navigateToTask(updatedTask);
            } catch (error) {
              log.error("Failed to start cloud task:", error);
              invalidateTasks();
              navigateToTask(newTask);
            }
            editor.commands.clearContent();
            clearDraft();
          } else {
            // Local execution (worktree or root)
            let agentCwd = selectedDirectory;

            if (selectedDirectory) {
              await saveRepoPath(newTask.id, selectedDirectory);

              try {
                const workspace = await useWorkspaceStore
                  .getState()
                  .ensureWorkspace(
                    newTask.id,
                    selectedDirectory,
                    workspaceMode,
                  );
                agentCwd = workspace.worktreePath ?? workspace.folderPath;
              } catch (error) {
                log.error("Failed to create workspace for task:", error);
              }
            }

            // Invalidate tasks AFTER workspace is ready to avoid race condition
            // where sidebar re-renders before workspace exists
            invalidateTasks();

            navigateToTask(newTask);
            editor.commands.clearContent();
            clearDraft();

            if (autoRunTasks && agentCwd) {
              // Build content blocks with file contents for the initial prompt
              const promptBlocks = await buildPromptBlocks(
                content,
                filePaths,
                agentCwd,
              );
              await startAgentSession(newTask, agentCwd, promptBlocks);
            }
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
    workspaceMode,
    createTask,
    saveRepoPath,
    navigateToTask,
    autoRunTasks,
    clearDraft,
    isCreatingTask,
    client,
    isAuthenticated,
    invalidateTasks,
    saveWorkspaceMode,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
