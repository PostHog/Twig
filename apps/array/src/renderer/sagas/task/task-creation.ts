import type { PostHogAPIClient } from "@api/posthogClient";
import { buildPromptBlocks } from "@features/editor/utils/tiptap-converter";
import { getSessionActions } from "@features/sessions/stores/sessionStore";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";
import { Saga, type SagaLogger } from "@shared/lib/saga";
import type { Task, Workspace, WorkspaceMode } from "@shared/types";

const log = logger.scope("task-creation-saga");

// Adapt our logger to SagaLogger interface
const sagaLogger: SagaLogger = {
  info: (message, data) => log.info(message, data),
  debug: (message, data) => log.debug(message, data),
  error: (message, data) => log.error(message, data),
  warn: (message, data) => log.warn(message, data),
};

export interface TaskCreationInput {
  content: string;
  filePaths: string[];
  repoPath: string;
  repository?: string | null;
  workspaceMode: WorkspaceMode;
  branch?: string | null;
  githubIntegrationId?: number;
  autoRun?: boolean;
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
    // Step 1: Detect repository (if not provided)
    let repository = input.repository;

    if (!repository && input.repoPath) {
      const detected = await this.readOnlyStep("repo_detection", () =>
        trpcVanilla.git.detectRepo.query({ directoryPath: input.repoPath }),
      );

      if (detected) {
        repository = `${detected.organization}/${detected.repository}`;
      }
    }

    // Step 2: Create task via PostHog API
    const task = await this.step({
      name: "task_creation",
      execute: async () => {
        const result = await this.deps.posthogClient.createTask({
          description: input.content,
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

    // Step 3: Create workspace
    let workspace: Workspace | null = null;

    if (input.repoPath) {
      // Get or create folder registration first
      const folders = await window.electronAPI.folders.getFolders();
      let folder = folders.find((f) => f.path === input.repoPath);

      if (!folder) {
        folder = await window.electronAPI.folders.addFolder(input.repoPath);
      }

      const workspaceInfo = await this.step({
        name: "workspace_creation",
        execute: async () => {
          return window.electronAPI.workspace.create({
            taskId: task.id,
            mainRepoPath: input.repoPath,
            folderId: folder.id,
            folderPath: input.repoPath,
            mode: input.workspaceMode,
            branch: input.branch ?? undefined,
          });
        },
        rollback: async () => {
          log.info("Rolling back: deleting workspace", { taskId: task.id });
          await window.electronAPI.workspace.delete(task.id, input.repoPath);
        },
      });

      // Convert WorkspaceInfo to Workspace
      workspace = {
        taskId: task.id,
        folderId: folder.id,
        folderPath: input.repoPath,
        mode: input.workspaceMode,
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

    // Step 4: Start cloud run (if cloud mode)
    if (input.workspaceMode === "cloud") {
      await this.step({
        name: "cloud_run",
        execute: () => this.deps.posthogClient.runTaskInCloud(task.id),
        rollback: async () => {
          // TODO: Implement rollback for cloud run
          log.info("Rolling back: cloud run (no-op)", { taskId: task.id });
        },
      });
    }

    // Step 5: Start agent session (if local mode + autoRun)
    const agentCwd =
      workspace?.worktreePath ?? workspace?.folderPath ?? input.repoPath;

    if (input.workspaceMode !== "cloud" && agentCwd && input.autoRun) {
      await this.step({
        name: "agent_session",
        execute: async () => {
          const promptBlocks = await buildPromptBlocks(
            input.content,
            input.filePaths,
            agentCwd,
          );
          // Don't await this, we want to optimistically route to the task page before the agent session is started
          getSessionActions().connectToTask({
            task,
            repoPath: agentCwd,
            initialPrompt: promptBlocks,
          });
          return { taskId: task.id };
        },
        rollback: async ({ taskId }) => {
          log.info("Rolling back: disconnecting agent session", { taskId });
          await getSessionActions().disconnectFromTask(taskId);
        },
      });
    }

    return {
      task,
      workspace,
    };
  }
}
