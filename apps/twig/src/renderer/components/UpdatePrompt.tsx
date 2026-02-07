import { DownloadIcon } from "@phosphor-icons/react";
import { Button, Card, Dialog, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { trpcReact } from "@renderer/trpc";
import { useCallback, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";

const log = logger.scope("updates");
const UPDATE_TOAST_ID = "update-available";

export function UpdatePrompt() {
  const { data: isEnabledData } = trpcReact.updates.isEnabled.useQuery();
  const isEnabled = isEnabledData?.enabled ?? false;

  const [isInstalling, setIsInstalling] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [checkResultMessage, setCheckResultMessage] = useState<string | null>(
    null,
  );
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
    onData: () => {
      // Close check dialog if open
      setCheckDialogOpen(false);
      setCheckingForUpdates(false);

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
                      A new version of Twig has been downloaded and is ready to
                      install.
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
        setCheckingForUpdates(false);
        setCheckResultMessage(status.error);
      } else if (status.checking === false && status.upToDate) {
        setCheckingForUpdates(false);
        const versionSuffix = status.version ? ` (v${status.version})` : "";
        setCheckResultMessage(`Twig is up to date${versionSuffix}`);
      } else if (status.checking === false) {
        setCheckingForUpdates(false);
      } else if (status.checking === true) {
        setCheckingForUpdates(true);
        setCheckResultMessage(null);
      }
    },
  });

  trpcReact.updates.onCheckFromMenu.useSubscription(undefined, {
    enabled: isEnabled,
    onData: async () => {
      setCheckDialogOpen(true);
      setCheckingForUpdates(true);
      setCheckResultMessage(null);

      try {
        const result = await checkMutation.mutateAsync();

        if (!result.success && result.errorCode !== "already_checking") {
          setCheckingForUpdates(false);
          setCheckResultMessage(
            result.errorMessage || "Failed to check for updates",
          );
        }
      } catch (error) {
        log.error("Failed to check for updates:", error);
        setCheckingForUpdates(false);
        setCheckResultMessage("An unexpected error occurred");
      }
    },
  });

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      {checkDialogOpen && (
        <Dialog.Root open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
          <Dialog.Content maxWidth="360px">
            <Flex direction="column" gap="3">
              <Dialog.Title className="mb-0">Check for Updates</Dialog.Title>
              <Dialog.Description>
                {checkingForUpdates ? (
                  <Flex align="center" gap="2">
                    <Spinner />
                    <Text>Checking for updates...</Text>
                  </Flex>
                ) : checkResultMessage ? (
                  <Text>{checkResultMessage}</Text>
                ) : (
                  <Text>Ready to check for updates</Text>
                )}
              </Dialog.Description>
              <Flex justify="end" mt="2">
                <Button
                  type="button"
                  onClick={() => setCheckDialogOpen(false)}
                  disabled={checkingForUpdates}
                >
                  OK
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  );
}
