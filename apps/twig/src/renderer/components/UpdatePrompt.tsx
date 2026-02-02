import { Button, Dialog, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { trpcReact } from "@renderer/trpc";
import { useCallback, useState } from "react";

const log = logger.scope("updates");

export function UpdatePrompt() {
  const { data: isEnabledData } = trpcReact.updates.isEnabled.useQuery();
  const isEnabled = isEnabledData?.enabled ?? false;

  const [open, setOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [checkResultMessage, setCheckResultMessage] = useState<string | null>(
    null,
  );

  const checkMutation = trpcReact.updates.check.useMutation();
  const installMutation = trpcReact.updates.install.useMutation();

  trpcReact.updates.onReady.useSubscription(undefined, {
    enabled: isEnabled,
    onData: () => {
      setErrorMessage(null);
      setCheckDialogOpen(false);
      setCheckingForUpdates(false);
      setOpen(true);
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
          setCheckResultMessage(result.errorMessage || "Failed to check for updates");
        }
      } catch (error) {
        log.error("Failed to check for updates:", error);
        setCheckingForUpdates(false);
        setCheckResultMessage("An unexpected error occurred");
      }
    },
  });

  const handleRestart = useCallback(async () => {
    if (isInstalling) {
      return;
    }

    setIsInstalling(true);
    setErrorMessage(null);

    try {
      const result = await installMutation.mutateAsync();
      if (!result.installed) {
        setErrorMessage(
          "Couldn't restart automatically. Please quit and relaunch manually.",
        );
        setIsInstalling(false);
      }
    } catch (error) {
      log.error("Failed to install update", error);
      setErrorMessage("Update failed to install. Try quitting manually.");
      setIsInstalling(false);
    }
  }, [isInstalling, installMutation]);

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      {open && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Content maxWidth="360px">
            <Flex direction="column" gap="3">
              <Dialog.Title className="mb-0">Update ready</Dialog.Title>
              <Dialog.Description>
                A new version of Twig has finished downloading. Restart now to
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
