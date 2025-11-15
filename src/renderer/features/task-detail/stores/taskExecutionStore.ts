import { useAuthStore } from "@features/auth/stores/authStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskPanelLayoutStore } from "@features/task-detail/stores/taskPanelLayoutStore";
import type { AgentEvent } from "@posthog/agent";
import { track } from "@renderer/lib/analytics";
import type {
  ClarifyingQuestion,
  ExecutionMode,
  PlanModePhase,
  QuestionAnswer,
  Task,
  TaskRun,
} from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import type {
  ExecutionMode as AnalyticsExecutionMode,
  ExecutionType,
} from "@/types/analytics";
import { ANALYTICS_EVENTS } from "@/types/analytics";

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

const getRepoKey = (org: string, repo: string) => `${org}/${repo}`;

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
 * Convert S3 LogEntry to AgentEvent
 */
function logEntryToAgentEvent(
  entry: import("@shared/types").LogEntry,
): AgentEvent | null {
  try {
    // Use a base timestamp - will be overridden by actual event timestamps if available
    const baseTs = Date.now();

    // For token events (stored as plain text in message)
    if (entry.type === "token") {
      return {
        type: "token",
        ts: baseTs,
        content: entry.message,
      } as AgentEvent;
    }

    // For legacy info entries
    if (entry.type === "info") {
      return {
        type: "token",
        ts: baseTs,
        content: entry.message,
      } as AgentEvent;
    }

    // For all other events stored as JSON strings in the message field
    if (entry.message) {
      try {
        const parsed = JSON.parse(entry.message);
        // Preserve the original structure from S3, just add the type
        return {
          ...parsed,
          type: entry.type as any,
          ts: parsed.ts || baseTs, // Use parsed ts if available, otherwise base
        } as AgentEvent;
      } catch {
        // If parsing fails, treat as a simple message event
        return {
          type: entry.type as any,
          ts: baseTs,
          message: entry.message,
        } as AgentEvent;
      }
    }

    return null;
  } catch (err) {
    console.warn("Failed to convert log entry to agent event", err, entry);
    return null;
  }
}

/**
 * Fetch logs from S3 log URL via main process to avoid CORS issues
 * Always fetches and returns the entire log file
 */
async function fetchLogsFromS3Url(logUrl: string): Promise<AgentEvent[]> {
  try {
    // Fetch through main process to avoid CORS
    const content = await window.electronAPI?.fetchS3Logs(logUrl);

    if (!content || !content.trim()) {
      return [];
    }

    const logEntries = content
      .trim()
      .split("\n")
      .map(
        (line: string) => JSON.parse(line) as import("@shared/types").LogEntry,
      );

    // Convert all log entries to AgentEvents
    const events = logEntries
      .map((entry: import("@shared/types").LogEntry) =>
        logEntryToAgentEvent(entry),
      )
      .filter((event): event is AgentEvent => event !== null);

    return events;
  } catch (err) {
    console.warn("Failed to fetch task logs from S3", err);
    return [];
  }
}

interface TaskExecutionState {
  isRunning: boolean;
  logs: AgentEvent[];
  repoPath: string | null;
  repoExists: boolean | null;
  currentTaskId: string | null;
  runMode: "local" | "cloud";
  unsubscribe: (() => void) | null;
  progress: TaskRun | null;
  progressSignature: string | null;
  // S3 log polling fields
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
  addLog: (taskId: string, log: AgentEvent) => void;
  setLogs: (taskId: string, logs: AgentEvent[]) => void;
  setRepoPath: (taskId: string, repoPath: string | null) => void;
  setCurrentTaskId: (taskId: string, currentTaskId: string | null) => void;
  setRunMode: (taskId: string, runMode: "local" | "cloud") => void;
  setUnsubscribe: (taskId: string, unsubscribe: (() => void) | null) => void;
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

  // Event subscription management
  subscribeToAgentEvents: (taskId: string, channel: string) => void;
  unsubscribeFromAgentEvents: (taskId: string) => void;

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
  unsubscribe: null,
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

      addLog: (taskId: string, log: AgentEvent) => {
        const store = get();
        const currentState = store.getTaskState(taskId);
        store.updateTaskState(taskId, {
          logs: [...currentState.logs, log],
        });
        // Process logs for artifacts after adding
        store.processLogsForArtifacts(taskId);
      },

      setLogs: (taskId: string, logs: AgentEvent[]) => {
        const store = get();
        store.updateTaskState(taskId, { logs });
        // Process logs for artifacts after setting
        store.processLogsForArtifacts(taskId);
      },

