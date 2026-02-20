import { DownloadIcon } from "@phosphor-icons/react";
import { Button, Card, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { trpcReact } from "@renderer/trpc";
import { useCallback, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";

const log = logger.scope("updates");
const UPDATE_TOAST_ID = "update-available";
const CHECK_TOAST_ID = "update-check-status";

export function UpdatePrompt() {
  const { data: isEnabledData } = trpcReact.updates.isEnabled.useQuery();
  const isEnabled = isEnabledData?.enabled ?? false;

  const [isInstalling, setIsInstalling] = useState(false);
  const toastShownRef = useRef(false);

  const checkMutation = trpcReact.updates.check.useMutation();
  const installMutation = trpcReact.updates.install.useMutation();

  const handleRestart = useCallback(async () => {
    if (isInstalling) {
      return;
    }

    setIsInstalling(true);

    try {
      const result = await installMutation.mutateAsync();
      if (!result.installed) {
        // Dismiss the update toast and show error
        sonnerToast.dismiss(UPDATE_TOAST_ID);
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  Update failed
                </Text>
                <Text size="2" color="gray">
                  Couldn't restart automatically. Please quit and relaunch
                  manually.
                </Text>
              </Flex>
            </Card>
          ),
          { duration: 5000 },
        );
        setIsInstalling(false);
      }
    } catch (error) {
      log.error("Failed to install update", error);
      sonnerToast.dismiss(UPDATE_TOAST_ID);
      sonnerToast.custom(
        () => (
          <Card size="2">
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                Update failed
              </Text>
              <Text size="2" color="gray">
                Update failed to install. Try quitting manually.
              </Text>
            </Flex>
          </Card>
        ),
        { duration: 5000 },
      );
      setIsInstalling(false);
    }
  }, [isInstalling, installMutation]);

  const handleLater = useCallback(() => {
    sonnerToast.dismiss(UPDATE_TOAST_ID);
    toastShownRef.current = false;
  }, []);

  trpcReact.updates.onReady.useSubscription(undefined, {
    enabled: isEnabled,
    onData: (data) => {
      // Dismiss any check status toast
      sonnerToast.dismiss(CHECK_TOAST_ID);

      // Show persistent toast with action buttons
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex direction="column" gap="3">
                <Flex gap="2" align="start">
                  <Flex
                    style={{
                      paddingTop: "2px",
                      flexShrink: 0,
                    }}
                  >
                    <DownloadIcon
                      size={16}
                      weight="bold"
                      color="var(--green-9)"
                    />
                  </Flex>
                  <Flex direction="column" gap="1" style={{ flex: 1 }}>
                    <Text size="2" weight="medium">
                      Update ready
                    </Text>
                    <Text size="2" color="gray">
                      {data.version
                        ? `Version ${data.version} has been downloaded and is ready to install.`
                        : "A new version of Twig has been downloaded and is ready to install."}
                    </Text>
                  </Flex>
                </Flex>
                <Flex gap="2" justify="end">
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    onClick={handleLater}
                    disabled={isInstalling}
                  >
                    Later
                  </Button>
                  <Button
                    size="1"
                    onClick={handleRestart}
                    disabled={isInstalling}
                  >
                    {isInstalling ? "Restarting…" : "Restart now"}
                  </Button>
                </Flex>
              </Flex>
            </Card>
          ),
          {
            id: UPDATE_TOAST_ID,
            duration: Number.POSITIVE_INFINITY,
          },
        );
      }
    },
  });

  trpcReact.updates.onStatus.useSubscription(undefined, {
    enabled: isEnabled,
    onData: (status) => {
      if (status.checking === false && status.error) {
        // Show error toast
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  Update check failed
                </Text>
                <Text size="2" color="gray">
                  {status.error}
                </Text>
              </Flex>
            </Card>
          ),
          { id: CHECK_TOAST_ID, duration: 4000 },
        );
      } else if (status.checking === false && status.upToDate) {
        // Show up-to-date toast
        const versionSuffix = status.version ? ` (v${status.version})` : "";
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  Twig is up to date{versionSuffix}
                </Text>
              </Flex>
            </Card>
          ),
          { id: CHECK_TOAST_ID, duration: 3000 },
        );
      } else if (status.checking === true) {
        // Show checking toast
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex gap="2" align="center">
                <Spinner size="1" />
                <Text size="2" weight="medium">
                  Checking for updates...
                </Text>
              </Flex>
            </Card>
          ),
          { id: CHECK_TOAST_ID, duration: Number.POSITIVE_INFINITY },
        );
      }
    },
  });

  trpcReact.updates.onCheckFromMenu.useSubscription(undefined, {
    enabled: isEnabled,
    onData: async () => {
      // Show checking toast immediately
      sonnerToast.custom(
        () => (
          <Card size="2">
            <Flex gap="2" align="center">
              <Spinner size="1" />
              <Text size="2" weight="medium">
                Checking for updates...
              </Text>
            </Flex>
          </Card>
        ),
        { id: CHECK_TOAST_ID, duration: Number.POSITIVE_INFINITY },
      );

      try {
        const result = await checkMutation.mutateAsync();

        if (!result.success && result.errorCode !== "already_checking") {
          sonnerToast.custom(
            () => (
              <Card size="2">
                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">
                    Update check failed
                  </Text>
                  <Text size="2" color="gray">
                    {result.errorMessage || "Failed to check for updates"}
                  </Text>
                </Flex>
              </Card>
            ),
            { id: CHECK_TOAST_ID, duration: 4000 },
          );
        }
      } catch (error) {
        log.error("Failed to check for updates:", error);
        sonnerToast.custom(
          () => (
            <Card size="2">
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  Update check failed
                </Text>
                <Text size="2" color="gray">
                  An unexpected error occurred
                </Text>
              </Flex>
            </Card>
          ),
          { id: CHECK_TOAST_ID, duration: 4000 },
        );
      }
    },
  });

  if (!isEnabled) {
    return null;
  }

  return null;
}
