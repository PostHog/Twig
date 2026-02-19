import { useAuthStore } from "@features/auth/stores/authStore";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import {
  ArrowLeft,
  Eye,
  Lightning,
  Tray,
  Bug,
  ChatIcon,
} from "@phosphor-icons/react";
import {
  Box,
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

interface PostHogIntegrationStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const AUTONOMY_FEATURES = [
  {
    icon: <Lightning size={20} />,
    title: "The Wizard",
    description: "Automatically instrument and track key events in your product.",
  },
  {
    icon: <ChatIcon size={20} />,
    title: "Ask Anything",
    description: "Ask agents anything about your product and they'll answers based on your production usage.",
  },
  {
    icon: <Tray size={20} />,
    title: "Context Engine",
    description: "Give agents a real time feed of relevant product data to the task at hand.",
  },
  {
    icon: <Eye size={20} />,
    title: "Computer vision",
    description: "Visual analysis of user sessions to find issues.",
  },
  {
    icon: <Bug size={20} />,
    title: "Bug Fixes",
    description: "Agents proactively fixes bugs based on error tracking data.",
  },
];

export function PostHogIntegrationStep({
  onComplete,
  onSkip,
  onBack,
}: PostHogIntegrationStepProps) {
  const [region, setRegion] = useState<CloudRegion>("us");
  const { loginWithOAuth } = useAuthStore();
  const { setPostHogConnected } = useTwigAuthStore();

  const connectMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
    },
    onSuccess: () => {
      setPostHogConnected(true);
      onComplete();
    },
  });

  const error = connectMutation.error;

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        gap="6"
        style={{ width: "100%", maxWidth: 720 }}
      >
        <Flex direction="column" gap="3">
          <img
            src={twigLogo}
            alt="Twig"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
          <Text
            size="6"
            style={{
              fontFamily: "Halfre, serif",
              color: "var(--cave-charcoal)",
              lineHeight: 1.3,
            }}
          >
            Unlock Product Autonomy
          </Text>
          <Text size="3" style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}>
            Connect PostHog to let agents proactively find and fix issues using
            real product data.
          </Text>
        </Flex>

        {/* Feature list */}
        <Flex direction="column" gap="2">
          {AUTONOMY_FEATURES.map((feature) => (
            <Flex
              key={feature.title}
              align="center"
              gap="3"
              p="3"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                border: "1px solid rgba(0, 0, 0, 0.08)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Box
                style={{
                  color: "var(--accent-9)",
                  flexShrink: 0,
                }}
              >
                {feature.icon}
              </Box>
              <Flex direction="column" gap="1">
                <Text
                  size="2"
                  weight="bold"
                  style={{ color: "var(--cave-charcoal)" }}
                >
                  {feature.title}
                </Text>
                <Text
                  size="2"
                  style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
                >
                  {feature.description}
                </Text>
              </Flex>
            </Flex>
          ))}
        </Flex>

        {/* Connect section */}
        <Flex direction="column" gap="3">
          {error && (
            <Callout.Root color="red" size="1">
              <Callout.Text>
                {error instanceof Error
                  ? error.message
                  : "Failed to connect PostHog"}
              </Callout.Text>
            </Callout.Root>
          )}

          {connectMutation.isPending && (
            <Callout.Root color="blue" size="1">
              <Callout.Text>Waiting for PostHog authorization...</Callout.Text>
            </Callout.Root>
          )}

          <Flex align="center" gap="2">
            <Select.Root
              value={region}
              onValueChange={(value) => setRegion(value as CloudRegion)}
              size="2"
              disabled={connectMutation.isPending}
            >
              <Select.Trigger placeholder="Region" />
              <Select.Content>
                <Select.Item value="us">🇺🇸 US</Select.Item>
                <Select.Item value="eu">🇪🇺 EU</Select.Item>
                {IS_DEV && <Select.Item value="dev">🛠️ Local</Select.Item>}
              </Select.Content>
            </Select.Root>
            <Button
              size="2"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              style={{
                backgroundColor: "var(--cave-charcoal)",
                color: "var(--cave-cream)",
              }}
            >
              {connectMutation.isPending && <Spinner />}
              {connectMutation.isPending
                ? "Connecting..."
                : "Integrate PostHog"}
            </Button>
          </Flex>
        </Flex>

        <Flex gap="3" align="center">
          <Button
            size="3"
            variant="ghost"
            onClick={onBack}
            disabled={connectMutation.isPending}
            style={{ color: "var(--cave-charcoal)" }}
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <button
            type="button"
            onClick={onSkip}
            disabled={connectMutation.isPending}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent-9)",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            Skip for now
          </button>
        </Flex>
      </Flex>
    </Flex>
  );
}
