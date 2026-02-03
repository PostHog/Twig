import { useAuthStore } from "@features/auth/stores/authStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { useMeQuery } from "@hooks/useMeQuery";
import { useProjectQuery } from "@hooks/useProjectQuery";
import { SignOut } from "@phosphor-icons/react";
import { Avatar, Badge, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { trpcVanilla } from "@/renderer/trpc";

const REGION_LABELS: Record<CloudRegion, string> = {
  us: "US Cloud",
  eu: "EU Cloud",
  dev: "Development",
};

export function AccountSettings() {
  const { isAuthenticated, cloudRegion, loginWithOAuth, logout } =
    useAuthStore();
  const { data: currentUser } = useMeQuery();
  const { data: project } = useProjectQuery();

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

  if (!isAuthenticated) {
    return (
      <Flex direction="column" gap="3" py="4">
        <Text size="2" color="gray">
          You are not currently authenticated. Please sign in from the main
          screen.
        </Text>
      </Flex>
    );
  }

  const initials = currentUser?.email
    ? currentUser.email.substring(0, 2).toUpperCase()
    : "?";

  return (
    <Flex direction="column">
      <Flex
        align="center"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Avatar size="4" fallback={initials} radius="full" color="amber" />
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <Text size="3" weight="medium">
            {currentUser?.email || "Unknown user"}
          </Text>
          <Flex align="center" gap="2">
            {cloudRegion && (
              <Badge size="1" variant="soft" color="gray">
                {REGION_LABELS[cloudRegion as CloudRegion]}
              </Badge>
            )}
            {project?.name && (
              <Text size="1" color="gray">
                {project.name}
              </Text>
            )}
          </Flex>
        </Flex>
        <Button
          variant="outline"
          color="red"
          size="1"
          onClick={handleLogout}
          style={{ cursor: "pointer" }}
        >
          <SignOut size={14} />
          Sign out
        </Button>
      </Flex>

      <SettingRow
        label="Re-authenticate"
        description="Refresh your authentication token if you're experiencing issues"
        noBorder
      >
        <Button
          variant="outline"
          size="1"
          onClick={handleReauthenticate}
          disabled={reauthMutation.isPending}
        >
          {reauthMutation.isPending && <Spinner />}
          {reauthMutation.isPending ? "Authenticating..." : "Re-authenticate"}
        </Button>
      </SettingRow>

      {reauthMutation.isError && (
        <Text size="1" color="red" mt="2">
          {reauthMutation.error instanceof Error
            ? reauthMutation.error.message
            : "Failed to re-authenticate"}
        </Text>
      )}
    </Flex>
  );
}
