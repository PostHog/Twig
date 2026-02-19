import { useAuthStore } from "@features/auth/stores/authStore";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { PlugsConnected } from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Callout,
  Flex,
  Select,
  Spinner,
  Text,
} from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { IS_DEV } from "@/constants/environment";
import { trpcVanilla } from "@/renderer/trpc";

const REGION_LABELS: Record<CloudRegion, string> = {
  us: "🇺🇸 US Cloud",
  eu: "🇪🇺 EU Cloud",
  dev: "🛠️ Development",
};

export function IntegrationsSettings() {
  const { isPostHogConnected, setPostHogConnected } = useTwigAuthStore();
  const {
    isAuthenticated: isPostHogAuthenticated,
    cloudRegion,
    loginWithOAuth,
    logout: posthogLogout,
  } = useAuthStore();

  const [region, setRegion] = useState<CloudRegion>(cloudRegion ?? "us");

  const connectMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
      setPostHogConnected(true);
    },
  });

  const handleDisconnect = () => {
    posthogLogout();
    setPostHogConnected(false);
  };

  const handleConnect = () => {
    if (connectMutation.isPending) {
      connectMutation.reset();
      trpcVanilla.oauth.cancelFlow.mutate();
    } else {
      connectMutation.mutate();
    }
  };

  return (
    <Flex direction="column">
      <Flex
        align="center"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex
          align="center"
          justify="center"
          style={{
            width: 40,
            height: 40,
            backgroundColor: "var(--accent-3)",
          }}
        >
          <PlugsConnected size={20} style={{ color: "var(--accent-9)" }} />
        </Flex>
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <Text size="3" weight="medium">
            PostHog
          </Text>
          <Flex align="center" gap="2">
            <Badge
              size="1"
              variant="soft"
              color={
                isPostHogConnected && isPostHogAuthenticated ? "green" : "gray"
              }
            >
              {isPostHogConnected && isPostHogAuthenticated
                ? "Connected"
                : "Not connected"}
            </Badge>
            {cloudRegion && isPostHogConnected && (
              <Text size="1" color="gray">
                {REGION_LABELS[cloudRegion as CloudRegion]}
              </Text>
            )}
          </Flex>
        </Flex>
      </Flex>

      {isPostHogConnected && isPostHogAuthenticated ? (
        <SettingRow
          label="Disconnect PostHog"
          description="Remove the PostHog integration. Autonomy and inbox features will be disabled."
          noBorder
        >
          <Button
            variant="outline"
            color="red"
            size="1"
            onClick={handleDisconnect}
          >
            Disconnect
          </Button>
        </SettingRow>
      ) : (
        <Flex direction="column" gap="3" py="4">
          <Text size="2" color="gray">
            Connect PostHog to enable product autonomy features: session
            tracking, computer vision analysis, and the autonomous task inbox.
          </Text>

          {connectMutation.isError && (
            <Callout.Root color="red" size="1">
              <Callout.Text>
                {connectMutation.error instanceof Error
                  ? connectMutation.error.message
                  : "Failed to connect PostHog"}
              </Callout.Text>
            </Callout.Root>
          )}

          <Flex align="center" gap="2">
            <Select.Root
              value={region}
              onValueChange={(v) => setRegion(v as CloudRegion)}
              size="1"
              disabled={connectMutation.isPending}
            >
              <Select.Trigger placeholder="Region" />
              <Select.Content>
                <Select.Item value="us">🇺🇸 US Cloud</Select.Item>
                <Select.Item value="eu">🇪🇺 EU Cloud</Select.Item>
                {IS_DEV && <Select.Item value="dev">🛠️ Development</Select.Item>}
              </Select.Content>
            </Select.Root>
            <Button
              size="1"
              onClick={handleConnect}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending && <Spinner />}
              {connectMutation.isPending ? "Connecting..." : "Connect PostHog"}
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
