import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Box } from "@radix-ui/themes";
import { useEffect } from "react";
import { useSidebarStore } from "../stores/sidebarStore";
import { Sidebar, SidebarContent } from "./index";

export function MainSidebar() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const isLoaded = useWorkspaceStore((state) => state.isLoaded);
  const setOpenAuto = useSidebarStore((state) => state.setOpenAuto);

  useEffect(() => {
    if (isLoaded) {
      const workspaceCount = Object.keys(workspaces).length;
      setOpenAuto(workspaceCount > 0);
    }
  }, [isLoaded, workspaces, setOpenAuto]);

  return (
    <Box flexShrink="0" style={{ flexShrink: 0 }}>
      <Sidebar>
        <SidebarContent />
      </Sidebar>
    </Box>
  );
}
