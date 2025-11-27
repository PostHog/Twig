import { CodeIcon, CopyIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const THUMBNAIL_ICON_SIZE = 20;
const DROPDOWN_ICON_SIZE = 16;

interface ExternalAppsOpenerProps {
  targetPath: string | null;
  label?: string;
}

export function ExternalAppsOpener({
  targetPath,
  label = "Open",
}: ExternalAppsOpenerProps) {
  const { detectedApps, lastUsedAppId, isLoading, initialize } =
    useExternalAppsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const defaultApp = useMemo(() => {
    if (lastUsedAppId) {
      const app = detectedApps.find((a) => a.id === lastUsedAppId);
      if (app) return app;
    }
    return detectedApps[0] || null;
  }, [detectedApps, lastUsedAppId]);

  const handleOpenDefault = useCallback(async () => {
    if (!defaultApp || !targetPath) return;
    const displayName = targetPath.split("/").pop() || targetPath;
    await handleExternalAppAction(
      { type: "open-in-app", appId: defaultApp.id },
      targetPath,
      displayName,
    );
  }, [defaultApp, targetPath]);

  const handleOpenWith = useCallback(
    async (appId: string) => {
      if (!targetPath) return;
      const displayName = targetPath.split("/").pop() || targetPath;
      await handleExternalAppAction(
        { type: "open-in-app", appId },
        targetPath,
        displayName,
      );
    },
    [targetPath],
  );

  const handleCopyPath = useCallback(async () => {
    if (!targetPath) return;
    const displayName = targetPath.split("/").pop() || targetPath;
    await handleExternalAppAction(
      { type: "copy-path" },
      targetPath,
      displayName,
    );
  }, [targetPath]);

  useHotkeys(
    "mod+o",
    (event) => {
      event.preventDefault();
      handleOpenDefault();
    },
    { enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [handleOpenDefault],
  );

  useHotkeys(
    "mod+shift+c",
    (event) => {
      event.preventDefault();
      handleCopyPath();
    },
    { enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [handleCopyPath],
  );

  if (!targetPath) {
    return null;
  }

  const isReady = !isLoading && detectedApps.length > 0;

  return (
    <DropdownMenu.Root>
      <Flex className="no-drag">
        <Button
          size="1"
          color="gray"
          variant="outline"
          onClick={handleOpenDefault}
          disabled={!isReady || !defaultApp}
          className="hover:bg-gray-5"
        >
          {defaultApp?.icon ? (
            <img
              src={defaultApp.icon}
              width={DROPDOWN_ICON_SIZE}
              height={DROPDOWN_ICON_SIZE}
              alt=""
              style={{ borderRadius: "2px" }}
            />
          ) : (
            <CodeIcon size={DROPDOWN_ICON_SIZE} weight="regular" />
          )}
          <Text size="1">
            {label}{" "}
            <Text size="1" weight="bold">
              ⌘O
            </Text>
          </Text>
        </Button>

        <DropdownMenu.Trigger>
          <Button
            size="1"
            variant="outline"
            color="gray"
            className="hover:bg-gray-5"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenu.Trigger>
      </Flex>

      <DropdownMenu.Content align="end">
        {detectedApps.map((app) => (
          <DropdownMenu.Item
            key={app.id}
            onSelect={() => handleOpenWith(app.id)}
            shortcut={app.id === defaultApp?.id ? "⌘ O" : undefined}
            className="px-1"
          >
            <Flex align="center" gap="2">
              {app.icon ? (
                <img
                  src={app.icon}
                  width={THUMBNAIL_ICON_SIZE}
                  height={THUMBNAIL_ICON_SIZE}
                  alt=""
                />
              ) : (
                <CodeIcon size={THUMBNAIL_ICON_SIZE} weight="regular" />
              )}
              <Text size="1">{app.name}</Text>
            </Flex>
          </DropdownMenu.Item>
        ))}
        <DropdownMenu.Item
          onSelect={handleCopyPath}
          shortcut="⌘ ⇧ C"
          className="px-1"
        >
          <Flex align="center" gap="2">
            <CopyIcon size={THUMBNAIL_ICON_SIZE} weight="regular" />
            <Text size="1">Copy Path</Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
