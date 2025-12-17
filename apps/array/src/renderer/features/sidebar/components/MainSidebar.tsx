import { useTasks } from "@features/tasks/hooks/useTasks";
import { Box } from "@radix-ui/themes";
import { useEffect } from "react";
import { useSidebarStore } from "../stores/sidebarStore";
import { Sidebar, SidebarContent } from "./index";

export function MainSidebar() {
  const { data: tasks = [], isFetched } = useTasks();
  const setOpenAuto = useSidebarStore((state) => state.setOpenAuto);

  useEffect(() => {
    if (isFetched) {
      setOpenAuto(tasks.length > 0);
    }
  }, [isFetched, tasks.length, setOpenAuto]);

  return (
    <Box flexShrink="0" style={{ flexShrink: 0 }}>
      <Sidebar>
        <SidebarContent />
      </Sidebar>
    </Box>
  );
}
