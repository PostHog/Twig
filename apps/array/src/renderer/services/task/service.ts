import { useAuthStore } from "@features/auth/stores/authStore";
import { useMessageEditorStore } from "@features/message-editor/stores/messageEditorStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";
import type { SagaResult } from "@shared/lib/saga";
import { injectable } from "inversify";
import {
  type TaskCreationInput,
  type TaskCreationOutput,
  TaskCreationSaga,
} from "@/renderer/sagas/task/task-creation";

export type { TaskCreationInput, TaskCreationOutput };

const log = logger.scope("task-service");

export type CreateTaskResult = SagaResult<TaskCreationOutput>;

@injectable()
export class TaskService {
  /**
   * Create a task with workspace provisioning.
   *
   * This method:
   * 2. Executes the TaskCreationSaga (with automatic rollback on failure)
   * 3. Updates renderer stores on success
   * 4. Returns a typed result for the hook to handle UI effects
   */
  public async createTask(input: TaskCreationInput): Promise<CreateTaskResult> {
    log.info("Creating task", {
      workspaceMode: input.workspaceMode,
      hasContent: !!input.content,
      hasRepo: !!input.repository,
    });

    if (!input.content?.trim()) {
      return {
        success: false,
        error: "Task description cannot be empty",
        failedStep: "validation",
      };
    }

    // Get posthogClient from auth store (created dynamically on login)
    const posthogClient = useAuthStore.getState().client;
    if (!posthogClient) {
      return {
        success: false,
        error: "Not authenticated",
        failedStep: "validation",
      };
    }

    const saga = new TaskCreationSaga({
      posthogClient,
    });

    const result = await saga.run(input);

    if (result.success) {
      this.updateStoresOnSuccess(result.data, input);
    }

    return result;
  }

  /**
   * Open an existing task by ID, optionally loading a specific run.
   * If the workspace already exists, just fetches task data.
   * Otherwise runs the full saga to set up the workspace.
   */
  public async openTask(
    taskId: string,
    taskRunId?: string,
  ): Promise<CreateTaskResult> {
    log.info("Opening existing task", { taskId, taskRunId });

    const posthogClient = useAuthStore.getState().client;
    if (!posthogClient) {
      return {
        success: false,
        error: "Not authenticated",
        failedStep: "validation",
      };
    }

    // Check if workspace already exists - if so, just fetch the task
    const existingWorkspace = useWorkspaceStore.getState().workspaces[taskId];
    if (existingWorkspace) {
      log.info("Workspace already exists, fetching task only", { taskId });
      try {
        const task = await posthogClient.getTask(taskId);

        // If a specific run was requested, fetch and use it
        if (taskRunId) {
          log.info("Fetching specific task run", { taskId, taskRunId });
          const run = await posthogClient.getTaskRun(taskId, taskRunId);
          task.latest_run = run;
        }

        return {
          success: true,
          data: {
            task: task as unknown as import("@shared/types").Task,
            workspace: existingWorkspace,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch task",
          failedStep: "fetch_task",
        };
      }
    }

    // No existing workspace - run full saga to set it up
    const saga = new TaskCreationSaga({ posthogClient });
    const result = await saga.run({ taskId, autoRun: true });

    if (result.success) {
      this.updateStoresOnSuccess(result.data);

      // If a specific run was requested, update the task with that run
      if (taskRunId && result.data.task) {
        try {
          log.info("Fetching specific task run for new workspace", {
            taskId,
            taskRunId,
          });
          const run = await posthogClient.getTaskRun(taskId, taskRunId);
          result.data.task.latest_run = run;
        } catch (error) {
          log.warn("Failed to fetch specific task run, using latest", {
            taskId,
            taskRunId,
            error,
          });
        }
      }
    }

    return result;
  }

  /**
   * Batch update stores after successful task creation/open.
   */
  private updateStoresOnSuccess(
    output: TaskCreationOutput,
    input?: TaskCreationInput,
  ): void {
    const settings = useSettingsStore.getState();
    const taskExecution = useTaskExecutionStore.getState();
    const messageEditor = useMessageEditorStore.getState();
    const workspaceStore = useWorkspaceStore.getState();

    // Derive values from input or output
    const workspaceMode =
      input?.workspaceMode ?? output.workspace?.mode ?? "worktree";
    const repoPath = input?.repoPath ?? output.workspace?.folderPath;

    // Save workspace mode for this task
    taskExecution.setWorkspaceMode(output.task.id, workspaceMode);

    // Only update settings preferences when creating (user made a choice)
    if (input) {
      settings.setLastUsedWorkspaceMode(workspaceMode);

      if (workspaceMode === "cloud") {
        settings.setLastUsedRunMode("cloud");
      } else {
        settings.setLastUsedRunMode("local");
        settings.setLastUsedLocalWorkspaceMode(
          workspaceMode as "worktree" | "root",
        );
      }

      // Clear draft only on create (task-input is the sessionId used by TaskInputEditor)
      messageEditor.actions.setDraft("task-input", null);
    }

    // Save repo path for local tasks
    if (repoPath && workspaceMode !== "cloud") {
      taskExecution.setRepoPath(output.task.id, repoPath);
    }

    // Update workspace store
    if (output.workspace) {
      workspaceStore.updateWorkspace(output.task.id, output.workspace);
    }

    log.info("Stores updated after task", { taskId: output.task.id });
  }
}
