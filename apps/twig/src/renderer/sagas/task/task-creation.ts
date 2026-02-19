import { buildPromptBlocks } from "@features/editor/utils/prompt-builder";
import { getSessionService } from "@features/sessions/service/service";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Saga, type SagaLogger } from "@posthog/shared";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { logger } from "@renderer/lib/logger";
import { useTaskDirectoryStore } from "@renderer/stores/taskDirectoryStore";
import { trpcVanilla } from "@renderer/trpc";
import { getTaskRepository } from "@renderer/utils/repository";
import type {
  ExecutionMode,
  Task,
  Workspace,
  WorkspaceMode,
} from "@shared/types";

const log = logger.scope("task-creation-saga");

// Adapt our logger to SagaLogger interface
const sagaLogger: SagaLogger = {
  info: (message, data) => log.info(message, data),
  debug: (message, data) => log.debug(message, data),
  error: (message, data) => log.error(message, data),
  warn: (message, data) => log.warn(message, data),
};

export interface TaskCreationInput {
  // For opening existing task
  taskId?: string;
  // For creating new task (required if no taskId)
  content?: string;
  filePaths?: string[];
  repoPath?: string;
  repository?: string | null;
  workspaceMode?: WorkspaceMode;
  branch?: string | null;
  githubIntegrationId?: number;
  executionMode?: ExecutionMode;
  adapter?: "claude" | "codex";
  model?: string;
  reasoningLevel?: string;
}

export interface TaskCreationOutput {
  task: Task;
  workspace: Workspace | null;
}

export interface TaskCreationDeps {
  posthogClient: PostHogAPIClient;
}

export class TaskCreationSaga extends Saga<
  TaskCreationInput,
  TaskCreationOutput
