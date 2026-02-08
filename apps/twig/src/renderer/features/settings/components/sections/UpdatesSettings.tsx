import { SettingRow } from "@features/settings/components/SettingRow";
import { Badge, Button, Flex } from "@radix-ui/themes";
import { toast } from "@utils/toast";
import { useCallback, useRef } from "react";
import { trpcReact } from "@/renderer/trpc";

export function UpdatesSettings() {
  const { data: appVersion } = trpcReact.os.getAppVersion.useQuery();
  const checkUpdatesMutation = trpcReact.updates.check.useMutation();
  const checkingRef = useRef(false);

  trpcReact.updates.onStatus.useSubscription(undefined, {
    onData: (status) => {
      if (!checkingRef.current) return;

      if (status.checking === false && status.error) {
        checkingRef.current = false;
        toast.error("Update check failed", { description: status.error });
      } else if (status.checking === false && status.upToDate) {
        checkingRef.current = false;
        toast.success(
          `You're on the latest version${status.version ? ` (v${status.version})` : ""}`,
        );
      }
    },
  });

  const handleCheck = useCallback(async () => {
    checkingRef.current = true;

    try {
      const result = await checkUpdatesMutation.mutateAsync();
      if (!result.success && result.errorCode !== "already_checking") {
        checkingRef.current = false;
        toast.error(result.errorMessage || "Failed to check for updates");
      }
    } catch {
      checkingRef.current = false;
      toast.error("An unexpected error occurred");
    }
  }, [checkUpdatesMutation]);

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
        <Button
          variant="soft"
          size="1"
          onClick={handleCheck}
          disabled={checkUpdatesMutation.isPending}
        >
          {checkUpdatesMutation.isPending ? "Checking..." : "Check now"}
        </Button>
      </SettingRow>
    </Flex>
  );
}
