import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RightSidebarStoreState {
  open: boolean;
  width: number;
  isResizing: boolean;
}

interface RightSidebarStoreActions {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
}

type RightSidebarStore = RightSidebarStoreState & RightSidebarStoreActions;

export const useRightSidebarStore = create<RightSidebarStore>()(
  persist(
    (set) => ({
      open: true,
      width: 300,
      isResizing: false,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
      setWidth: (width) => set({ width }),
      setIsResizing: (isResizing) => set({ isResizing }),
    }),
    {
      name: "right-sidebar-storage",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
      }),
    },
  ),
);
