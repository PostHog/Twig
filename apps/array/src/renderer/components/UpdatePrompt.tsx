import { Button, Dialog, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useCallback, useEffect, useState } from "react";

const log = logger.scope("updates");

export function UpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [checkResultMessage, setCheckResultMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onUpdateReady(() => {
      setErrorMessage(null);
      setOpen(true);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribeStatus = window.electronAPI?.onUpdateStatus((status) => {
      if (status.checking === false && status.upToDate) {
        setCheckingForUpdates(false);
        setCheckResultMessage(
          `Array is up to date (version ${window.electronAPI ? "" : "unknown"})`,
        );
      } else if (status.checking === false) {
        setCheckingForUpdates(false);
      } else if (status.checking === true) {
        setCheckingForUpdates(true);
        setCheckResultMessage(null);
      }
    });

    return () => {
      unsubscribeStatus?.();
    };
  }, []);

  useEffect(() => {
    const handleMenuCheck = async () => {
      setCheckDialogOpen(true);
      setCheckingForUpdates(true);
      setCheckResultMessage(null);

      try {
        const result = await window.electronAPI?.checkForUpdates();

        if (!result?.success) {
          setCheckingForUpdates(false);
          setCheckResultMessage(result?.error || "Failed to check for updates");
        }
      } catch (error) {
        log.error("Failed to check for updates:", error);
        setCheckingForUpdates(false);
        setCheckResultMessage("An unexpected error occurred");
      }
    };

    const unsubscribeMenuCheck = window.electronAPI?.onCheckForUpdatesMenu(() =>
      handleMenuCheck(),
    );

    return () => {
      unsubscribeMenuCheck?.();
    };
  }, []);

  const handleRestart = useCallback(async () => {
    if (!window.electronAPI || isInstalling) {
      return;
    }

    setIsInstalling(true);
    setErrorMessage(null);

    try {
      const result = await window.electronAPI.installUpdate();
      if (!result?.installed) {
        setErrorMessage(
          "Couldn't restart automatically. Please quit and relaunch manually.",
        );
        setIsInstalling(false);
      }
      // When installed === true the app will quit immediately.
    } catch (error) {
      log.error("Failed to install update", error);
      setErrorMessage("Update failed to install. Try quitting manually.");
      setIsInstalling(false);
    }
  }, [isInstalling]);

  return (
    <>
      {/* Update ready dialog */}
      {open && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Content maxWidth="360px">
            <Flex direction="column" gap="3">
              <Dialog.Title className="mb-0">Update ready</Dialog.Title>
              <Dialog.Description>
                A new version of Array has finished downloading. Restart now to
                install it or choose Later to keep working and update next time.
              </Dialog.Description>
              {errorMessage ? (
                <Text size="2" color="red">
                  {errorMessage}
                </Text>
              ) : null}
              <Flex justify="end" gap="3" mt="2">
                <Button
                  type="button"
                  variant="soft"
                  color="gray"
                  onClick={() => setOpen(false)}
                  disabled={isInstalling}
                >
                  Later
                </Button>
                <Button
                  type="button"
                  onClick={handleRestart}
                  disabled={isInstalling}
                >
                  {isInstalling ? "Restarting…" : "Restart now"}
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {/* Check for updates dialog (menu-triggered) */}
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