      setRepoPath: (taskId: string, repoPath: string | null) => {
        get().updateTaskState(taskId, { repoPath });

        // Persist to taskDirectoryStore
        if (repoPath) {
          useTaskDirectoryStore.getState().setTaskDirectory(taskId, repoPath);
        }
      },

      setCurrentTaskId: (taskId: string, currentTaskId: string | null) => {
        get().updateTaskState(taskId, { currentTaskId });
      },

      setRunMode: (taskId: string, runMode: "local" | "cloud") => {
        get().updateTaskState(taskId, { runMode });
        useSettingsStore.getState().setLastUsedRunMode(runMode);
      },

      setUnsubscribe: (taskId: string, unsubscribe: (() => void) | null) => {
        get().updateTaskState(taskId, { unsubscribe });
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
        if (taskState?.unsubscribe) {
          taskState.unsubscribe();
        }
        if (taskState?.logPoller) {
          clearInterval(taskState.logPoller);
        }
        set((state) => {
          const newTaskStates = { ...state.taskStates };
          delete newTaskStates[taskId];
          return { taskStates: newTaskStates };
        });
      },

      subscribeToAgentEvents: (taskId: string, channel: string) => {
        const store = get();

        // Clean up existing subscription and poller if any
        const existingState = store.taskStates[taskId];
        if (existingState?.unsubscribe) {
          existingState.unsubscribe();
        }
        if (existingState?.logPoller) {
          clearInterval(existingState.logPoller);
        }

        // Reset polling state
        store.updateTaskState(taskId, { logPoller: null });

        // Create new subscription that listens only to progress events
        const unsubscribeFn = window.electronAPI?.onAgentEvent(
          channel,
          (ev: AgentEvent | { type: "progress"; progress: TaskRun }) => {
            const currentStore = get();

            // Handle custom progress events from Array backend
            if (ev?.type === "progress" && "progress" in ev) {
              const newProgress = ev.progress;
              const oldProgress = currentStore.getTaskState(taskId).progress;
              const oldSig = oldProgress
                ? createProgressSignature(oldProgress)
                : null;
              const newSig = createProgressSignature(newProgress);

              // Always update the stored progress state for UI (like TaskDetail)
              currentStore.setProgress(taskId, newProgress);

              // Only add to logs if signature changed (to avoid duplicate log entries)
              if (oldSig !== newSig) {
                currentStore.addLog(taskId, {
                  type: "progress",
                  ts: Date.now(),
                  progress: newProgress,
                } as unknown as AgentEvent);
              }

              // Start or continue log polling if we have a log_url
              if (newProgress.log_url) {
                const currentState = currentStore.getTaskState(taskId);

                // Don't start polling if task is already complete
                if (
                  newProgress.status === "completed" ||
                  newProgress.status === "failed"
                ) {
                  // Stop any existing poller
                  if (currentState.logPoller) {
                    clearInterval(currentState.logPoller);
                    currentStore.updateTaskState(taskId, { logPoller: null });
                  }

                  // Do one final fetch to get all logs
                  if (newProgress.log_url) {
                    fetchLogsFromS3Url(newProgress.log_url)
                      .then((allEvents) => {
                        if (allEvents.length > 0) {
                          const store = get();
                          // Check if there's a "done" event
                          const hasDone = allEvents.some(
                            (event) => event.type === "done",
                          );
                          if (hasDone) {
                            store.setRunning(taskId, false);
                            store.checkPlanCompletion(taskId);
                          }
                          // Replace all logs with the full S3 content
                          store.setLogs(taskId, allEvents);
                        }
                      })
                      .catch((err) =>
                        console.warn("Failed to fetch final logs", err),
                      );
                  }
                  return;
                }

                // Start polling if not already started
                if (!currentState.logPoller) {
                  const pollLogs = async () => {
                    const state = get().getTaskState(taskId);
                    const progress = state.progress;

                    // Stop polling if task is now complete
                    if (
                      !progress?.log_url ||
                      progress.status === "completed" ||
                      progress.status === "failed"
                    ) {
                      if (state.logPoller) {
                        clearInterval(state.logPoller);
                        get().updateTaskState(taskId, { logPoller: null });
                      }
                      return;
                    }

                    const allEvents = await fetchLogsFromS3Url(
                      progress.log_url,
                    );

                    if (allEvents.length > 0) {
                      const store = get();

                      // Check for special event types
                      const hasError = allEvents.some(
                        (event) => event.type === "error",
                      );
                      const hasDone = allEvents.some(
                        (event) => event.type === "done",
                      );

                      if (hasError || hasDone) {
                        store.setRunning(taskId, false);
                        if (hasDone) {
                          // Stop polling when done event found
                          const currentState = store.getTaskState(taskId);
                          if (currentState.logPoller) {
                            clearInterval(currentState.logPoller);
                            store.updateTaskState(taskId, { logPoller: null });
                          }
                        }
                        // Check if plan needs to be loaded after run completes
                        store.checkPlanCompletion(taskId);
                      }

                      // Replace all logs with the full S3 content
                      store.setLogs(taskId, allEvents);
                    }
                  };

                  // Initial fetch
                  void pollLogs();

                  // Start polling every 2 seconds
                  const poller = setInterval(() => {
                    void pollLogs();
                  }, 2000);

                  currentStore.updateTaskState(taskId, { logPoller: poller });
                }
              }

              return;
            }
          },
        );

        // Store the unsubscribe function
        store.setUnsubscribe(taskId, unsubscribeFn);
      },

