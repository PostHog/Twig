import { Plus } from "@phosphor-icons/react";
import { GearIcon } from "@radix-ui/react-icons";
import { Box, Button, Flex, IconButton } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback } from "react";
import { useSidebarStore } from "../stores/sidebarStore";

export function SidebarFooter() {
  const addFolder = useRegisteredFoldersStore((state) => state.addFolder);
  const { toggleSettings, navigateToTaskInput } = useNavigationStore();
  const viewMode = useSidebarStore((state) => state.viewMode);

  const handleAddRepository = useCallback(async () => {
    const selectedPath = await trpcVanilla.os.selectDirectory.query();
    if (selectedPath) {
      await addFolder(selectedPath);
    }
  }, [addFolder]);

  const handleNewTask = useCallback(() => {
    navigateToTaskInput();
  }, [navigateToTaskInput]);

  const showNewTaskButton = viewMode !== "folders";

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
        {showNewTaskButton ? (
          <Button size="1" variant="ghost" color="gray" onClick={handleNewTask}>
            <Plus size={14} weight="bold" />
            New task
          </Button>
        ) : (
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleAddRepository}
          >
            <Plus size={14} weight="bold" />
            Add repository
          </Button>
        )}

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
