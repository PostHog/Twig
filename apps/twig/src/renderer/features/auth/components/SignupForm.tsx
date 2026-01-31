import { Button, Callout, Flex, Select, Spinner, Text } from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { IS_DEV } from "@/constants/environment";

interface SignupFormProps {
  region: CloudRegion;
  onRegionChange: (region: CloudRegion) => void;
  onSignup: () => Promise<void>;
  onSwitchToLogin: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function SignupForm({
  region,
  onRegionChange,
  onSignup,
  onSwitchToLogin,
  isLoading = false,
  error,
}: SignupFormProps) {
  const displayError = error;

  return (
    <Flex direction="column" gap="4">
      <Text size="4" weight="medium" style={{ color: "var(--cave-charcoal)" }}>
        Create your account
      </Text>

      {displayError && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{displayError}</Callout.Text>
        </Callout.Root>
      )}

      <Button
        type="button"
        size="3"
        disabled={isLoading}
        onClick={() => onSignup()}
        style={{
          backgroundColor: "var(--cave-charcoal)",
          color: "var(--cave-cream)",
        }}
      >
        {isLoading && <Spinner />}
        Continue in browser
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
          disabled={isLoading}
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
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent-9)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Sign in
        </button>
      </Text>
    </Flex>
  );
}
