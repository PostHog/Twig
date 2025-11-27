import { useAuthStore } from "@features/auth/stores/authStore";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import type { AgentEvent } from "@posthog/agent";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { queryClient } from "@renderer/lib/queryClient";
import type {
  ClarifyingQuestion,
  ExecutionMode,
  PlanModePhase,
  QuestionAnswer,
  Task,
  TaskRun,
} from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useWorktreeStore } from "@stores/worktreeStore";
import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import type {
  ExecutionMode as AnalyticsExecutionMode,
  ExecutionType,
} from "@/types/analytics";
import { ANALYTICS_EVENTS } from "@/types/analytics";
import { createConsoleEvent, emitEventsToS3 } from "../utils/eventEmitter";

const log = logger.scope("task-execution-store");

interface ArtifactEvent {
  type: string;
  ts: number;
  kind?: string;
  content?: Array<{
    id: string;
    question: string;
    options: string[];
  }>;
}

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

interface TodoList {
  items: TodoItem[];
  metadata: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    last_updated: string;
  };
}

const createProgressSignature = (progress: TaskRun): string =>
  [progress.status ?? "", progress.updated_at ?? ""].join("|");

const derivePath = (workspace: string, repo: string) =>
  `${expandTildePath(workspace)}/${repo}`;

const isArtifactEvent = (log: AgentEvent): log is AgentEvent & ArtifactEvent =>
  log.type === "artifact" && "kind" in log && "content" in log;

const hasCustomOption = (options: string[]) =>
  options.some((opt) => opt.toLowerCase().includes("something else"));

const toClarifyingQuestions = (
  content: ArtifactEvent["content"],
): ClarifyingQuestion[] => {
  if (!content) return [];
  return content.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    requiresInput: hasCustomOption(q.options),
  }));
};

/**
 * Fetch logs from S3 log URL via main process to avoid CORS issues
 * S3 stores AgentEvent objects as newline-delimited JSON
 */
async function fetchLogsFromS3Url(logUrl: string): Promise<AgentEvent[]> {
  try {
    const content = await window.electronAPI?.fetchS3Logs(logUrl);

    if (!content || !content.trim()) {
      return [];
    }

    return content
      .trim()
      .split("\n")
      .map((line: string) => JSON.parse(line) as AgentEvent);
  } catch (err) {
    log.warn("Failed to fetch task logs from S3", err);
    return [];
  }
}

// Debounce map for file tree invalidation
const fileTreeInvalidationTimers = new Map<string, number>();

/**
 * Invalidate file tree cache when file creation/modification is detected
 * Debounced to avoid excessive invalidations during rapid file operations
 */
