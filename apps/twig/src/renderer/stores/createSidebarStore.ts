import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SidebarStoreState {
  open: boolean;
  hasUserSetOpen: boolean;
  width: number;
  isResizing: boolean;
}

export interface SidebarStoreActions {
  setOpen: (open: boolean) => void;
  setOpenAuto: (open: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
}

export type SidebarStore = SidebarStoreState & SidebarStoreActions;

interface CreateSidebarStoreOptions {
  name: string;
  defaultWidth: number;
  defaultOpen?: boolean;
}

export function createSidebarStore(options: CreateSidebarStoreOptions) {
  const { name, defaultWidth, defaultOpen = true } = options;

  return create<SidebarStore>()(
    persist(
      (set) => ({
        open: defaultOpen,
        hasUserSetOpen: false,
        width: defaultWidth,
        isResizing: false,
        setOpen: (open) => set({ open, hasUserSetOpen: true }),
        setOpenAuto: (open) =>
          set((state) => (state.hasUserSetOpen ? state : { open })),
        toggle: () =>
          set((state) => ({ open: !state.open, hasUserSetOpen: true })),
        setWidth: (width) => set({ width }),
        setIsResizing: (isResizing) => set({ isResizing }),
      }),
      {
        name,
        partialize: (state) => ({
          open: state.open,
          hasUserSetOpen: state.hasUserSetOpen,
          width: state.width,
        }),
      },
    ),
  );
}
