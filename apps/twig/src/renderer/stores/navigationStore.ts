import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import type { SignalReport, Task, WorkspaceMode } from "@shared/types";
import { useRegisteredFoldersStore } from "@stores/registeredFoldersStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { getTaskRepository } from "@utils/repository";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("navigation-store");

type ViewType =
  | "task-detail"
  | "task-input"
  | "task-preview"
  | "report-preview"
  | "settings"
  | "folder-settings"
  | "autonomy-tasks"
  | "autonomy-onboarding";

interface ViewState {
  type: ViewType;
  data?: Task;
  report?: SignalReport;
  taskId?: string;
  reportId?: string;
  folderId?: string;
}

interface NavigationStore {
  view: ViewState;
  history: ViewState[];
  historyIndex: number;
  navigateToTask: (task: Task) => void;
  navigateToTaskPreview: (task: Task) => void;
  navigateToReportPreview: (report: SignalReport) => void;
  navigateToTaskInput: (folderId?: string) => void;
  navigateToSettings: () => void;
  navigateToFolderSettings: (folderId: string) => void;
  navigateToAutonomyTasks: () => void;
  navigateToAutonomyOnboarding: () => void;
  toggleSettings: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  hydrateTask: (tasks: Task[]) => void;
}

const isSameView = (view1: ViewState, view2: ViewState): boolean => {
  if (view1.type !== view2.type) return false;
  if (view1.type === "task-detail" && view2.type === "task-detail") {
    return view1.data?.id === view2.data?.id;
  }
  if (view1.type === "task-preview" && view2.type === "task-preview") {
    return view1.data?.id === view2.data?.id;
  }
  if (view1.type === "report-preview" && view2.type === "report-preview") {
    return view1.report?.id === view2.report?.id;
  }
  if (view1.type === "task-input" && view2.type === "task-input") {
    return view1.folderId === view2.folderId;
  }
  if (view1.type === "folder-settings" && view2.type === "folder-settings") {
    return view1.folderId === view2.folderId;
  }
  return true;
};

export const useNavigationStore = create<NavigationStore>()(
  persist(
    (set, get) => {
      const navigate = (newView: ViewState) => {
        const { view, history, historyIndex } = get();
        if (isSameView(view, newView)) {
          return;
        }
        const newHistory = [...history.slice(0, historyIndex + 1), newView];
        set({
          view: newView,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      };

      return {
        view: { type: "task-input" },
        history: [{ type: "task-input" }],
        historyIndex: 0,

        navigateToTask: async (task: Task) => {
          navigate({ type: "task-detail", data: task, taskId: task.id });
          track(ANALYTICS_EVENTS.TASK_VIEWED, {
            task_id: task.id,
          });

          const repoKey = getTaskRepository(task) ?? undefined;

          // Check if this task has an existing workspace with a folder
          const existingWorkspace =
            useWorkspaceStore.getState().workspaces[task.id];
          if (existingWorkspace?.folderId) {
            const folder = useRegisteredFoldersStore
              .getState()
              .folders.find((f) => f.id === existingWorkspace.folderId);

            if (folder && folder.exists === false) {
              log.info("Folder path is stale, redirecting to folder settings", {
                folderId: folder.id,
                path: folder.path,
              });
              navigate({ type: "folder-settings", folderId: folder.id });
              return;
            }

            if (folder) {
              if (repoKey) {
                useTaskDirectoryStore
                  .getState()
                  .setRepoDirectory(repoKey, folder.path);
              }
              return;
            }
          }

          const directory = useTaskDirectoryStore
            .getState()
            .getTaskDirectory(task.id, repoKey);

          if (directory) {
            try {
              await useRegisteredFoldersStore.getState().addFolder(directory);

              let workspaceMode: WorkspaceMode = useTaskExecutionStore
                .getState()
                .getTaskState(task.id).workspaceMode;

              if (task.latest_run?.environment === "cloud") {
                workspaceMode = "cloud";
              }

              await useWorkspaceStore
                .getState()
                .ensureWorkspace(task.id, directory, workspaceMode);
            } catch (error) {
              log.error("Failed to auto-register folder on task open:", error);
            }
          }
        },

        navigateToTaskInput: (folderId?: string) => {
          navigate({ type: "task-input", folderId });
        },

        navigateToTaskPreview: (task: Task) => {
          navigate({ type: "task-preview", data: task, taskId: task.id });
          track(ANALYTICS_EVENTS.TASK_VIEWED, {
            task_id: task.id,
          });
        },

        navigateToReportPreview: (report: SignalReport) => {
          navigate({ type: "report-preview", report, reportId: report.id });
          track(ANALYTICS_EVENTS.TASK_VIEWED, {
            task_id: `report:${report.id}`,
          });
        },

        navigateToSettings: () => {
          navigate({ type: "settings" });
          track(ANALYTICS_EVENTS.SETTINGS_VIEWED);
        },

        navigateToFolderSettings: (folderId: string) => {
          navigate({ type: "folder-settings", folderId });
        },

        navigateToAutonomyTasks: () => {
          navigate({ type: "autonomy-tasks" });
          track(ANALYTICS_EVENTS.TASK_VIEWED, {
            task_id: "autonomy-tasks",
          });
        },

        navigateToAutonomyOnboarding: () => {
          navigate({ type: "autonomy-onboarding" });
        },

        toggleSettings: () => {
          const current = get().view;
          if (current.type === "settings") {
            get().navigateToTaskInput();
          } else {
            get().navigateToSettings();
          }
        },

        goBack: () => {
          const { history, historyIndex } = get();
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            set({
              view: history[newIndex],
              historyIndex: newIndex,
            });
          }
        },

        goForward: () => {
          const { history, historyIndex } = get();
          if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            set({
              view: history[newIndex],
              historyIndex: newIndex,
            });
          }
        },

        canGoBack: () => {
          const { historyIndex } = get();
          return historyIndex > 0;
        },

        canGoForward: () => {
          const { history, historyIndex } = get();
          return historyIndex < history.length - 1;
        },

        hydrateTask: (tasks: Task[]) => {
          const { view, navigateToTask, navigateToTaskInput } = get();
          if (view.type !== "task-detail" || !view.taskId || view.data) return;

          const task = tasks.find((t) => t.id === view.taskId);
          if (task) {
            navigateToTask(task);
          } else {
            navigateToTaskInput();
          }
        },
      };
    },
    {
      name: "navigation-storage",
      partialize: (state) => ({
        view: {
          type: state.view.type,
          taskId: state.view.taskId,
          reportId: state.view.reportId,
          folderId: state.view.folderId,
        },
      }),
    },
  ),
);
