import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { SettingRow } from "@features/settings/components/SettingRow";
import { Flex } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const log = logger.scope("workspaces-settings");

export function WorkspacesSettings() {
  const [localWorktreeLocation, setLocalWorktreeLocation] =
    useState<string>("");

  const { data: worktreeLocation } = useQuery({
    queryKey: ["settings", "worktreeLocation"],
    queryFn: async () => {
      const result = await trpcVanilla.secureStore.getItem.query({
        key: "worktreeLocation",
      });
      return result ?? null;
    },
  });

  useEffect(() => {
    if (worktreeLocation) {
      setLocalWorktreeLocation(worktreeLocation);
    }
  }, [worktreeLocation]);

  const handleWorktreeLocationChange = async (newLocation: string) => {
    setLocalWorktreeLocation(newLocation);
    try {
      await trpcVanilla.secureStore.setItem.query({
        key: "worktreeLocation",
        value: newLocation,
      });
    } catch (error) {
      log.error("Failed to set worktree location:", error);
    }
  };

  return (
    <Flex direction="column">
      <SettingRow
        label="Workspace location"
        description="Directory where isolated workspaces are created for each task"
        noBorder
      >
        <div style={{ minWidth: "200px" }}>
          <FolderPicker
            value={localWorktreeLocation}
            onChange={handleWorktreeLocationChange}
            placeholder="~/.twig"
            size="1"
          />
        </div>
      </SettingRow>
    </Flex>
  );
}
