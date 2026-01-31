import {
  Box,
  Button,
  Callout,
  Flex,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { CloudRegion } from "@shared/types/oauth";
import { useState } from "react";
import { SocialAuthButtons, type SocialProvider } from "./SocialAuthButtons";

interface SignupFormProps {
  region: CloudRegion;
  onSignup: (params: {
    email: string;
    password: string;
    firstName: string;
  }) => Promise<void>;
  onSocialAuth: (provider: SocialProvider) => void;
  onSwitchToLogin: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function SignupForm({
  region,
  onSignup,
  onSocialAuth,
  onSwitchToLogin,
  isLoading = false,
  error,
}: SignupFormProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!firstName.trim()) {
      setValidationError("First name is required");
      return;
    }
    if (!email.trim()) {
      setValidationError("Email is required");
      return;
    }
    if (!password) {
      setValidationError("Password is required");
      return;
    }
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }

    await onSignup({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
    });
  };

  const displayError = validationError || error;
  const isSocialAuthAvailable = region !== "dev";

  return (
    <Flex direction="column" gap="4">
      <Text size="4" weight="medium" style={{ color: "var(--cave-charcoal)" }}>
        Create your account
      </Text>

      {isSocialAuthAvailable && (
        <>
          <SocialAuthButtons
            region={region}
            onSocialAuth={onSocialAuth}
            isLoading={isLoading}
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
              First name
            </Text>
            <TextField.Root
              size="3"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isLoading}
            />
          </Flex>

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
              disabled={isLoading}
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
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </Flex>

          {displayError && (
            <Callout.Root color="red" size="1">
              <Callout.Text>{displayError}</Callout.Text>
            </Callout.Root>
          )}

          <Button
            type="submit"
            size="3"
            disabled={isLoading}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            {isLoading && <Spinner />}
            Create account
          </Button>
        </Flex>
      </form>

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
