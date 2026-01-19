import { useAuthStore } from "@features/auth/stores/authStore";
import { Box, Callout, Flex, Select, Spinner, Text } from "@radix-ui/themes";
import caveHero from "@renderer/assets/images/cave-hero.jpg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { trpcVanilla } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { IS_DEV } from "@/constants/environment";

export const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "Failed to authenticate";
  }
  const message = error.message;

  if (message.includes("access_denied")) {
    return "Authorization cancelled.";
  }

  if (message.includes("timed out")) {
    return "Authorization timed out. Please try again.";
  }

  return message;
};

export function AuthScreen() {
  const [region, setRegion] = useState<CloudRegion>("us");

  const { loginWithOAuth } = useAuthStore();

  const authMutation = useMutation({
    mutationFn: async (selectedRegion: CloudRegion) => {
      await loginWithOAuth(selectedRegion);
    },
  });

  const handleSignIn = async () => {
    if (authMutation.isPending) {
      authMutation.reset();
      await trpcVanilla.oauth.cancelFlow.mutate();
    } else {
      authMutation.mutate(region);
    }
  };

  const handleRegionChange = (value: string) => {
    setRegion(value as CloudRegion);
    authMutation.reset();
  };

  return (
    <Flex height="100vh" style={{ position: "relative" }}>
      {/* Full-screen cave painting background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${caveHero})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Left side - login form */}
      <Flex
        width="50%"
        align="center"
        justify="center"
        style={{
          position: "relative",
          zIndex: 1,
        }}
      >
        <Flex direction="column" gap="6" style={{ maxWidth: "320px" }}>
          <Flex direction="column" gap="4">
            <img
              src={twigLogo}
              alt="Twig"
              style={{
                height: "48px",
                objectFit: "contain",
                alignSelf: "flex-start",
              }}
            />
            <Text
              size="5"
              style={{
                fontFamily: "Halfre, serif",
                color: "var(--cave-charcoal)",
                lineHeight: 1.3,
              }}
            >
              the dawn of a new agentic era
            </Text>
          </Flex>

          <Flex direction="column" gap="4">
            <Flex direction="column" gap="2">
              <Text
                size="2"
                weight="medium"
                style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
              >
                PostHog region
              </Text>
              <Select.Root
                value={region}
                onValueChange={handleRegionChange}
                size="3"
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="us">US Cloud</Select.Item>
                  <Select.Item value="eu">EU Cloud</Select.Item>
                  {IS_DEV && <Select.Item value="dev">Development</Select.Item>}
                </Select.Content>
              </Select.Root>
            </Flex>

            {authMutation.isError && (
              <Callout.Root color="red">
                <Callout.Text>
                  {getErrorMessage(authMutation.error)}
                </Callout.Text>
              </Callout.Root>
            )}

            {authMutation.isPending && (
              <Callout.Root color="blue">
                <Callout.Text>
                  Waiting for authorization in your browser...
                </Callout.Text>
              </Callout.Root>
            )}

            <button
              type="button"
              onClick={handleSignIn}
              className="flex items-center justify-center gap-2 px-6 py-3 font-bold text-base transition-opacity hover:opacity-90"
              style={{
                backgroundColor: authMutation.isPending
                  ? "var(--gray-8)"
                  : "var(--cave-charcoal)",
                color: authMutation.isPending
                  ? "var(--gray-11)"
                  : "var(--cave-cream)",
              }}
            >
              {authMutation.isPending && <Spinner />}
              {authMutation.isPending
                ? "Cancel authorization"
                : "Sign in with PostHog"}
            </button>
          </Flex>
        </Flex>
      </Flex>

      {/* Right side - empty, shows background */}
      <Box width="50%" />
    </Flex>
  );
}
