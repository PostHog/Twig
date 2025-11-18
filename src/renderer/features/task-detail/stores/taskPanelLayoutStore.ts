import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskPanelLayout {
  openArtifacts: string[];
  activeArtifactId: string | null;
  openFiles: string[];
  activeFileId: string | null;
}

interface TaskPanelLayoutStore {
  layouts: Record<string, TaskPanelLayout>;

  getLayout: (taskId: string) => TaskPanelLayout | null;
  setLayout: (taskId: string, layout: Partial<TaskPanelLayout>) => void;
  openArtifact: (taskId: string, fileName: string) => void;
  closeArtifact: (taskId: string, fileName: string) => void;
  setActiveArtifact: (taskId: string, fileName: string | null) => void;
  openFile: (taskId: string, filePath: string) => void;
  closeFile: (taskId: string, filePath: string) => void;
  setActiveFile: (taskId: string, filePath: string | null) => void;
  clearLayout: (taskId: string) => void;
}

const defaultLayout: TaskPanelLayout = {
  openArtifacts: [],
  activeArtifactId: null,
  openFiles: [],
  activeFileId: null,
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
          const openArtifacts = currentLayout.openArtifacts || [];

          if (openArtifacts.includes(fileName)) {
            return {
              layouts: {
                ...state.layouts,
                [taskId]: {
                  ...currentLayout,
                  openArtifacts,
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
          const openArtifacts = (currentLayout.openArtifacts || []).filter(
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

      openFile: (taskId, filePath) => {
        set((state) => {
          const currentLayout = state.layouts[taskId] || defaultLayout;
          const openFiles = currentLayout.openFiles || [];

          if (openFiles.includes(filePath)) {
            return {
              layouts: {
                ...state.layouts,
                [taskId]: {
                  ...currentLayout,
                  openFiles,
                  activeFileId: filePath,
                },
              },
            };
          }

          return {
            layouts: {
              ...state.layouts,
              [taskId]: {
                ...currentLayout,
                openFiles: [...openFiles, filePath],
                activeFileId: filePath,
              },
            },
          };
        });
      },

      closeFile: (taskId, filePath) => {
        set((state) => {
          const currentLayout = state.layouts[taskId] || defaultLayout;
          const openFiles = (currentLayout.openFiles || []).filter(
            (f) => f !== filePath,
          );
          const activeFileId =
            currentLayout.activeFileId === filePath
              ? openFiles[0] || null
              : currentLayout.activeFileId;

          return {
            layouts: {
              ...state.layouts,
              [taskId]: {
                ...currentLayout,
                openFiles,
                activeFileId,
              },
            },
          };
        });
      },

      setActiveFile: (taskId, filePath) => {
        set((state) => {
          const currentLayout = state.layouts[taskId] || defaultLayout;
          return {
            layouts: {
              ...state.layouts,
              [taskId]: {
                ...currentLayout,
                openFiles: currentLayout.openFiles || [],
                activeFileId: filePath,
              },
            },
          };
        });
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
