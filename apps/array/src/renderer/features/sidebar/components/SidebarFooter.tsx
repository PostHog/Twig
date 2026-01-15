import { Plus } from "@phosphor-icons/react";
import { GearIcon } from "@radix-ui/react-icons";
import { Box, Button, Flex, IconButton } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback } from "react";

export function SidebarFooter() {
  const { toggleSettings, navigateToTaskInput } = useNavigationStore();

  const handleNewTask = useCallback(() => {
    navigateToTaskInput();
  }, [navigateToTaskInput]);

  return (
    <Box
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: "1px solid var(--gray-6)",
        background: "var(--color-background)",
        padding: "12px",
      }}
    >
      <Flex align="center" gap="2" justify="between">
        <Button size="1" variant="ghost" color="gray" onClick={handleNewTask}>
          <Plus size={14} weight="bold" />
          New task
        </Button>

        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={toggleSettings}
          title="Settings"
        >
          <GearIcon />
        </IconButton>
      </Flex>
    </Box>
  );
}
