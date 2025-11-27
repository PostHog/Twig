import { Box } from "@radix-ui/themes";
import { Sidebar, SidebarContent } from "./index";

export function MainSidebar() {
  return (
    <Box flexShrink="0" style={{ flexShrink: 0 }}>
      <Sidebar>
        <SidebarContent />
      </Sidebar>
    </Box>
  );
}
