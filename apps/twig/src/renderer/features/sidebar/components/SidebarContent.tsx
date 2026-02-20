import { Box, Flex } from "@radix-ui/themes";
import type React from "react";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SidebarMenu } from "./SidebarMenu";

export const SidebarContent: React.FC = () => {
  return (
    <Flex direction="column" height="100%">
      <Box flexGrow="1" overflow="hidden">
        <SidebarMenu />
      </Box>
      <Box className="shrink-0 border-gray-6 border-t">
        <ProjectSwitcher />
      </Box>
    </Flex>
  );
};
