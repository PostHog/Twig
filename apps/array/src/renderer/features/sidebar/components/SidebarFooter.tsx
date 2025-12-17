import { Plus } from "@phosphor-icons/react";
import { GearIcon } from "@radix-ui/react-icons";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback } from "react";

export function SidebarFooter() {
  const addFolder = useRegisteredFoldersStore((state) => state.addFolder);
  const { toggleSettings } = useNavigationStore();

  const handleAddRepository = useCallback(async () => {
    const selectedPath = await trpcVanilla.os.selectDirectory.query();
    if (selectedPath) {
      await addFolder(selectedPath);
    }
  }, [addFolder]);

  return (
    <Box
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: "1px solid var(--gray-6)",
        background: "var(--color-background)",
        padding: "8px 12px",
      }}
    >
      <Flex align="center" justify="between">
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={handleAddRepository}
          title="Add repository"
        >
          <Flex align="center" gap="1">
            <Plus size={14} weight="bold" />
            <Text size="1">Add repository</Text>
          </Flex>
        </IconButton>

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
