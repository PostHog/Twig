import { useAuthStore } from "@features/auth/stores/authStore";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import {
  type DefaultRunMode,
  useSettingsStore,
} from "@features/settings/stores/settingsStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useProjectQuery } from "@hooks/useProjectQuery";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Spinner,
  Switch,
  Text,
} from "@radix-ui/themes";
import { formatHotkey } from "@renderer/constants/keyboard-shortcuts";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { logger } from "@renderer/lib/logger";
import type { CloudRegion } from "@shared/types/oauth";
import { useSettingsStore as useTerminalLayoutStore } from "@stores/settingsStore";
import { useShortcutsSheetStore } from "@stores/shortcutsSheetStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { trpcReact, trpcVanilla } from "@/renderer/trpc";
import { useThemeStore } from "../../../stores/themeStore";

const log = logger.scope("settings");

const REGION_LABELS: Record<CloudRegion, string> = {
  us: "US Cloud",
  eu: "EU Cloud",
  dev: "Development",
};

const REGION_URLS: Record<CloudRegion, string> = {
  us: "us.posthog.com",
  eu: "eu.posthog.com",
  dev: "localhost:8010",
};

export function SettingsView() {
  useSetHeaderContent(null);

  const { isAuthenticated, cloudRegion, loginWithOAuth, logout } =
    useAuthStore();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const toggleDarkMode = useThemeStore((state) => state.toggleDarkMode);
  const {
    autoRunTasks,
    defaultRunMode,
    createPR,
    setAutoRunTasks,
    setDefaultRunMode,
    setCreatePR,
  } = useSettingsStore();
  const terminalLayoutMode = useTerminalLayoutStore(
    (state) => state.terminalLayoutMode,
  );
  const setTerminalLayout = useTerminalLayoutStore(
    (state) => state.setTerminalLayout,
  );
  const openShortcutsSheet = useShortcutsSheetStore((state) => state.open);

  const { data: currentUser } = useMeQuery();
  const { data: project } = useProjectQuery();

  const { data: worktreeLocation } = useQuery({
    queryKey: ["settings", "worktreeLocation"],
    queryFn: async () => {
      const result = await trpcVanilla.secureStore.getItem.query({
        key: "worktreeLocation",
      });
      return result ?? null;
    },
  });

  const { data: appVersion } = trpcReact.os.getAppVersion.useQuery();

  const [localWorktreeLocation, setLocalWorktreeLocation] =
    useState<string>("");
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    message?: string;
    type?: "info" | "success" | "error";
  }>({});

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

  const reauthMutation = useMutation({
    mutationFn: async (region: CloudRegion) => {
      await loginWithOAuth(region);
    },
  });

  const handleReauthenticate = async () => {
    if (reauthMutation.isPending) {
      reauthMutation.reset();
      await trpcVanilla.oauth.cancelFlow.mutate();
    } else if (cloudRegion) {
      reauthMutation.mutate(cloudRegion);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const checkUpdatesMutation = trpcReact.updates.check.useMutation();

  const handleCheckForUpdates = async () => {
    setCheckingForUpdates(true);
    setUpdateStatus({ message: "Checking for updates...", type: "info" });

    try {
      const result = await checkUpdatesMutation.mutateAsync();

      if (result.success) {
        setUpdateStatus({
          message:
            "Checking for updates. You'll be notified if an update is available.",
          type: "success",
        });
      } else {
        setUpdateStatus({
          message: result.error || "Failed to check for updates",
          type: "error",
        });
      }
    } catch (error) {
      log.error("Failed to check for updates:", error);
      setUpdateStatus({
        message: "An unexpected error occurred",
        type: "error",
      });
    } finally {
      setCheckingForUpdates(false);
    }
  };

  trpcReact.updates.onStatus.useSubscription(undefined, {
    onData: (status) => {
      if (status.checking === false && status.upToDate) {
        const versionSuffix = status.version ? ` (v${status.version})` : "";
        setUpdateStatus({
          message: `You're running the latest version${versionSuffix}`,
          type: "success",
        });
        setCheckingForUpdates(false);
      } else if (status.checking === false) {
        setCheckingForUpdates(false);
      }
    },
  });

  return (
    <Box height="100%" overflowY="auto">
      <Box p="6" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <Flex direction="column" gap="6">
          <Flex direction="column" gap="2">
            <Heading size="4">Settings</Heading>
            <Text size="1" color="gray">
              Manage your PostHog connection and preferences
            </Text>
          </Flex>

          {/* Appearance Section */}
          <Flex direction="column" gap="3">
            <Heading size="3">Appearance</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex align="center" justify="between">
                  <Text size="1" weight="medium">
                    Dark mode
                  </Text>
                  <Switch
                    checked={isDarkMode}
                    onCheckedChange={toggleDarkMode}
                    size="1"
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Terminal layout
                  </Text>
                  <Select.Root
                    value={terminalLayoutMode}
                    onValueChange={(value) =>
                      setTerminalLayout(value as "split" | "tabbed")
                    }
                    size="1"
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="split">Split pane</Select.Item>
                      <Select.Item value="tabbed">Tabbed</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray">
                    Split pane shows the terminal in a separate pane beneath the
                    logs. Tabbed shows the terminal as a tab alongside logs.
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          <Flex direction="column" gap="3">
            <Heading size="3">Keyboard shortcuts</Heading>
            <Card>
              <Flex align="center" justify="between">
                <Flex direction="column" gap="1">
                  <Text size="1" weight="medium">
                    View all shortcuts
                  </Text>
                  <Text size="1" color="gray">
                    See all available keyboard shortcuts
                  </Text>
                </Flex>
                <Button variant="soft" size="1" onClick={openShortcutsSheet}>
                  {formatHotkey("mod+/")}
                </Button>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          {/* Task Execution Section */}
          <Flex direction="column" gap="3">
            <Heading size="3">Task execution</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Auto-run new tasks
                    </Text>
                    <Text size="1" color="gray">
                      Automatically start tasks after creation
                    </Text>
                  </Flex>
                  <Switch
                    checked={autoRunTasks}
                    onCheckedChange={setAutoRunTasks}
                    size="1"
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Default run environment
                  </Text>
                  <Select.Root
                    value={defaultRunMode}
                    onValueChange={(value) =>
                      setDefaultRunMode(value as DefaultRunMode)
                    }
                    size="1"
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="local">Local</Select.Item>
                      <Select.Item value="cloud">Cloud</Select.Item>
                      <Select.Item value="last_used">Last used</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray">
                    Choose which environment to use when running tasks
                  </Text>
                </Flex>

                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Create PR for local runs
                    </Text>
                    <Text size="1" color="gray">
                      Automatically create a pull request when local tasks
                      complete
                    </Text>
                  </Flex>
                  <Switch
                    checked={createPR}
                    onCheckedChange={setCreatePR}
                    size="1"
                  />
                </Flex>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          {/* Workspace Storage Section */}
          <Flex direction="column" gap="3">
            <Heading size="3">Workspace storage</Heading>
            <Card>
              <Flex direction="column" gap="3">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Workspace location
                  </Text>
                  <FolderPicker
                    value={localWorktreeLocation}
                    onChange={handleWorktreeLocationChange}
                    placeholder="~/.array"
                    size="1"
                  />
                  <Text size="1" color="gray">
                    Directory where isolated workspaces are created for each
                    task. Workspaces are organized by repository name.
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          <Flex direction="column" gap="3">
            <Heading size="3">Data management</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Clear application storage
                  </Text>
                  <Text size="1" color="gray">
                    This will remove all locally stored application data.
                  </Text>
                </Flex>
                <Button
                  variant="soft"
                  color="red"
                  size="1"
                  onClick={clearApplicationStorage}
                  style={{ alignSelf: "flex-start" }}
                >
                  Clear all data
                </Button>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          {/* Account Section */}
          <Flex direction="column" gap="3">
            <Flex align="center" gap="3">
              <Heading size="3">Account</Heading>
              <Flex align="center" gap="2">
                <Box
                  width="8px"
                  height="8px"
                  className={`rounded-full ${isAuthenticated ? "bg-green-9" : "bg-red-9"}`}
                />
                <Text size="1" color="gray">
                  {isAuthenticated ? "Connected" : "Not connected"}
                </Text>
              </Flex>
            </Flex>

            <Card>
              <Flex direction="column" gap="3">
                {isAuthenticated && currentUser?.email && (
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="medium">
                      Email
                    </Text>
                    <Text size="1" color="gray">
                      {currentUser.email}
                    </Text>
                  </Flex>
                )}

                {isAuthenticated && project?.name && (
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="medium">
                      Project
                    </Text>
                    <Text size="1" color="gray">
                      {project.name} (ID: {project.id})
                    </Text>
                  </Flex>
                )}

                {isAuthenticated && cloudRegion && (
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="medium">
                      PostHog region
                    </Text>
                    <Flex align="center" gap="2">
                      <Badge size="1" variant="soft">
                        {REGION_LABELS[cloudRegion as CloudRegion]}
                      </Badge>
                      <Text size="1" color="gray">
                        {REGION_URLS[cloudRegion as CloudRegion]}
                      </Text>
                    </Flex>
                  </Flex>
                )}

                {appVersion && (
                  <Flex direction="column" gap="3">
                    <Flex direction="column" gap="2">
                      <Text size="1" weight="medium">
                        Version
                      </Text>
                      <Text size="1" color="gray">
                        {appVersion}
                      </Text>
                    </Flex>
                    <Button
                      variant="soft"
                      size="1"
                      onClick={handleCheckForUpdates}
                      disabled={checkingForUpdates}
                    >
                      {checkingForUpdates && <Spinner />}
                      {checkingForUpdates ? "Checking..." : "Check for updates"}
                    </Button>
                    {updateStatus.message && (
                      <Callout.Root
                        size="1"
                        color={
                          updateStatus.type === "error"
                            ? "red"
                            : updateStatus.type === "success"
                              ? "green"
                              : "blue"
                        }
                      >
                        <Callout.Text>{updateStatus.message}</Callout.Text>
                      </Callout.Root>
                    )}
                  </Flex>
                )}

                {!isAuthenticated && (
                  <Text size="1" color="gray">
                    You are not currently authenticated. Please sign in from the
                    main screen.
                  </Text>
                )}

                {reauthMutation.isError && (
                  <Text size="1" color="red">
                    {reauthMutation.error instanceof Error
                      ? reauthMutation.error.message
                      : "Failed to re-authenticate"}
                  </Text>
                )}
              </Flex>
            </Card>
            {isAuthenticated && (
              <Flex gap="2">
                <Button
                  variant="classic"
                  size="1"
                  onClick={handleReauthenticate}
                  color={reauthMutation.isPending ? "gray" : undefined}
                >
                  {reauthMutation.isPending && <Spinner />}
                  {reauthMutation.isPending
                    ? "Cancel authorization"
                    : "Re-authenticate"}
                </Button>
                <Button
                  variant="soft"
                  color="red"
                  size="1"
                  onClick={handleLogout}
                >
                  Sign out
                </Button>
              </Flex>
            )}
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
}
