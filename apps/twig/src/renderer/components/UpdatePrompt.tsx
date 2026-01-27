import { ArrowClockwise } from "@phosphor-icons/react";
import { Button, Card, Dialog, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { trpcReact } from "@renderer/trpc";
import { useCallback, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";

const log = logger.scope("updates");

const UPDATE_TOAST_ID = "update-ready";

export function UpdatePrompt() {
  const { data: isEnabledData } = trpcReact.updates.isEnabled.useQuery();
  const isEnabled = isEnabledData?.enabled ?? false;

  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [checkResultMessage, setCheckResultMessage] = useState<string | null>(
    null,
  );

  const isInstallingRef = useRef(false);
  const checkMutation = trpcReact.updates.check.useMutation();
  const installMutation = trpcReact.updates.install.useMutation();

  const handleRestart = useCallback(async () => {
    if (isInstallingRef.current) {
      return;
    }

    isInstallingRef.current = true;

    // Update the toast to show installing state
    sonnerToast.custom(
      () => (
        <UpdateToast
          isInstalling={true}
          onRestart={handleRestart}
          onDismiss={() => sonnerToast.dismiss(UPDATE_TOAST_ID)}
        />
      ),
      { id: UPDATE_TOAST_ID, duration: Number.POSITIVE_INFINITY },
    );

    try {
      const result = await installMutation.mutateAsync();
      if (!result.installed) {
        isInstallingRef.current = false;
        sonnerToast.custom(
          () => (
            <UpdateToast
              isInstalling={false}
              errorMessage="Couldn't restart automatically. Please quit and relaunch manually."
              onRestart={handleRestart}
              onDismiss={() => sonnerToast.dismiss(UPDATE_TOAST_ID)}
            />
          ),
          { id: UPDATE_TOAST_ID, duration: Number.POSITIVE_INFINITY },
        );
      }
    } catch (error) {
      log.error("Failed to install update", error);
      isInstallingRef.current = false;
      sonnerToast.custom(
        () => (
          <UpdateToast
            isInstalling={false}
            errorMessage="Update failed to install. Try quitting manually."
            onRestart={handleRestart}
            onDismiss={() => sonnerToast.dismiss(UPDATE_TOAST_ID)}
          />
        ),
        { id: UPDATE_TOAST_ID, duration: Number.POSITIVE_INFINITY },
      );
    }
  }, [installMutation]);

  const showUpdateToast = useCallback(() => {
    isInstallingRef.current = false;
    sonnerToast.custom(
      () => (
        <UpdateToast
          isInstalling={false}
          onRestart={handleRestart}
          onDismiss={() => sonnerToast.dismiss(UPDATE_TOAST_ID)}
        />
      ),
      { id: UPDATE_TOAST_ID, duration: Number.POSITIVE_INFINITY },
    );
  }, [handleRestart]);

  trpcReact.updates.onReady.useSubscription(undefined, {
    enabled: isEnabled,
    onData: () => {
      showUpdateToast();
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

        if (!result.success) {
          setCheckingForUpdates(false);
          setCheckResultMessage(result.error || "Failed to check for updates");
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

interface UpdateToastProps {
  isInstalling: boolean;
  errorMessage?: string;
  onRestart: () => void;
  onDismiss: () => void;
}

function UpdateToast({
  isInstalling,
  errorMessage,
  onRestart,
  onDismiss,
}: UpdateToastProps) {
  return (
    <Card size="2">
      <Flex gap="3" align="start">
        <Flex style={{ paddingTop: "2px", flexShrink: 0 }}>
          <ArrowClockwise size={16} weight="bold" color="var(--accent-9)" />
        </Flex>
        <Flex direction="column" gap="2" style={{ flex: 1, minWidth: 0 }}>
          <Flex direction="column" gap="1">
            <Text size="1" weight="medium">
              Update ready
            </Text>
            <Text size="1" color="gray">
              {errorMessage ||
                "A new version is ready to install. Restart when you're ready."}
            </Text>
          </Flex>
          <Flex gap="2">
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={onDismiss}
              disabled={isInstalling}
            >
              Later
            </Button>
            <Button size="1" onClick={onRestart} disabled={isInstalling}>
              {isInstalling ? "Restarting…" : "Restart"}
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}
