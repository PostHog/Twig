import { CodeIcon, CopyIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { DetectedApplication } from "@shared/types";
import { toast } from "@utils/toast";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [detectedApps, setDetectedApps] = useState<DetectedApplication[]>([]);
  const [lastUsed, setLastUsed] = useState<{
    lastUsedApp?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      window.electronAPI.externalApps.getDetectedApps(),
      window.electronAPI.externalApps.getLastUsed(),
    ])
      .then(([apps, last]) => {
        setDetectedApps(apps);
        setLastUsed(last);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const defaultApp = useMemo(() => {
    if (lastUsed.lastUsedApp) {
      const app = detectedApps.find((a) => a.id === lastUsed.lastUsedApp);
      if (app) return app;
    }
    return detectedApps[0] || null;
  }, [detectedApps, lastUsed]);

  const handleOpenDefault = useCallback(async () => {
    if (!defaultApp || !targetPath) return;
    try {
      const result = await window.electronAPI.externalApps.openInApp(
        defaultApp.id,
        targetPath,
      );
      if (result.success) {
        await window.electronAPI.externalApps.setLastUsed(defaultApp.id);
        setLastUsed({
          lastUsedApp: defaultApp.id,
        });
        const pathName = targetPath.split("/").pop() || targetPath;
        toast.success(`Opening in ${defaultApp.name}`, {
          description: pathName,
        });
      } else {
        toast.error(`Failed to open in ${defaultApp.name}`);
      }
    } catch (_error) {
      toast.error(`Failed to open in ${defaultApp.name}`);
    }
  }, [defaultApp, targetPath]);

  const handleOpenWith = useCallback(
    async (appId: string) => {
      if (!targetPath) return;
      const app = detectedApps.find((a) => a.id === appId);
      if (!app) return;
      try {
        const result = await window.electronAPI.externalApps.openInApp(
          appId,
          targetPath,
        );
        if (result.success) {
          await window.electronAPI.externalApps.setLastUsed(appId);
          setLastUsed({
            lastUsedApp: appId,
          });
          const pathName = targetPath.split("/").pop() || targetPath;
          toast.success(`Opening in ${app.name}`, {
            description: pathName,
          });
        } else {
          toast.error(`Failed to open in ${app.name}`);
        }
      } catch (_error) {
        toast.error(`Failed to open in ${app.name}`);
      }
    },
    [detectedApps, targetPath],
  );

  const handleCopyPath = useCallback(async () => {
    if (!targetPath) return;
    try {
      await window.electronAPI.externalApps.copyPath(targetPath);
      toast.success("Path copied to clipboard");
    } catch (_error) {
      toast.error("Failed to copy path");
    }
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
