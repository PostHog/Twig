import { ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  Callout,
  Flex,
  Select,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { useState } from "react";
import { IS_DEV } from "@/constants/environment";
import { SocialAuthButtons, type SocialProvider } from "./SocialAuthButtons";

interface LoginFormProps {
  region: CloudRegion;
  onRegionChange: (region: CloudRegion) => void;
  onPasswordLogin: (email: string, password: string) => void;
  onSocialAuth: (provider: SocialProvider) => void;
  onSwitchToSignup: () => void;
  isLoading?: boolean;
  isPending?: boolean;
  error?: string | null;
  onCancel?: () => void;
}

export function LoginForm({
  region,
  onRegionChange,
  onPasswordLogin,
  onSocialAuth,
  onSwitchToSignup,
  isLoading = false,
  isPending = false,
  error,
  onCancel,
}: LoginFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onPasswordLogin(email, password);
    }
  };

  const handleButtonClick = () => {
    if (isPending) {
      onCancel?.();
    } else if (email && password) {
      onPasswordLogin(email, password);
    }
  };

  const isFormValid = email.trim() !== "" && password !== "";
  const isSocialAuthAvailable = region !== "dev";

  return (
    <Flex direction="column" gap="4">
      <Text size="4" weight="medium" style={{ color: "var(--cave-charcoal)" }}>
        Sign in to your account
      </Text>

      {isSocialAuthAvailable && (
        <>
          <SocialAuthButtons
            region={region}
            onSocialAuth={onSocialAuth}
            isLoading={isLoading || isPending}
          />

          <Flex align="center" gap="3">
            <Box
              style={{
                flex: 1,
                height: "1px",
                backgroundColor: "var(--gray-6)",
              }}
            />
            <Text size="2" style={{ color: "var(--gray-9)" }}>
              or
            </Text>
            <Box
              style={{
                flex: 1,
                height: "1px",
                backgroundColor: "var(--gray-6)",
              }}
            />
          </Flex>
        </>
      )}

      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text
              as="label"
              size="2"
              weight="medium"
              style={{ color: "var(--cave-charcoal)", opacity: 0.8 }}
            >
              Email
            </Text>
            <TextField.Root
              size="3"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isPending}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text
              as="label"
              size="2"
              weight="medium"
              style={{ color: "var(--cave-charcoal)", opacity: 0.8 }}
            >
              Password
            </Text>
            <TextField.Root
              size="3"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isPending}
            />
          </Flex>

          {error && (
            <Callout.Root color="red" size="1">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {isPending && (
            <Callout.Root color="blue" size="1">
              <Callout.Text>Signing in...</Callout.Text>
            </Callout.Root>
          )}

          <Button
            type="button"
            size="3"
            onClick={handleButtonClick}
            disabled={isLoading || (!isPending && !isFormValid)}
            style={{
              backgroundColor: isPending
                ? "var(--gray-8)"
                : "var(--cave-charcoal)",
              color: isPending ? "var(--gray-11)" : "var(--cave-cream)",
            }}
          >
            {isPending && <Spinner />}
            {isPending ? "Cancel" : "Sign in"}
          </Button>
        </Flex>
      </form>

      {/* Advanced options */}
      <Flex direction="column" gap="2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--gray-9)",
            fontSize: "12px",
          }}
        >
          {showAdvanced ? <ChevronUpIcon /> : <ChevronDownIcon />}
          Advanced options
        </button>

        {showAdvanced && (
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
        )}
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