      unsubscribeFromAgentEvents: (taskId: string) => {
        const state = get();
        const taskState = state.taskStates[taskId];
        if (taskState?.unsubscribe) {
          taskState.unsubscribe();
          get().setUnsubscribe(taskId, null);
        }
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
          store.addLog(taskId, {
            type: "error",
            ts: Date.now(),
            message:
              "No PostHog API key found. Sign in to PostHog to run tasks.",
          });
          return;
        }

        if (!apiHost) {
          store.addLog(taskId, {
            type: "error",
            ts: Date.now(),
            message:
              "No PostHog API host found. Please check your region settings.",
          });
          return;
        }

        if (!projectId) {
          store.addLog(taskId, {
            type: "error",
            ts: Date.now(),
            message: "No PostHog project ID found. Please check your settings.",
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

        // Handle cloud mode - run task via API
        if (currentTaskState.runMode === "cloud") {
          const { client } = useAuthStore.getState();
          store.setProgress(taskId, null);
          store.setRunning(taskId, true);
          const startTs = Date.now();
          store.setLogs(taskId, [
            {
              type: "token",
              ts: startTs,
              content: `Starting task run in cloud...`,
            },
          ]);

          try {
            if (!client) {
              throw new Error("API client not available");
            }
            await client.runTask(taskId);
            store.addLog(taskId, {
              type: "token",
              ts: Date.now(),
              content: "Task started in cloud successfully",
            });
            store.setRunning(taskId, false);
          } catch (error) {
            store.addLog(taskId, {
              type: "error",
              ts: Date.now(),
              message: `Error starting cloud task: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
            store.setRunning(taskId, false);
          }
          return;
        }

        // Handle local mode - run task via electron agent
        // Ensure repo path is set
        const effectiveRepoPath = taskState.repoPath;

        if (!effectiveRepoPath) {
          // Prompt user to select directory or clone
          const hasRepo = !!task.repository_config;
          const repoConfig = task.repository_config;

          const result = await window.electronAPI.showMessageBox({
            type: "question",
            title: "Select working directory",
            message:
              hasRepo && repoConfig
                ? `Do you have ${repoConfig.organization}/${repoConfig.repository} locally?`
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
            // User cancelled
            return;
          }

          if (result.response === 0) {
            // User has repo locally or wants to select directory
            const selectedPath = await window.electronAPI.selectDirectory();

            if (!selectedPath) {
              // User cancelled directory selection
              return;
            }

            // Set the repo path and revalidate
            store.setRepoPath(taskId, selectedPath);
            await store.revalidateRepo(taskId);

            // Retry running the task with the new path (skip initialization)
            return store.runTask(taskId, task, true);
          }

          if (result.response === 1 && hasRepo && repoConfig) {
            // User wants to clone - trigger clone and retry
            const { repositoryWorkspaceStore } = await import(
              "@stores/repositoryWorkspaceStore"
            );

            // Derive default path from workspace
            const { defaultWorkspace } = useAuthStore.getState();
            if (!defaultWorkspace) {
              store.addLog(taskId, {
                type: "error",
                ts: Date.now(),
                message:
                  "No workspace configured. Please configure a workspace in settings.",
              });
              return;
            }

            const derivedPath = derivePath(
              defaultWorkspace,
              repoConfig.repository,
            );
            store.setRepoPath(taskId, derivedPath);

            const cloneId = `clone-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            cloneStore.getState().startClone(cloneId, repoConfig, derivedPath);

            try {
              await repositoryWorkspaceStore
                .getState()
                .selectRepository(repoConfig, cloneId);

              // Wait for clone to complete, then retry run
              // The clone progress will show in the UI via TaskActions
              // We return here and let the user manually retry after clone completes
              store.addLog(taskId, {
                type: "token",
                ts: Date.now(),
                content: `Cloning ${repoConfig.organization}/${repoConfig.repository}... Click Run again after the clone completes.`,
              });
              return;
            } catch (error) {
              store.addLog(taskId, {
                type: "error",
                ts: Date.now(),
                message: `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`,
              });
              return;
            }
          }

          return;
        }

        // Check if repository is currently being cloned
        if (task.repository_config) {
          const repoKey = getRepoKey(
            task.repository_config.organization,
            task.repository_config.repository,
          );
          const { isCloning } = cloneStore.getState();

          if (isCloning(repoKey)) {
            store.addLog(taskId, {
              type: "error",
              ts: Date.now(),
              message: `Repository ${repoKey} is currently being cloned. Please wait for the clone to complete before running this task.`,
            });
            return;
          }
        }

        // Quick validation without logging errors (we'll handle it gracefully)
        const canWrite =
          await window.electronAPI?.checkWriteAccess(effectiveRepoPath);
        const isRepo = canWrite
          ? await window.electronAPI?.validateRepo(effectiveRepoPath)
          : false;

        if (!canWrite || !isRepo) {
          // Repository path is invalid - clear it and show the prompt again
          // Don't log errors, just gracefully re-prompt the user
          store.setRepoPath(taskId, null);

          // Recursively call runTask to trigger the prompt flow (skip initialization)
          return store.runTask(taskId, task, true);
        }

        const permissionMode = "acceptEdits";

        store.setProgress(taskId, null);
        store.setRunning(taskId, true);
        const startTs = Date.now();
        store.setLogs(taskId, [
          {
            type: "token",
            ts: startTs,
            content: `Starting task run...`,
          },
          {
            type: "token",
            ts: startTs,
            content: `Permission mode: ${permissionMode}`,
          },
          {
            type: "token",
            ts: startTs,
            content: `Repo: ${effectiveRepoPath}`,
          },
        ]);

        try {
          const { createPR } = useSettingsStore.getState();
          const result = await window.electronAPI?.agentStart({
            taskId: task.id,
            repoPath: effectiveRepoPath,
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
            store.addLog(taskId, {
              type: "error",
              ts: Date.now(),
              message: "Failed to start agent: electronAPI not available",
            });
            store.setRunning(taskId, false);
            return;
          }
          const { taskId: executionTaskId, channel } = result;

          store.setCurrentTaskId(taskId, executionTaskId);

          // Subscribe to streaming events using store-managed subscription
          store.subscribeToAgentEvents(taskId, channel);
        } catch (error) {
          store.addLog(taskId, {
            type: "error",
            ts: Date.now(),
            message: `Error starting agent: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
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

        store.addLog(taskId, {
          type: "token",
          ts: Date.now(),
          content: "Run cancelled",
        });

        store.setRunning(taskId, false);
        store.unsubscribeFromAgentEvents(taskId);
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

        if (taskState.repoPath) return;

        // 1. Check taskDirectoryStore first
        const repoKey = task.repository_config
          ? `${task.repository_config.organization}/${task.repository_config.repository}`
          : undefined;

        const storedDirectory = useTaskDirectoryStore
          .getState()
          .getTaskDirectory(taskId, repoKey);
        if (storedDirectory) {
          store.setRepoPath(taskId, storedDirectory);

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
        if (!task.repository_config) return;

        const { defaultWorkspace } = useAuthStore.getState();
        if (!defaultWorkspace) return;

        const path = derivePath(
          defaultWorkspace,
          task.repository_config.repository,
        );
        store.setRepoPath(taskId, path);

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
            isArtifactEvent(log) && (log as any).kind === "todos",
        );

        if (todosArtifact) {
          store.setTodos(taskId, (todosArtifact as any).content);
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
            useTaskPanelLayoutStore.getState().openArtifact(taskId, "plan.md");
          }
        } catch (error) {
          console.error("Failed to load plan:", error);
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
          console.error("Failed to load todos:", error);
        }
      },
    }),
    {
      name: "task-execution-storage",
      // Don't persist unsubscribe functions and pollers as they can't be serialized
      partialize: (state) => ({
        taskStates: Object.fromEntries(
          Object.entries(state.taskStates).map(([taskId, taskState]) => [
            taskId,
            { ...taskState, unsubscribe: null, logPoller: null },
          ]),
        ),
      }),
    },
  ),
);
