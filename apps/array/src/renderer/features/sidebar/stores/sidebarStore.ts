import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStoreState {
  open: boolean;
  width: number;
  isResizing: boolean;
  collapsedSections: Set<string>;
  folderOrder: string[];
}

interface SidebarStoreActions {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
  toggleSection: (sectionId: string) => void;
  reorderFolders: (fromIndex: number, toIndex: number) => void;
  setFolderOrder: (order: string[]) => void;
  syncFolderOrder: (folderIds: string[]) => void;
}

type SidebarStore = SidebarStoreState & SidebarStoreActions;

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      open: true,
      width: 256,
      isResizing: false,
      collapsedSections: new Set<string>(),
      folderOrder: [],
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
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
    }),
    {
      name: "sidebar-storage",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
        collapsedSections: Array.from(state.collapsedSections),
        folderOrder: state.folderOrder,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          open?: boolean;
          width?: number;
          collapsedSections?: string[];
          folderOrder?: string[];
        };
        return {
          ...current,
          open: persistedState.open ?? current.open,
          width: persistedState.width ?? current.width,
          collapsedSections: new Set(persistedState.collapsedSections ?? []),
          folderOrder: persistedState.folderOrder ?? [],
        };
      },
    },
  ),
);
