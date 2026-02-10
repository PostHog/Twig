import { createSidebarStore } from "@stores/createSidebarStore";

export const useRightSidebarStore = createSidebarStore({
  name: "right-sidebar-storage",
  defaultWidth: 300,
  defaultOpen: false,
});
