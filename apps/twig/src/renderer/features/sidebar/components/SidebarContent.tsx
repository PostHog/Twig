import { Flex } from "@radix-ui/themes";
import type React from "react";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SidebarMenu } from "./SidebarMenu";

export const SidebarContent: React.FC = () => {
  return (
    <Flex direction="column" height="100%">
      <ProjectSwitcher />
      <SidebarMenu />
    </Flex>
  );
};
