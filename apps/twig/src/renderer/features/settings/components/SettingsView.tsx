import { useAuthStore } from "@features/auth/stores/authStore";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import {
  type SendMessagesWith,
  useSettingsStore,
} from "@features/settings/stores/settingsStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useProjectQuery } from "@hooks/useProjectQuery";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Warning } from "@phosphor-icons/react";
import {
  AlertDialog,
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
  TextField,
} from "@radix-ui/themes";
import { formatHotkey } from "@renderer/constants/keyboard-shortcuts";
import { track } from "@renderer/lib/analytics";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { logger } from "@renderer/lib/logger";
import type { CloudRegion } from "@shared/types/oauth";
import { useSettingsStore as useTerminalSettingsStore } from "@stores/settingsStore";
import { useShortcutsSheetStore } from "@stores/shortcutsSheetStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpcReact, trpcVanilla } from "@/renderer/trpc";
import { ANALYTICS_EVENTS } from "@/types/analytics";
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

const CUSTOM_TERMINAL_FONT_VALUE = "custom";
const CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS = 400;
const TERMINAL_FONT_PRESETS = [
  {
    label: "System monospace",
    value: "monospace",
  },
  {
    label: "MesloLGL Nerd Font Mono",
    value: '"MesloLGL Nerd Font Mono", monospace',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", monospace',
  },
];

