import { useAuthStore } from "@features/auth/stores/authStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTaskInputStore } from "@features/task-detail/stores/taskInputStore";
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

    if (!input.content.trim()) {
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
   * Batch update stores after successful task creation.
   */
  private updateStoresOnSuccess(
    output: TaskCreationOutput,
    input: TaskCreationInput,
  ): void {
    const settings = useSettingsStore.getState();
    const taskExecution = useTaskExecutionStore.getState();
    const taskInput = useTaskInputStore.getState();
    const workspaceStore = useWorkspaceStore.getState();

    // Save workspace mode for this task
    taskExecution.setWorkspaceMode(output.task.id, input.workspaceMode);

    // Save as last used preferences
    settings.setLastUsedWorkspaceMode(input.workspaceMode);

    if (input.workspaceMode === "cloud") {
      settings.setLastUsedRunMode("cloud");
    } else {
      settings.setLastUsedRunMode("local");
      settings.setLastUsedLocalWorkspaceMode(
        input.workspaceMode as "worktree" | "root",
      );

      // Save repo path for local tasks
      if (input.repoPath) {
        taskExecution.setRepoPath(output.task.id, input.repoPath);
      }
    }

    // Update workspace store with the created workspace
    if (output.workspace) {
      workspaceStore.updateWorkspace(output.task.id, output.workspace);
    }

    // Clear draft
    taskInput.clearDraft();

    log.info("Stores updated after task creation", { taskId: output.task.id });
  }
}
