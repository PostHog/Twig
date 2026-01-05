import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Warning } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const log = logger.scope("folder-settings");

export function FolderSettingsView() {
  useSetHeaderContent(null);

  const { view, navigateToTaskInput } = useNavigationStore();
  const { folders, removeFolder, loadFolders } = useRegisteredFoldersStore();
  const queryClient = useQueryClient();

  const folderId = view.type === "folder-settings" ? view.folderId : undefined;
  const folder = folders.find((f) => f.id === folderId);

  const [newPath, setNewPath] = useState(folder?.path ?? "");
  const [error, setError] = useState<string | null>(null);

  // Reset form when folder changes
  useEffect(() => {
    if (folder) {
      setNewPath(folder.path);
    }
  }, [folder]);

  const updatePathMutation = useMutation({
    mutationFn: async (path: string) => {
      if (!folderId) throw new Error("No folder selected");
      return await trpcVanilla.folders.updateFolderPath.mutate({
        folderId,
        newPath: path,
      });
    },
    onSuccess: async () => {
      await loadFolders();
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setError(null);
    },
    onError: (err) => {
      log.error("Failed to update folder path:", err);
      setError(err instanceof Error ? err.message : "Failed to update path");
    },
  });

  const handlePathChange = async (path: string) => {
    setNewPath(path);
    if (folder && !folder.exists && path !== folder.path) {
      await updatePathMutation.mutateAsync(path);
    }
  };

  const handleUpdatePath = async () => {
    if (!newPath || newPath === folder?.path) return;
    await updatePathMutation.mutateAsync(newPath);
  };

  const handleRemoveFolder = async () => {
    if (!folderId) return;
    try {
      await removeFolder(folderId);
      navigateToTaskInput();
    } catch (err) {
      log.error("Failed to remove folder:", err);
      setError(err instanceof Error ? err.message : "Failed to remove folder");
    }
  };

  if (!folder) {
    return (
      <Box height="100%" overflowY="auto">
        <Box p="6" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <Callout.Root color="red">
            <Callout.Icon>
              <Warning />
            </Callout.Icon>
            <Callout.Text>Repository not found</Callout.Text>
          </Callout.Root>
        </Box>
      </Box>
    );
  }

  return (
    <Box height="100%" overflowY="auto">
      <Box p="6" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <Flex direction="column" gap="6">
          <Flex direction="column" gap="2">
            <Heading size="4">Repository Settings</Heading>
            <Text size="1" color="gray">
              Manage settings for {folder.name}
            </Text>
          </Flex>

          {!folder.exists && (
            <Callout.Root color="amber">
              <Callout.Icon>
                <Warning />
              </Callout.Icon>
              <Callout.Text>
                <Flex direction="column" gap="1">
                  <Text weight="medium">
                    Repository path needs to be updated
                  </Text>
                  <Text size="1">
                    The folder at "{folder.path}" was not found. If you moved
                    this repository, select the new location below to continue
                    working on tasks in this repository.
                  </Text>
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}

          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Flex direction="column" gap="3">
            <Heading size="3">Location</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Root path
                  </Text>
                  <FolderPicker
                    value={newPath}
                    onChange={handlePathChange}
                    placeholder={folder.path}
                    size="1"
                    skipRegister
                  />
                  <Text size="1" color="gray">
                    The main repository directory
                  </Text>
                </Flex>
                {newPath && newPath !== folder.path && folder.exists && (
                  <Button
                    variant="classic"
                    size="1"
                    onClick={handleUpdatePath}
                    disabled={updatePathMutation.isPending}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {updatePathMutation.isPending
                      ? "Updating..."
                      : "Update path"}
                  </Button>
                )}
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          <Flex direction="column" gap="3">
            <Heading size="3">Danger zone</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Remove repository
                  </Text>
                  <Text size="1" color="gray">
                    This will remove the repository from Array, including all
                    associated tasks and their workspaces. This action cannot be
                    undone.
                  </Text>
                </Flex>
                <Button
                  variant="soft"
                  color="red"
                  size="1"
                  onClick={handleRemoveFolder}
                  style={{ alignSelf: "flex-start" }}
                >
                  Remove repository
                </Button>
              </Flex>
            </Card>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
}
