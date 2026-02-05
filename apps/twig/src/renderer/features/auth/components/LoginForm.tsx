import { Button, Callout, Flex, Select, Spinner, Text } from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { IS_DEV } from "@/constants/environment";

interface LoginFormProps {
  region: CloudRegion;
  onRegionChange: (region: CloudRegion) => void;
  onLogin: () => void;
  onSwitchToSignup: () => void;
  isLoading?: boolean;
  isPending?: boolean;
  error?: string | null;
  onCancel?: () => void;
}

export function LoginForm({
  region,
  onRegionChange,
  onLogin,
  onSwitchToSignup,
  isLoading = false,
  isPending = false,
  error,
  onCancel,
}: LoginFormProps) {
  const handleButtonClick = () => {
    if (isPending) {
      onCancel?.();
    } else {
      onLogin();
    }
  };

  return (
    <Flex direction="column" gap="4">
      <Text size="4" weight="medium" style={{ color: "var(--cave-charcoal)" }}>
        Sign in to your account
      </Text>

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {isPending && (
        <Callout.Root color="blue" size="1">
          <Callout.Text>Waiting for authorization...</Callout.Text>
        </Callout.Root>
      )}

      <Button
        type="button"
        size="3"
        onClick={handleButtonClick}
        disabled={isLoading && !isPending}
        style={{
          backgroundColor: isPending ? "var(--gray-8)" : "var(--cave-charcoal)",
          color: isPending ? "var(--gray-11)" : "var(--cave-cream)",
        }}
      >
        {isPending && <Spinner />}
        {isPending ? "Cancel" : "Continue in browser"}
      </Button>

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
          onValueChange={(value) => onRegionChange(value as CloudRegion)}
          size="3"
          disabled={isLoading || isPending}
        >
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="us">US Cloud</Select.Item>
            <Select.Item value="eu">EU Cloud</Select.Item>
            {IS_DEV && <Select.Item value="dev">Development</Select.Item>}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Text
        size="2"
        style={{ color: "var(--cave-charcoal)", textAlign: "center" }}
      >
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToSignup}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent-9)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Create one
        </button>
      </Text>
    </Flex>
  );
}
