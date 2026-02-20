import { useAuthStore } from "@features/auth/stores/authStore";
import { ShieldWarning } from "@phosphor-icons/react";
import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useState } from "react";

const log = logger.scope("scope-reauth-prompt");

export function ScopeReauthPrompt() {
  const needsScopeReauth = useAuthStore((s) => s.needsScopeReauth);
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const loginWithOAuth = useAuthStore((s) => s.loginWithOAuth);
  const logout = useAuthStore((s) => s.logout);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!cloudRegion) {
      log.warn("Cannot re-authenticate: no cloud region available");
      return;
    }

    setIsLoading(true);
    try {
      await loginWithOAuth(cloudRegion);
    } catch (error) {
      log.error("Re-authentication failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={needsScopeReauth}>
      <Dialog.Content
        maxWidth="360px"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <ShieldWarning size={20} weight="bold" color="var(--gray-11)" />
            <Dialog.Title className="mb-0">
              Re-authentication required
            </Dialog.Title>
          </Flex>
          <Dialog.Description>
            <Text size="2" color="gray">
              Twig has been updated with new features that require additional
              permissions. Please sign in again to continue.
            </Text>
          </Dialog.Description>
          <Flex justify="between" mt="2">
            <Button type="button" variant="soft" color="gray" onClick={logout}>
              Log out
            </Button>
            <Button
              type="button"
              onClick={handleSignIn}
              loading={isLoading}
              disabled={!cloudRegion}
            >
              Sign in
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
