import { useAuthStore } from "@features/auth/stores/authStore";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { SignOut } from "@phosphor-icons/react";
import { Avatar, Badge, Button, Flex, Text } from "@radix-ui/themes";

export function AccountSettings() {
  const {
    user,
    isAuthenticated,
    selectedPlan,
    logout: twigLogout,
  } = useTwigAuthStore();
  const { logout: posthogLogout, isAuthenticated: isPostHogConnected } =
    useAuthStore();

  const handleLogout = () => {
    if (isPostHogConnected) {
      posthogLogout();
    }
    twigLogout();
  };

  if (!isAuthenticated || !user) {
    return (
      <Flex direction="column" gap="3" py="4">
        <Text size="2" color="gray">
          You are not currently authenticated. Please sign in from the main
          screen.
        </Text>
      </Flex>
    );
  }

  const initials = user.name
    ? user.name.substring(0, 2).toUpperCase()
    : user.email.substring(0, 2).toUpperCase();

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
            {user.name}
          </Text>
          <Flex align="center" gap="2">
            <Text size="2" color="gray">
              {user.email}
            </Text>
            {selectedPlan && (
              <Badge
                size="1"
                variant="soft"
                color={selectedPlan === "pro" ? "orange" : "gray"}
              >
                {selectedPlan === "pro" ? "Pro" : "Free"}
              </Badge>
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
        label="Plan"
        description="Your current subscription plan"
        noBorder
      >
        <Badge
          size="2"
          variant="soft"
          color={selectedPlan === "pro" ? "orange" : "gray"}
        >
          {selectedPlan === "pro" ? "Pro — $200/mo" : "Free"}
        </Badge>
      </SettingRow>
    </Flex>
  );
}
