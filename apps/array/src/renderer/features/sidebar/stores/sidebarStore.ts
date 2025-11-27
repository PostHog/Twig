import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStoreState {
  open: boolean;
  width: number;
  isResizing: boolean;
  expandedSections: Set<string>;
}

interface SidebarStoreActions {
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
  toggleSection: (sectionId: string) => void;
}

type SidebarStore = SidebarStoreState & SidebarStoreActions;

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      open: true,
      width: 256,
      isResizing: false,
      expandedSections: new Set<string>(),
      setOpen: (open) => set({ open }),
      setWidth: (width) => set({ width }),
      setIsResizing: (isResizing) => set({ isResizing }),
      toggleSection: (sectionId) =>
        set((state) => {
          const newExpandedSections = new Set(state.expandedSections);
          if (newExpandedSections.has(sectionId)) {
            newExpandedSections.delete(sectionId);
          } else {
            newExpandedSections.add(sectionId);
          }
          return { expandedSections: newExpandedSections };
        }),
    }),
    {
      name: "sidebar-storage",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
        expandedSections: Array.from(state.expandedSections),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          open?: boolean;
          width?: number;
          expandedSections?: string[];
        };
        return {
          ...current,
          open: persistedState.open ?? current.open,
          width: persistedState.width ?? current.width,
          expandedSections: new Set(persistedState.expandedSections ?? []),
        };
      },
    },
  ),
);
