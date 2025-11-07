import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskPanelLayout {
  openArtifacts: string[];
  activeArtifactId: string | null;
}

interface TaskPanelLayoutStore {
  layouts: Record<string, TaskPanelLayout>;

  getLayout: (taskId: string) => TaskPanelLayout | null;
  setLayout: (taskId: string, layout: Partial<TaskPanelLayout>) => void;
  openArtifact: (taskId: string, fileName: string) => void;
  closeArtifact: (taskId: string, fileName: string) => void;
  setActiveArtifact: (taskId: string, fileName: string | null) => void;
  clearLayout: (taskId: string) => void;
}

const defaultLayout: TaskPanelLayout = {
  openArtifacts: [],
  activeArtifactId: null,
};

export const useTaskPanelLayoutStore = create<TaskPanelLayoutStore>()(
  persist(
    (set, get) => ({
      layouts: {},

      getLayout: (taskId) => {
        return get().layouts[taskId] || null;
      },

      setLayout: (taskId, layout) => {
        set((state) => ({
          layouts: {
            ...state.layouts,
            [taskId]: {
              ...(state.layouts[taskId] || defaultLayout),
              ...layout,
            },
          },
        }));
      },

      openArtifact: (taskId, fileName) => {
        set((state) => {
          const currentLayout = state.layouts[taskId] || defaultLayout;
          const openArtifacts = currentLayout.openArtifacts;

          if (openArtifacts.includes(fileName)) {
            return {
              layouts: {
                ...state.layouts,
                [taskId]: {
                  ...currentLayout,
                  activeArtifactId: fileName,
                },
              },
            };
          }

          return {
            layouts: {
              ...state.layouts,
              [taskId]: {
                ...currentLayout,
                openArtifacts: [...openArtifacts, fileName],
                activeArtifactId: fileName,
              },
            },
          };
        });
      },

      closeArtifact: (taskId, fileName) => {
        set((state) => {
          const currentLayout = state.layouts[taskId] || defaultLayout;
          const openArtifacts = currentLayout.openArtifacts.filter(
            (f) => f !== fileName,
          );
          const activeArtifactId =
            currentLayout.activeArtifactId === fileName
              ? openArtifacts[0] || null
              : currentLayout.activeArtifactId;

          return {
            layouts: {
              ...state.layouts,
              [taskId]: {
                ...currentLayout,
                openArtifacts,
                activeArtifactId,
              },
            },
          };
        });
      },

      setActiveArtifact: (taskId, fileName) => {
        set((state) => ({
          layouts: {
            ...state.layouts,
            [taskId]: {
              ...(state.layouts[taskId] || defaultLayout),
              activeArtifactId: fileName,
            },
          },
        }));
      },

      clearLayout: (taskId) => {
        set((state) => {
          const { [taskId]: _, ...rest } = state.layouts;
          return { layouts: rest };
        });
      },
    }),
    {
      name: "task-panel-layout-store",
    },
  ),
);