function invalidateFileTreeCache(repoPath: string, debounceMs = 500) {
  // Clear existing timer for this repo
  const existingTimer = fileTreeInvalidationTimers.get(repoPath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(async () => {
    // Invalidate React Query cache
    queryClient.invalidateQueries({
      queryKey: ["repo-files", repoPath],
    });

    // Clear main process cache
    try {
      await window.electronAPI?.clearRepoFileCache(repoPath);
    } catch (err) {
      log.warn("Failed to clear repo file cache:", err);
    }

    fileTreeInvalidationTimers.delete(repoPath);
  }, debounceMs);

  fileTreeInvalidationTimers.set(repoPath, timer);
}

interface TaskExecutionState {
  isRunning: boolean;
  logs: AgentEvent[];
  repoPath: string | null;
  repoExists: boolean | null;
  currentTaskId: string | null;
  runMode: "local" | "cloud";
  progress: TaskRun | null;
  progressSignature: string | null;
  logPoller: ReturnType<typeof setInterval> | null;
  // Plan mode fields
  executionMode: ExecutionMode;
  planModePhase: PlanModePhase;
  clarifyingQuestions: ClarifyingQuestion[];
  questionAnswers: QuestionAnswer[];
  planContent: string | null;
  // Todos
  todos: TodoList | null;
}

interface TaskExecutionStore {
  // State per task ID
  taskStates: Record<string, TaskExecutionState>;

  // Basic state accessors
  getTaskState: (taskId: string) => TaskExecutionState;
  updateTaskState: (
    taskId: string,
    updates: Partial<TaskExecutionState>,
  ) => void;
  setRunning: (taskId: string, isRunning: boolean) => void;
  setLogs: (taskId: string, logs: AgentEvent[]) => void;
  setRepoPath: (taskId: string, repoPath: string | null) => void;
  setCurrentTaskId: (taskId: string, currentTaskId: string | null) => void;
  setRunMode: (taskId: string, runMode: "local" | "cloud") => void;
  setProgress: (taskId: string, progress: TaskRun | null) => void;
  clearTaskState: (taskId: string) => void;

  // High-level task execution actions
  runTask: (
    taskId: string,
    task: Task,
    skipInitialize?: boolean,
  ) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  clearTaskLogs: (taskId: string) => void;

  // Log polling (S3 is source of truth)
  startLogPolling: (taskId: string, logUrl: string) => void;
  stopLogPolling: (taskId: string) => void;

  // Plan mode actions
  setExecutionMode: (taskId: string, mode: ExecutionMode) => void;
  setPlanModePhase: (taskId: string, phase: PlanModePhase) => void;
  setClarifyingQuestions: (
    taskId: string,
    questions: ClarifyingQuestion[],
  ) => void;
  setQuestionAnswers: (taskId: string, answers: QuestionAnswer[]) => void;
  addQuestionAnswer: (taskId: string, answer: QuestionAnswer) => void;
  setPlanContent: (taskId: string, content: string | null) => void;

  // Todos actions
  setTodos: (taskId: string, todos: TodoList | null) => void;

  // Auto-initialization and artifact processing
  initializeRepoPath: (taskId: string, task: Task) => void;
  revalidateRepo: (taskId: string) => Promise<void>;
  processLogsForArtifacts: (taskId: string) => void;
  checkPlanCompletion: (taskId: string) => Promise<void>;
  checkTodosUpdate: (taskId: string) => Promise<void>;
}

const defaultTaskState: TaskExecutionState = {
  isRunning: false,
  logs: [],
  repoPath: null,
  repoExists: null,
  currentTaskId: null,
  runMode: "local",
  progress: null,
  progressSignature: null,
  logPoller: null,
  executionMode: "plan",
  planModePhase: "idle",
  clarifyingQuestions: [],
  questionAnswers: [],
  planContent: null,
  todos: null,
};

export const useTaskExecutionStore = create<TaskExecutionStore>()(
  persist(
    (set, get) => ({
      taskStates: {},

      getTaskState: (taskId: string) => {
        const state = get();
        // Note: initializeRepoPath should be called separately, not in a selector
        // to avoid side effects during render
        return {
          ...defaultTaskState,
          ...state.taskStates[taskId],
        };
      },

      updateTaskState: (
        taskId: string,
        updates: Partial<TaskExecutionState>,
      ) => {
        set((state) => ({
          taskStates: {
            ...state.taskStates,
            [taskId]: {
              ...(state.taskStates[taskId] || defaultTaskState),
              ...updates,
            },
          },
        }));
      },

      setRunning: (taskId: string, isRunning: boolean) => {
        get().updateTaskState(taskId, { isRunning });
      },

      setLogs: (taskId: string, logs: AgentEvent[]) => {
        const store = get();
        store.updateTaskState(taskId, { logs });
        // Process logs for artifacts after setting
        store.processLogsForArtifacts(taskId);

        // Check for successful file creation/modification and invalidate cache
        const taskState = store.getTaskState(taskId);
        if (taskState.repoPath) {
          const hasFileOperation = logs.some(
            (log) =>
              log.type === "tool_result" &&
              !log.isError &&
              (log.toolName === "Write" || log.toolName === "Edit"),
          );

          if (hasFileOperation) {
            invalidateFileTreeCache(taskState.repoPath);
          }
        }
      },

      setRepoPath: async (taskId: string, repoPath: string | null) => {
        get().updateTaskState(taskId, { repoPath });

        if (repoPath) {
          try {
            await useTaskDirectoryStore
              .getState()
              .setTaskDirectory(taskId, repoPath);
          } catch (error) {
            log.error("Failed to persist task directory:", error);
          }
        }
      },

      setCurrentTaskId: (taskId: string, currentTaskId: string | null) => {
        get().updateTaskState(taskId, { currentTaskId });
      },

      setRunMode: (taskId: string, runMode: "local" | "cloud") => {
        get().updateTaskState(taskId, { runMode });
        useSettingsStore.getState().setLastUsedRunMode(runMode);
      },

      setProgress: (taskId: string, progress: TaskRun | null) => {
        get().updateTaskState(taskId, {
          progress,
          progressSignature: progress
            ? createProgressSignature(progress)
            : null,
        });
      },

      clearTaskState: (taskId: string) => {
        const state = get();
        const taskState = state.taskStates[taskId];
        if (taskState?.logPoller) {
          clearInterval(taskState.logPoller);
        }
        set((state) => {
          const newTaskStates = { ...state.taskStates };
          delete newTaskStates[taskId];
          return { taskStates: newTaskStates };
        });
      },

      startLogPolling: (taskId: string, logUrl: string) => {
        const store = get();

        const existingState = store.taskStates[taskId];
        if (existingState?.logPoller) {
          clearInterval(existingState.logPoller);
        }

        const poll = async () => {
          const currentStore = get();
          const state = currentStore.getTaskState(taskId);

          // Stop polling if not running
          if (!state.isRunning) {
            if (state.logPoller) {
              clearInterval(state.logPoller);
              currentStore.updateTaskState(taskId, { logPoller: null });
            }
            return;
          }

          try {
            const allEvents = await fetchLogsFromS3Url(logUrl);

            if (allEvents.length > 0) {
              currentStore.setLogs(taskId, allEvents);

              const hasDone = allEvents.some((event) => event.type === "done");
              const hasError = allEvents.some(
                (event) => event.type === "error",
              );

              if (hasDone || hasError) {
                currentStore.setRunning(taskId, false);
                currentStore.checkPlanCompletion(taskId);
                if (state.logPoller) {
                  clearInterval(state.logPoller);
                  currentStore.updateTaskState(taskId, { logPoller: null });
                }
              }
            }
          } catch (error) {
            log.warn("Failed to poll logs", { taskId, error });
          }
        };

        // Poll immediately, then every 2 seconds
        void poll();
        const poller = setInterval(() => void poll(), 2000);
        store.updateTaskState(taskId, { logPoller: poller });
      },

      stopLogPolling: (taskId: string) => {
        const state = get();
        const taskState = state.taskStates[taskId];
        if (taskState?.logPoller) {
          clearInterval(taskState.logPoller);
          get().updateTaskState(taskId, { logPoller: null });
        }
      },

      // High-level task execution actions
      runTask: async (taskId: string, task: Task, skipInitialize = false) => {
        const store = get();

        // Initialize repo path if not set (unless we're retrying after validation failure)
        if (!skipInitialize) {
          store.initializeRepoPath(taskId, task);
        }

        const taskState = store.getTaskState(taskId);

        if (taskState.isRunning) return;

        const authState = useAuthStore.getState();
        const apiKey = authState.oauthAccessToken;
        const apiHost = authState.cloudRegion
          ? getCloudUrlFromRegion(authState.cloudRegion)
          : null;

        const projectId = authState.projectId;

        if (!apiKey) {
          await window.electronAPI.showMessageBox({
            type: "error",
            title: "Authentication required",
            message: "No PostHog API key found",
            detail: "Sign in to PostHog to run tasks.",
          });
          return;
        }

        if (!apiHost) {
          await window.electronAPI.showMessageBox({
            type: "error",
            title: "Configuration error",
            message: "No PostHog API host found",
            detail: "Please check your region settings.",
          });
          return;
        }

        if (!projectId) {
          await window.electronAPI.showMessageBox({
            type: "error",
            title: "Configuration error",
            message: "No PostHog project ID found",
            detail: "Please check your settings.",
          });
          return;
        }

        const currentTaskState = store.getTaskState(taskId);

        // Track task run event
        const executionType: ExecutionType = currentTaskState.runMode;
        const executionMode: AnalyticsExecutionMode =
          currentTaskState.executionMode;

        track(ANALYTICS_EVENTS.TASK_RUN, {
          task_id: taskId,
          execution_type: executionType,
          execution_mode: executionMode,
        });

        // Handle cloud mode - run task via API (cloud backend manages S3 logs)
        if (currentTaskState.runMode === "cloud") {
          const { client } = useAuthStore.getState();
          store.setProgress(taskId, null);
          store.setRunning(taskId, true);
          store.setLogs(taskId, []);

          try {
            if (!client) {
              throw new Error("API client not available");
            }

            await client.runTaskInCloud(taskId);
            store.setRunning(taskId, false);
          } catch (error) {
            log.error("Error starting cloud task", error);
            await window.electronAPI.showMessageBox({
              type: "error",
              title: "Cloud task error",
              message: "Error starting cloud task",
              detail: error instanceof Error ? error.message : "Unknown error",
            });
            store.setRunning(taskId, false);
          }
          return;
        }

        // Handle local mode - Create task run FIRST, all logs go to S3
        const permissionMode = "acceptEdits";

        store.setProgress(taskId, null);
        store.setRunning(taskId, true);
        store.setLogs(taskId, []);

        const { client } = useAuthStore.getState();
        if (!client) {
          store.setRunning(taskId, false);
          return;
        }

        let taskRun: TaskRun | null = null;
        try {
          taskRun = await client.createTaskRun(task.id);
        } catch (error) {
          log.error("Failed to create task run", error);
          store.setRunning(taskId, false);
          return;
        }

        if (!taskRun?.id) {
          log.error("Task run created without ID");
          store.setRunning(taskId, false);
          return;
        }

        const taskRunId = taskRun.id;

        // Now handle repo path selection (all logs go to S3)
        let effectiveRepoPath = taskState.repoPath;

        if (!effectiveRepoPath) {
          const hasRepo = !!task.repository;

          void emitEventsToS3(task.id, taskRunId, [
            createConsoleEvent("info", "Waiting for directory selection..."),
          ]);

          const result = await window.electronAPI.showMessageBox({
            type: "question",
            title: "Select working directory",
            message: hasRepo
              ? `Do you have ${task.repository} locally?`
              : "Select a working directory for this task",
            detail: hasRepo
              ? "If you have the repository locally, we'll use that. Otherwise, we can clone it for you."
              : "Choose a directory where the task will run.",
            buttons: hasRepo
              ? ["I have it locally", "Clone for me", "Cancel"]
              : ["Select directory", "Cancel"],
            defaultId: 0,
            cancelId: hasRepo ? 2 : 1,
          });

          if (result.response === (hasRepo ? 2 : 1)) {
            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent("info", "Task cancelled by user"),
            ]);
            store.setRunning(taskId, false);
            return;
          }

          if (result.response === 0) {
            const selectedPath = await window.electronAPI.selectDirectory();

            if (!selectedPath) {
              void emitEventsToS3(task.id, taskRunId, [
                createConsoleEvent("info", "Task cancelled by user"),
              ]);
              store.setRunning(taskId, false);
              return;
            }

            await store.setRepoPath(taskId, selectedPath);
            effectiveRepoPath = selectedPath;

            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent("info", `Selected directory: ${selectedPath}`),
            ]);
          }

          if (result.response === 1 && hasRepo && task.repository) {
            const { repositoryWorkspaceStore } = await import(
              "@stores/repositoryWorkspaceStore"
            );

            const { defaultWorkspace } = useAuthStore.getState();
            if (!defaultWorkspace) {
              void emitEventsToS3(task.id, taskRunId, [
                createConsoleEvent(
                  "error",
                  "No clone location configured. Please configure a clone location in settings.",
                ),
              ]);
              store.setRunning(taskId, false);
              return;
            }

            const derivedPath = derivePath(
              defaultWorkspace,
              task.repository.split("/")[1],
            );
            await store.setRepoPath(taskId, derivedPath);

            const cloneId = `clone-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            cloneStore
              .getState()
              .startClone(cloneId, task.repository, derivedPath);

            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent(
                "info",
                `Cloning ${task.repository}... Click Run again after the clone completes.`,
              ),
            ]);

            try {
              await repositoryWorkspaceStore
                .getState()
                .selectRepository(task.repository, cloneId);
            } catch (error) {
              void emitEventsToS3(task.id, taskRunId, [
                createConsoleEvent(
                  "error",
                  `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`,
                ),
              ]);
            }
            store.setRunning(taskId, false);
            return;
          }
        }

        if (!effectiveRepoPath) {
          void emitEventsToS3(task.id, taskRunId, [
            createConsoleEvent("error", "No repository path available"),
          ]);
          store.setRunning(taskId, false);
          return;
        }

        // Check if repository is currently being cloned
        if (task.repository) {
          const { isCloning } = cloneStore.getState();

          if (isCloning(task.repository)) {
            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent(
                "info",
                `Repository ${task.repository} is currently being cloned. Please wait for the clone to complete.`,
              ),
            ]);
            store.setRunning(taskId, false);
            return;
          }
        }

        // Validate repo
        const canWrite =
          await window.electronAPI?.checkWriteAccess(effectiveRepoPath);
        const isRepo = canWrite
          ? await window.electronAPI?.validateRepo(effectiveRepoPath)
          : false;

        if (!canWrite || !isRepo) {
          void emitEventsToS3(task.id, taskRunId, [
            createConsoleEvent(
              "error",
              `Invalid repository path: ${effectiveRepoPath}. Please select a valid git repository.`,
            ),
          ]);
          await store.setRepoPath(taskId, null);
          store.setRunning(taskId, false);
          return;
        }

        // Set up worktree
        let workingPath = effectiveRepoPath;
        const worktreeStore = useWorktreeStore.getState();
        let worktreeInfo = worktreeStore.getWorktree(taskId);

        if (worktreeInfo) {
          const worktreeExists = await window.electronAPI?.worktree.exists(
            effectiveRepoPath,
            worktreeInfo.worktreeName,
          );
          if (!worktreeExists) {
            await worktreeStore.clearWorktree(taskId);
            worktreeInfo = null;
            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent(
                "info",
                "Worktree was removed externally, recreating...",
              ),
            ]);
          }
        }

        if (!worktreeInfo) {
          void emitEventsToS3(task.id, taskRunId, [
            createConsoleEvent("info", "Creating worktree for task..."),
          ]);

          try {
            worktreeInfo =
              await window.electronAPI?.worktree.create(effectiveRepoPath);
            if (worktreeInfo) {
              await worktreeStore.setWorktree(taskId, worktreeInfo);
              void emitEventsToS3(task.id, taskRunId, [
                createConsoleEvent(
                  "info",
                  `Created worktree: ${worktreeInfo.worktreeName}`,
                ),
              ]);
            }
          } catch (error) {
            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent(
                "warn",
                `Failed to create worktree: ${error instanceof Error ? error.message : "Unknown error"}. Running in main repo instead.`,
              ),
            ]);
          }
        }

        if (worktreeInfo) {
          workingPath = worktreeInfo.worktreePath;
        }

        try {
          const setupEvents: AgentEvent[] = [
            createConsoleEvent("info", "Starting task run..."),
            createConsoleEvent("info", `Permission mode: ${permissionMode}`),
            createConsoleEvent("info", `Working directory: ${workingPath}`),
          ];
          if (worktreeInfo) {
            setupEvents.push(
              createConsoleEvent(
                "info",
                `Worktree: ${worktreeInfo.worktreeName} (branch: ${worktreeInfo.branchName})`,
              ),
            );
          }
          void emitEventsToS3(task.id, taskRunId, setupEvents);

          const { createPR } = useSettingsStore.getState();
          const result = await window.electronAPI?.agentStart({
            taskId: task.id,
            taskRunId,
            repoPath: workingPath,
            apiKey,
            apiHost,
            projectId,
            permissionMode,
            autoProgress: true,
            executionMode: taskState.executionMode,
            runMode: taskState.runMode,
            createPR,
          });
          if (!result) {
            void emitEventsToS3(task.id, taskRunId, [
              createConsoleEvent(
                "error",
                "Failed to start agent: electronAPI not available",
              ),
            ]);
            store.setRunning(taskId, false);
            return;
          }
          const { taskId: executionTaskId } = result;

          store.setCurrentTaskId(taskId, executionTaskId);
          store.startLogPolling(taskId, taskRun.log_url);
        } catch (error) {
          const errorMessage = `Error starting agent: ${error instanceof Error ? error.message : "Unknown error"}`;
          void emitEventsToS3(task.id, taskRunId, [
            createConsoleEvent("error", errorMessage),
          ]);
          store.setRunning(taskId, false);
        }
      },

      cancelTask: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (!taskState.currentTaskId) return;

        try {
          await window.electronAPI?.agentCancel(taskState.currentTaskId);
        } catch {
          // Ignore cancellation errors
        }

        // Emit cancellation event to S3 if we have a task run
        const taskRunId = taskState.progress?.id;
        if (taskRunId) {
          void emitEventsToS3(taskId, taskRunId, [
            createConsoleEvent("info", "Run cancelled"),
          ]);
        }

        store.setRunning(taskId, false);
        store.stopLogPolling(taskId);
      },

      clearTaskLogs: (taskId: string) => {
        get().setLogs(taskId, []);
      },

      // Plan mode actions
      setExecutionMode: (taskId: string, mode: ExecutionMode) => {
        get().updateTaskState(taskId, { executionMode: mode });
      },

      setPlanModePhase: (taskId: string, phase: PlanModePhase) => {
        get().updateTaskState(taskId, { planModePhase: phase });
      },

      setClarifyingQuestions: (
        taskId: string,
        questions: ClarifyingQuestion[],
      ) => {
        get().updateTaskState(taskId, { clarifyingQuestions: questions });
      },

      setQuestionAnswers: (taskId: string, answers: QuestionAnswer[]) => {
        get().updateTaskState(taskId, { questionAnswers: answers });
      },

      addQuestionAnswer: (taskId: string, answer: QuestionAnswer) => {
        const currentState = get().getTaskState(taskId);
        const existingIndex = currentState.questionAnswers.findIndex(
          (a) => a.questionId === answer.questionId,
        );
        const updatedAnswers =
          existingIndex >= 0
            ? currentState.questionAnswers.map((a, i) =>
                i === existingIndex ? answer : a,
              )
            : [...currentState.questionAnswers, answer];
        get().updateTaskState(taskId, { questionAnswers: updatedAnswers });
      },

      setPlanContent: (taskId: string, content: string | null) => {
        get().updateTaskState(taskId, { planContent: content });
      },

      setTodos: (taskId: string, todos: TodoList | null) => {
        get().updateTaskState(taskId, { todos });
      },

      // Auto-initialization and artifact processing
      initializeRepoPath: (taskId: string, task: Task) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (taskState.repoPath) {
          // Even if repoPath is already set, ensure workspace store is in sync
          if (task.repository) {
            const currentWorkspaceRepo =
              repositoryWorkspaceStore.getState().selectedRepository;

            if (task.repository !== currentWorkspaceRepo) {
              repositoryWorkspaceStore
                .getState()
                .selectRepository(task.repository);
            }
          }
          return;
        }

        // 1. Check taskDirectoryStore first
        const storedDirectory = useTaskDirectoryStore
          .getState()
          .getTaskDirectory(taskId, task.repository ?? undefined);
        if (storedDirectory) {
          void store.setRepoPath(taskId, storedDirectory);

          // Update workspace store with task's repository
          if (task.repository) {
            repositoryWorkspaceStore
              .getState()
              .selectRepository(task.repository);
          }

          // Validate repo exists
          window.electronAPI
            ?.validateRepo(storedDirectory)
            .then((exists) => {
              store.updateTaskState(taskId, { repoExists: exists });
            })
            .catch(() => {
              store.updateTaskState(taskId, { repoExists: false });
            });
          return;
        }

        // 2. Fallback to deriving from workspace (existing logic)
        if (!task.repository) return;

        const { defaultWorkspace } = useAuthStore.getState();
        if (!defaultWorkspace) return;

        const path = derivePath(
          defaultWorkspace,
          task.repository.split("/")[1],
        );
        void store.setRepoPath(taskId, path);

        // Update workspace store with task's repository
        repositoryWorkspaceStore.getState().selectRepository(task.repository);

        // Validate repo exists
        window.electronAPI
          ?.validateRepo(path)
          .then((exists) => {
            store.updateTaskState(taskId, { repoExists: exists });
          })
          .catch(() => {
            store.updateTaskState(taskId, { repoExists: false });
          });
      },

      revalidateRepo: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (!taskState.repoPath) return;

        try {
          const exists = await window.electronAPI?.validateRepo(
            taskState.repoPath,
          );
          store.updateTaskState(taskId, { repoExists: exists });
        } catch {
          store.updateTaskState(taskId, { repoExists: false });
        }
      },

      processLogsForArtifacts: (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        // Look for research_questions artifact
        if (taskState.clarifyingQuestions.length === 0) {
          const researchArtifact = taskState.logs.find(
            (log): log is AgentEvent & ArtifactEvent =>
              isArtifactEvent(log) &&
              (log as ArtifactEvent).kind === "research_questions",
          );

          if (researchArtifact) {
            const event = researchArtifact as ArtifactEvent;
            if (event.content) {
              const questions = toClarifyingQuestions(event.content);
              store.setClarifyingQuestions(taskId, questions);
              store.setPlanModePhase(taskId, "questions");
            }
          }
        }

        // Look for todos artifact
        const todosArtifact = taskState.logs.findLast(
          (log): log is AgentEvent & { kind: string; content: TodoList } =>
            isArtifactEvent(log) &&
            "kind" in log &&
            log.kind === "todos" &&
            "content" in log,
        );

        if (todosArtifact) {
          store.setTodos(taskId, todosArtifact.content);
        }
      },

      checkPlanCompletion: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (
          taskState.planModePhase !== "planning" ||
          taskState.isRunning ||
          !taskState.repoPath
        ) {
          return;
        }

        try {
          const content = await window.electronAPI?.readPlanFile(
            taskState.repoPath,
            taskId,
          );
          if (content) {
            store.setPlanContent(taskId, content);
            store.setPlanModePhase(taskId, "review");

            // Auto-open plan.md as an artifact tab
            usePanelLayoutStore.getState().openArtifact(taskId, "plan.md");
          }
        } catch (error) {
          log.error("Failed to load plan:", error);
        }
      },

      checkTodosUpdate: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (!taskState.repoPath) {
          return;
        }

        try {
          const content = await window.electronAPI?.readTaskArtifact(
            taskState.repoPath,
            taskId,
            "todos.json",
          );
          if (content) {
            const todos = JSON.parse(content) as TodoList;
            store.setTodos(taskId, todos);
          }
        } catch (error) {
          log.error("Failed to load todos:", error);
        }
      },
    }),
    {
      name: "task-execution-storage",
      // Don't persist pollers as they can't be serialized
      partialize: (state) => ({
        taskStates: Object.fromEntries(
          Object.entries(state.taskStates).map(([taskId, taskState]) => [
            taskId,
            { ...taskState, logPoller: null },
          ]),
        ),
      }),
    },
  ),
);