export function SettingsView() {
  useSetHeaderContent(null);

  const { isAuthenticated, cloudRegion, loginWithOAuth, logout } =
    useAuthStore();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const toggleDarkMode = useThemeStore((state) => state.toggleDarkMode);
  const {
    cursorGlow,
    desktopNotifications,
    autoConvertLongText,
    sendMessagesWith,
    allowBypassPermissions,
    setCursorGlow,
    setDesktopNotifications,
    setAutoConvertLongText,
    setSendMessagesWith,
    setAllowBypassPermissions,
  } = useSettingsStore();
  const terminalLayoutMode = useTerminalSettingsStore(
    (state) => state.terminalLayoutMode,
  );
  const setTerminalLayout = useTerminalSettingsStore(
    (state) => state.setTerminalLayout,
  );
  const terminalFontFamily = useTerminalSettingsStore(
    (state) => state.terminalFontFamily,
  );
  const terminalFontFamilyLoaded = useTerminalSettingsStore(
    (state) => state.terminalFontFamilyLoaded,
  );
  const loadTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.loadTerminalFontFamily,
  );
  const setTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.setTerminalFontFamily,
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
  const [customTerminalFont, setCustomTerminalFont] = useState<string>("");
  const [showBypassWarning, setShowBypassWarning] = useState(false);
  const customFontSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (worktreeLocation) {
      setLocalWorktreeLocation(worktreeLocation);
    }
  }, [worktreeLocation]);

  useEffect(() => {
    if (!terminalFontFamilyLoaded) {
      loadTerminalFontFamily();
    }
  }, [terminalFontFamilyLoaded, loadTerminalFontFamily]);

  useEffect(() => {
    return () => {
      if (customFontSaveTimeoutRef.current) {
        clearTimeout(customFontSaveTimeoutRef.current);
        customFontSaveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const matchesPreset = TERMINAL_FONT_PRESETS.some(
      (preset) => preset.value === terminalFontFamily,
    );
    if (!matchesPreset) {
      setCustomTerminalFont(terminalFontFamily);
    }
  }, [terminalFontFamily]);

  // Tracked settings handlers
  const handleDarkModeChange = useCallback(() => {
    track(ANALYTICS_EVENTS.SETTING_CHANGED, {
      setting_name: "dark_mode",
      new_value: !isDarkMode,
      old_value: isDarkMode,
    });
    // Turn off cursor glow when switching to light mode
    if (isDarkMode && cursorGlow) {
      setCursorGlow(false);
    }
    toggleDarkMode();
  }, [isDarkMode, toggleDarkMode, cursorGlow, setCursorGlow]);

  const handleCursorGlowChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "cursor_glow",
        new_value: checked,
        old_value: cursorGlow,
      });
      setCursorGlow(checked);
    },
    [cursorGlow, setCursorGlow],
  );

  const handleTerminalLayoutChange = useCallback(
    (value: "split" | "tabbed") => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_layout",
        new_value: value,
        old_value: terminalLayoutMode,
      });
      setTerminalLayout(value);
    },
    [terminalLayoutMode, setTerminalLayout],
  );

  const clearCustomFontSaveTimeout = useCallback(() => {
    if (customFontSaveTimeoutRef.current) {
      clearTimeout(customFontSaveTimeoutRef.current);
      customFontSaveTimeoutRef.current = null;
    }
  }, []);

  const commitCustomTerminalFont = useCallback(
    (value: string) => {
      const normalizedValue = value.trim();
      if (!normalizedValue) {
        return;
      }

      const previousValue = terminalFontFamily.trim() || "monospace";
      if (normalizedValue === previousValue) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: normalizedValue,
        old_value: previousValue,
      });

      setTerminalFontFamily(normalizedValue);
    },
    [setTerminalFontFamily, terminalFontFamily],
  );

  const handleTerminalFontChange = useCallback(
    (value: string) => {
      clearCustomFontSaveTimeout();

      if (value === CUSTOM_TERMINAL_FONT_VALUE) {
        if (!customTerminalFont.trim()) {
          setTerminalFontFamily("");
          return;
        }

        commitCustomTerminalFont(customTerminalFont);
        return;
      }

      if (value === terminalFontFamily) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: value,
        old_value: terminalFontFamily,
      });

      setTerminalFontFamily(value);
    },
    [
      clearCustomFontSaveTimeout,
      commitCustomTerminalFont,
      customTerminalFont,
      setTerminalFontFamily,
      terminalFontFamily,
    ],
  );

  const handleCustomTerminalFontChange = useCallback(
    (value: string) => {
      setCustomTerminalFont(value);
      clearCustomFontSaveTimeout();
      customFontSaveTimeoutRef.current = setTimeout(() => {
        commitCustomTerminalFont(value);
      }, CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS);
    },
    [clearCustomFontSaveTimeout, commitCustomTerminalFont],
  );

  const handleCustomTerminalFontBlur = useCallback(() => {
    clearCustomFontSaveTimeout();
    commitCustomTerminalFont(customTerminalFont);
  }, [
    clearCustomFontSaveTimeout,
    commitCustomTerminalFont,
    customTerminalFont,
  ]);

  const handleAutoConvertLongTextChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "auto_convert_long_text",
        new_value: checked,
        old_value: autoConvertLongText,
      });
      setAutoConvertLongText(checked);
    },
    [autoConvertLongText, setAutoConvertLongText],
  );

  const handleSendMessagesWithChange = useCallback(
    (value: SendMessagesWith) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "send_messages_with",
        new_value: value,
        old_value: sendMessagesWith,
      });
      setSendMessagesWith(value);
    },
    [sendMessagesWith, setSendMessagesWith],
  );

  const handleBypassPermissionsChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Show warning dialog when enabling
        setShowBypassWarning(true);
      } else {
        // Directly disable without warning
        track(ANALYTICS_EVENTS.SETTING_CHANGED, {
          setting_name: "allow_bypass_permissions",
          new_value: false,
          old_value: true,
        });
        setAllowBypassPermissions(false);
      }
    },
    [setAllowBypassPermissions],
  );

  const handleConfirmBypassPermissions = useCallback(() => {
    track(ANALYTICS_EVENTS.SETTING_CHANGED, {
      setting_name: "allow_bypass_permissions",
      new_value: true,
      old_value: false,
    });
    setAllowBypassPermissions(true);
    setShowBypassWarning(false);
  }, [setAllowBypassPermissions]);

  const terminalFontSelection = TERMINAL_FONT_PRESETS.some(
    (preset) => preset.value === terminalFontFamily,
  )
    ? terminalFontFamily
    : CUSTOM_TERMINAL_FONT_VALUE;

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
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Dark mode
                    </Text>
                    <Text size="1" color="gray">
                      Use dark theme for the interface
                    </Text>
                  </Flex>
                  <Switch
                    checked={isDarkMode}
                    onCheckedChange={handleDarkModeChange}
                    size="1"
                  />
                </Flex>

                {isDarkMode && (
                  <Flex align="center" justify="between">
                    <Flex direction="column" gap="1">
                      <Text size="1" weight="medium">
                        Cursor glow
                      </Text>
                      <Text size="1" color="gray">
                        Show a glow effect that follows your cursor
                      </Text>
                    </Flex>
                    <Switch
                      checked={cursorGlow}
                      onCheckedChange={handleCursorGlowChange}
                      size="1"
                    />
                  </Flex>
                )}

                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Terminal layout
                  </Text>
                  <Select.Root
                    value={terminalLayoutMode}
                    onValueChange={(value) =>
                      handleTerminalLayoutChange(value as "split" | "tabbed")
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

                <Flex direction="column" gap="2">
                  <Text size="1" weight="medium">
                    Terminal font
                  </Text>
                  <Select.Root
                    value={terminalFontSelection}
                    onValueChange={handleTerminalFontChange}
                    size="1"
                  >
                    <Select.Trigger />
                    <Select.Content>
                      {TERMINAL_FONT_PRESETS.map((preset) => (
                        <Select.Item key={preset.value} value={preset.value}>
                          {preset.label}
                        </Select.Item>
                      ))}
                      <Select.Item value={CUSTOM_TERMINAL_FONT_VALUE}>
                        Custom font family
                      </Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray">
                    Uses locally installed fonts. Nerd fonts are recommended for
                    prompt glyphs.
                  </Text>
                  {terminalFontSelection === CUSTOM_TERMINAL_FONT_VALUE && (
                    <Flex direction="column" gap="1">
                      <TextField.Root
                        size="1"
                        placeholder="Enter font family"
                        value={customTerminalFont}
                        onChange={(event) =>
                          handleCustomTerminalFontChange(event.target.value)
                        }
                        onBlur={handleCustomTerminalFontBlur}
                      />
                      <Text size="1" color="gray">
                        Example: MesloLGL Nerd Font Mono
                      </Text>
                    </Flex>
                  )}
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

          {/* Chat Section */}
          <Flex direction="column" gap="3">
            <Heading size="3">Chat</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Desktop notifications
                    </Text>
                    <Text size="1" color="gray">
                      Show notifications when the agent finishes working on a
                      task
                    </Text>
                  </Flex>
                  <Switch
                    checked={desktopNotifications}
                    onCheckedChange={setDesktopNotifications}
                    size="1"
                  />
                </Flex>

                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Auto-convert long text
                    </Text>
                    <Text size="1" color="gray">
                      Automatically convert pasted text over 500 characters into
                      an attachment
                    </Text>
                  </Flex>
                  <Switch
                    checked={autoConvertLongText}
                    onCheckedChange={handleAutoConvertLongTextChange}
                    size="1"
                  />
                </Flex>

                <Flex align="center" justify="between">
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="medium">
                      Send messages with
                    </Text>
                    <Text size="1" color="gray">
                      Choose which key combination sends messages. Use
                      Shift+Enter for new lines.
                    </Text>
                  </Flex>
                  <Select.Root
                    value={sendMessagesWith}
                    onValueChange={(value) =>
                      handleSendMessagesWithChange(value as SendMessagesWith)
                    }
                    size="1"
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="enter">Enter</Select.Item>
                      <Select.Item value="cmd+enter">⌘ Enter</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>
              </Flex>
            </Card>
          </Flex>

          <Box className="border-gray-6 border-t" />

          {/* Task Execution Section */}
          <Flex direction="column" gap="3">
            <Heading size="3">Task Execution</Heading>
            <Card>
              <Flex direction="column" gap="4">
                <Flex align="start" justify="between" gap="4">
                  <Flex direction="column" gap="1">
                    <Flex align="center" gap="2">
                      <Warning size={16} weight="fill" color="var(--red-9)" />
                      <Text size="1" weight="medium" color="red">
                        Enable Bypass Permissions mode
                      </Text>
                    </Flex>
                    <Text size="1" color="gray">
                      Enables "Bypass Permissions" mode in the execution mode
                      selector. When active, Twig will not ask for approval
                      before running potentially dangerous commands.
                    </Text>
                  </Flex>
                  <Switch
                    checked={allowBypassPermissions}
                    onCheckedChange={handleBypassPermissionsChange}
                    size="1"
                    color="red"
                  />
                </Flex>
                {allowBypassPermissions && (
                  <Callout.Root size="1" color="red">
                    <Callout.Icon>
                      <Warning weight="fill" />
                    </Callout.Icon>
                    <Callout.Text>
                      Bypass Permissions mode is enabled. Use with extreme
                      caution.
                    </Callout.Text>
                  </Callout.Root>
                )}
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
                    placeholder="~/.twig"
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

      {/* Bypass Permissions Warning Dialog */}
      <AlertDialog.Root
        open={showBypassWarning}
        onOpenChange={setShowBypassWarning}
      >
        <AlertDialog.Content maxWidth="500px">
          <AlertDialog.Title color="red">
            <Flex align="center" gap="2">
              <Warning size={20} weight="fill" color="var(--red-9)" />
              <Text color="red" weight="bold">
                Enable Bypass Permissions mode
              </Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="3">
              <Text color="red" weight="medium">
                In Bypass Permissions mode, Twig will not ask for your approval
                before running potentially dangerous commands.
              </Text>
              <Text>
                This mode should only be used in a sandboxed container/VM that
                has restricted internet access and can easily be restored if
                damaged.
              </Text>
              <Text weight="medium">
                By proceeding, you accept all responsibility for actions taken
                while running in Bypass Permissions mode.
              </Text>
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                No, exit
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={handleConfirmBypassPermissions}
              >
                Yes, I accept
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  );
}