> {
  constructor(private deps: TaskCreationDeps) {
    super(sagaLogger);
  }

  protected async execute(
    input: TaskCreationInput,
  ): Promise<TaskCreationOutput> {
    // Step 1: Get or create task
    // For new tasks, start folder registration in parallel with task creation
    // since folder_registration only needs repoPath (from input), not task.id
    const taskId = input.taskId;
    const folderPromise =
      !taskId && input.repoPath
        ? this.resolveFolder(input.repoPath)
        : undefined;

    const task = taskId
      ? await this.readOnlyStep("fetch_task", () =>
          this.deps.posthogClient.getTask(taskId),
        )
      : await this.createTask(input);

    // Step 2: Resolve repoPath - input takes precedence, then stored mappings
    // Wait for workspace store to load first (it loads async on init)
    await this.readOnlyStep("wait_workspaces_loaded", () =>
      this.waitForWorkspacesLoaded(),
    );

    const repoKey = getTaskRepository(task);
    const repoPath =
      input.repoPath ??
      useTaskDirectoryStore
        .getState()
        .getTaskDirectory(task.id, repoKey ?? undefined);

    // Step 3: Resolve workspaceMode - input takes precedence, then derive from task
    const workspaceMode =
      input.workspaceMode ??
      (task.latest_run?.environment === "cloud" ? "cloud" : "local");

    log.info("Task setup resolved", {
      taskId: task.id,
      isOpen: !!input.taskId,
      repository: repoKey,
      repoPath,
      workspaceMode,
      hasLatestRun: !!task.latest_run,
      latestRunLogUrl: task.latest_run?.log_url,
    });

    // Step 4: Create workspace if we have a directory
    let workspace: Workspace | null = null;

    if (repoPath) {
      // Save repo → directory mapping (ensures it exists for future opens)
      if (repoKey) {
        useTaskDirectoryStore.getState().setRepoDirectory(repoKey, repoPath);
      }

      const branch = input.branch ?? task.latest_run?.branch ?? null;

      // Use the pre-fetched folder if we started it in parallel, otherwise fetch now
      const folder = folderPromise
        ? await this.readOnlyStep("folder_registration", () => folderPromise)
        : await this.readOnlyStep("folder_registration", () =>
            this.resolveFolder(repoPath),
          );

      const workspaceInfo = await this.step({
        name: "workspace_creation",
        execute: async () => {
          return trpcVanilla.workspace.create.mutate({
            taskId: task.id,
            mainRepoPath: repoPath,
            folderId: folder.id,
            folderPath: repoPath,
            mode: workspaceMode,
            branch: branch ?? undefined,
          });
        },
        rollback: async () => {
          log.info("Rolling back: deleting workspace", { taskId: task.id });
          await trpcVanilla.workspace.delete.mutate({
            taskId: task.id,
            mainRepoPath: repoPath,
          });
        },
      });

      workspace = {
        taskId: task.id,
        folderId: folder.id,
        folderPath: repoPath,
        mode: workspaceMode,
        worktreePath: workspaceInfo.worktree?.worktreePath ?? null,
        worktreeName: workspaceInfo.worktree?.worktreeName ?? null,
        branchName: workspaceInfo.worktree?.branchName ?? null,
        baseBranch: workspaceInfo.worktree?.baseBranch ?? null,
        createdAt:
          workspaceInfo.worktree?.createdAt ?? new Date().toISOString(),
        terminalSessionIds: workspaceInfo.terminalSessionIds,
        hasStartScripts: workspaceInfo.hasStartScripts,
      };
    }

    // Step 5: Start cloud run (only for new cloud tasks)
    if (workspaceMode === "cloud" && !task.latest_run) {
      await this.step({
        name: "cloud_run",
        execute: () => this.deps.posthogClient.runTaskInCloud(task.id),
        rollback: async () => {
          log.info("Rolling back: cloud run (no-op)", { taskId: task.id });
        },
      });
    }

    // Step 6: Connect to session
    // Cloud create: skip local session — the sandbox handles execution
    const agentCwd =
      workspace?.worktreePath ?? workspace?.folderPath ?? repoPath;
    const isCloudCreate = !input.taskId && workspaceMode === "cloud";
    const shouldConnect =
      !isCloudCreate &&
      (!!input.taskId || // Open: always connect to load chat history
        !!agentCwd); // Local create: always connect if we have a cwd

    if (shouldConnect) {
      const initialPrompt =
        !input.taskId && input.content
          ? await this.readOnlyStep("build_prompt_blocks", () =>
              buildPromptBlocks(
                input.content!,
                input.filePaths ?? [],
                agentCwd ?? "",
              ),
            )
          : undefined;

      await this.step({
        name: "agent_session",
        execute: async () => {
          // For opening existing tasks, await to ensure chat history loads
          // For creating new tasks, we can proceed without waiting
          if (input.taskId) {
            await getSessionService().connectToTask({
              task,
              repoPath: agentCwd ?? "",
            });
          } else {
            // Don't await for create - allows faster navigation to task page
            getSessionService().connectToTask({
              task,
              repoPath: agentCwd ?? "",
              initialPrompt,
              executionMode: input.executionMode,
              adapter: input.adapter,
              model: input.model,
              reasoningLevel: input.reasoningLevel,
            });
          }
          return { taskId: task.id };
        },
        rollback: async ({ taskId }) => {
          log.info("Rolling back: disconnecting agent session", { taskId });
          await getSessionService().disconnectFromTask(taskId);
        },
      });
    }

    return { task, workspace };
  }

  /**
   * Wait for the workspace store to finish loading from main process.
   * This prevents race conditions where we try to resolve directories before they're loaded.
   */
  private async waitForWorkspacesLoaded(): Promise<void> {
    const store = useWorkspaceStore.getState();
    if (store.isLoaded) return;

    return new Promise((resolve) => {
      const unsubscribe = useWorkspaceStore.subscribe((state) => {
        if (state.isLoaded) {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private async resolveFolder(repoPath: string) {
    const folders = await trpcVanilla.folders.getFolders.query();
    let existingFolder = folders.find((f) => f.path === repoPath);

    if (!existingFolder) {
      existingFolder = await trpcVanilla.folders.addFolder.mutate({
        folderPath: repoPath,
      });
    }
    return existingFolder;
  }

  private async createTask(input: TaskCreationInput): Promise<Task> {
    let repository = input.repository;

    const repoPathForDetection = input.repoPath;
    if (!repository && repoPathForDetection) {
      const detected = await this.readOnlyStep("repo_detection", () =>
        trpcVanilla.git.detectRepo.query({
          directoryPath: repoPathForDetection,
        }),
      );
      if (detected) {
        repository = `${detected.organization}/${detected.repository}`;
      }
    }

    // Save repo → directory mapping for future lookups (e.g., when opening via deep link)
    if (repository && input.repoPath) {
      useTaskDirectoryStore
        .getState()
        .setRepoDirectory(repository, input.repoPath);
    }

    return this.step({
      name: "task_creation",
      execute: async () => {
        const result = await this.deps.posthogClient.createTask({
          description: input.content ?? "",
          repository: repository ?? undefined,
          github_integration:
            input.workspaceMode === "cloud"
              ? input.githubIntegrationId
              : undefined,
        });
        return result as unknown as Task;
      },
      rollback: async (createdTask) => {
        log.info("Rolling back: deleting task", { taskId: createdTask.id });
        await this.deps.posthogClient.deleteTask(createdTask.id);
      },
    });
  }
}
