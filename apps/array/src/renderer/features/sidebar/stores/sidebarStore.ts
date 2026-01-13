import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarViewMode = "folders" | "history";

interface SidebarStoreState {
  open: boolean;
  hasUserSetOpen: boolean;
  width: number;
  isResizing: boolean;
  collapsedSections: Set<string>;
  folderOrder: string[];
  viewMode: SidebarViewMode;
  historyVisibleCount: number;
}

interface SidebarStoreActions {
  setOpen: (open: boolean) => void;
  setOpenAuto: (open: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
  toggleSection: (sectionId: string) => void;
  reorderFolders: (fromIndex: number, toIndex: number) => void;
  setFolderOrder: (order: string[]) => void;
  syncFolderOrder: (folderIds: string[]) => void;
  setViewMode: (mode: SidebarViewMode) => void;
  loadMoreHistory: () => void;
  resetHistoryVisibleCount: () => void;
}

type SidebarStore = SidebarStoreState & SidebarStoreActions;

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      open: false,
      hasUserSetOpen: false,
      width: 256,
      isResizing: false,
      collapsedSections: new Set<string>(),
      folderOrder: [],
      viewMode: "history" as SidebarViewMode,
      historyVisibleCount: 25,
      setOpen: (open) => set({ open, hasUserSetOpen: true }),
      setOpenAuto: (open) =>
        set((state) => (state.hasUserSetOpen ? state : { open })),
      toggle: () =>
        set((state) => ({ open: !state.open, hasUserSetOpen: true })),
      setWidth: (width) => set({ width }),
      setIsResizing: (isResizing) => set({ isResizing }),
      toggleSection: (sectionId) =>
        set((state) => {
          const newCollapsedSections = new Set(state.collapsedSections);
          if (newCollapsedSections.has(sectionId)) {
            newCollapsedSections.delete(sectionId);
          } else {
            newCollapsedSections.add(sectionId);
          }
          return { collapsedSections: newCollapsedSections };
        }),
      reorderFolders: (fromIndex, toIndex) =>
        set((state) => {
          const newOrder = [...state.folderOrder];
          const [removed] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, removed);
          return { folderOrder: newOrder };
        }),
      setFolderOrder: (order) => set({ folderOrder: order }),
      syncFolderOrder: (folderIds) =>
        set((state) => {
          const existingOrder = state.folderOrder.filter((id) =>
            folderIds.includes(id),
          );
          const newFolders = folderIds.filter(
            (id) => !state.folderOrder.includes(id),
          );
          if (
            newFolders.length > 0 ||
            existingOrder.length !== state.folderOrder.length
          ) {
            return { folderOrder: [...existingOrder, ...newFolders] };
          }
          return state;
        }),
      setViewMode: (mode) => set({ viewMode: mode }),
      loadMoreHistory: () =>
        set((state) => ({
          historyVisibleCount: state.historyVisibleCount + 25,
        })),
      resetHistoryVisibleCount: () => set({ historyVisibleCount: 25 }),
    }),
    {
      name: "sidebar-storage",
      partialize: (state) => ({
        open: state.open,
        hasUserSetOpen: state.hasUserSetOpen,
        width: state.width,
        collapsedSections: Array.from(state.collapsedSections),
        folderOrder: state.folderOrder,
        viewMode: state.viewMode,
        historyVisibleCount: state.historyVisibleCount,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          open?: boolean;
          hasUserSetOpen?: boolean;
          width?: number;
          collapsedSections?: string[];
          folderOrder?: string[];
          viewMode?: SidebarViewMode;
          historyVisibleCount?: number;
        };
        return {
          ...current,
          open: persistedState.open ?? current.open,
          hasUserSetOpen:
            persistedState.hasUserSetOpen ?? current.hasUserSetOpen,
          width: persistedState.width ?? current.width,
          collapsedSections: new Set(persistedState.collapsedSections ?? []),
          folderOrder: persistedState.folderOrder ?? [],
          viewMode: persistedState.viewMode ?? current.viewMode,
          historyVisibleCount:
            persistedState.historyVisibleCount ?? current.historyVisibleCount,
        };
      },
    },
  ),
);
