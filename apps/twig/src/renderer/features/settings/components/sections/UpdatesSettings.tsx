import { SettingRow } from "@features/settings/components/SettingRow";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Badge, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpcReact } from "@/renderer/trpc";

const log = logger.scope("updates-settings");

export function UpdatesSettings() {
  const { data: appVersion } = trpcReact.os.getAppVersion.useQuery();
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    message?: string;
    type?: "info" | "success" | "error";
  }>({});
  const hasCheckedRef = useRef(false);

  const checkUpdatesMutation = trpcReact.updates.check.useMutation();

  const handleCheckForUpdates = useCallback(async () => {
    setCheckingForUpdates(true);
    setUpdateStatus({ message: "Checking for updates...", type: "info" });

    try {
      const result = await checkUpdatesMutation.mutateAsync();

      if (result.success) {
        setUpdateStatus({
          message: "Checking for updates...",
          type: "info",
        });
      } else {
        setUpdateStatus({
          message: result.errorMessage || "Failed to check for updates",
          type: "error",
        });
        setCheckingForUpdates(false);
      }
    } catch (error) {
      log.error("Failed to check for updates:", error);
      setUpdateStatus({
        message: "An unexpected error occurred",
        type: "error",
      });
      setCheckingForUpdates(false);
    }
  }, [checkUpdatesMutation]);

  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      handleCheckForUpdates();
    }
  }, [handleCheckForUpdates]);

  trpcReact.updates.onStatus.useSubscription(undefined, {
    onData: (status) => {
      if (status.checking === false && status.upToDate) {
        setUpdateStatus({
          message: "You're on the latest version",
          type: "success",
        });
        setCheckingForUpdates(false);
      } else if (status.checking === false) {
        setCheckingForUpdates(false);
      }
    },
  });

  return (
    <Flex direction="column">
      <SettingRow label="Current version">
        <Badge size="1" variant="soft" color="gray">
          {appVersion || "Loading..."}
        </Badge>
      </SettingRow>

      <SettingRow
        label="Check for updates"
        description="Automatically checks for new versions on startup"
        noBorder
      >
        <Flex align="center" gap="3">
          {updateStatus.message && (
            <Flex align="center" gap="1">
              {updateStatus.type === "info" && checkingForUpdates && (
                <Spinner size="1" />
              )}
              {updateStatus.type === "success" && (
                <CheckCircle size={14} weight="fill" className="text-green-9" />
              )}
              {updateStatus.type === "error" && (
                <XCircle size={14} weight="fill" className="text-red-9" />
              )}
              <Text
                size="1"
                color={
                  updateStatus.type === "error"
                    ? "red"
                    : updateStatus.type === "success"
                      ? "green"
                      : "gray"
                }
              >
                {updateStatus.message}
              </Text>
            </Flex>
          )}
          <Button
            variant="soft"
            size="1"
            onClick={handleCheckForUpdates}
            disabled={checkingForUpdates}
          >
            {checkingForUpdates ? "Checking..." : "Check now"}
          </Button>
        </Flex>
      </SettingRow>
    </Flex>
  );
}
