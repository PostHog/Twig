import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStoreState {
  open: boolean;
  width: number;
  isResizing: boolean;
  collapsedSections: Set<string>;
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
      collapsedSections: new Set<string>(),
      setOpen: (open) => set({ open }),
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
    }),
    {
      name: "sidebar-storage",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
        collapsedSections: Array.from(state.collapsedSections),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          open?: boolean;
          width?: number;
          collapsedSections?: string[];
        };
        return {
          ...current,
          open: persistedState.open ?? current.open,
          width: persistedState.width ?? current.width,
          collapsedSections: new Set(persistedState.collapsedSections ?? []),
        };
      },
    },
  ),
);
