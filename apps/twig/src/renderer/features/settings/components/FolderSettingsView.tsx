import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Warning } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Callout,
  Card,
  Code,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useState } from "react";

const log = logger.scope("folder-settings");

export function FolderSettingsView() {
  useSetHeaderContent(null);

  const { view, navigateToTaskInput } = useNavigationStore();
  const { folders, removeFolder } = useRegisteredFoldersStore();

  const folderId = view.type === "folder-settings" ? view.folderId : undefined;
  const folder = folders.find((f) => f.id === folderId);

  const [error, setError] = useState<string | null>(null);

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

  // When folder doesn't exist, show message to restore or remove
  if (!folder.exists) {
    return (
      <Box height="100%" overflowY="auto">
        <Box p="6" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <Flex direction="column" gap="6">
            <Flex direction="column" gap="2">
              <Heading size="4">Repository Not Found</Heading>
              <Text size="1" color="gray">
                {folder.name}
              </Text>
            </Flex>

            <Callout.Root color="amber">
              <Callout.Icon>
                <Warning />
              </Callout.Icon>
              <Callout.Text>
                <Flex direction="column" gap="1">
                  <Text weight="medium">
                    The repository folder could not be found
                  </Text>
                  <Text size="1">
                    The folder at <Code>{folder.path}</Code> no longer exists or
                    has been moved.
                  </Text>
                </Flex>
              </Callout.Text>
            </Callout.Root>

            {error && (
              <Callout.Root color="red">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Card>
              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Option 1: Restore the folder
                  </Text>
                  <Text size="1" color="gray">
                    Move or restore the repository folder back to its original
                    location:
                  </Text>
                  <Code size="1">{folder.path}</Code>
                </Flex>
              </Flex>
            </Card>

            <Card>
              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Option 2: Remove the repository
                  </Text>
                  <Text size="1" color="gray">
                    This will remove the repository from Twig, including all
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
        </Box>
      </Box>
    );
  }

  // Normal settings view when folder exists
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

          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Flex direction="column" gap="3">
            <Heading size="3">Location</Heading>
            <Card>
              <Flex direction="column" gap="2">
                <Text size="1" weight="medium">
                  Root path
                </Text>
                <Code size="1">{folder.path}</Code>
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
                    This will remove the repository from Twig, including all
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
