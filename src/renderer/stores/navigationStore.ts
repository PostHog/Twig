import type { Task } from "@shared/types";
import { create } from "zustand";
import { track } from "@renderer/lib/analytics";
import { ANALYTICS_EVENTS } from "@/types/analytics";

type ViewType = "task-list" | "task-detail" | "settings";

interface ViewState {
  type: ViewType;
  data?: Task;
}

interface NavigationStore {
  view: ViewState;
  history: ViewState[];
  historyIndex: number;
  navigateToTaskList: () => void;
  navigateToTask: (task: Task) => void;
  navigateToSettings: () => void;
  toggleSettings: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

const isSameView = (view1: ViewState, view2: ViewState): boolean => {
  if (view1.type !== view2.type) return false;
  if (view1.type === "task-detail" && view2.type === "task-detail") {
    return view1.data?.id === view2.data?.id;
  }
  return true;
};

export const useNavigationStore = create<NavigationStore>((set, get) => {
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
    view: { type: "task-list" },
    history: [{ type: "task-list" }],
    historyIndex: 0,

    navigateToTaskList: () => {
      navigate({ type: "task-list" });
    },

    navigateToTask: (task: Task) => {
      navigate({ type: "task-detail", data: task });
      track(ANALYTICS_EVENTS.TASK_VIEWED, {
        task_id: task.id,
      });
    },

    navigateToSettings: () => {
      navigate({ type: "settings" });
    },

    toggleSettings: () => {
      const current = get().view;
      if (current.type === "settings") {
        get().navigateToTaskList();
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
  };
});
