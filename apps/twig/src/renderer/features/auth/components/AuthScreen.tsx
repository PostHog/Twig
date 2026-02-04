import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import caveHero from "@renderer/assets/images/cave-hero.jpg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { trpcVanilla } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

export const getErrorMessage = (error: unknown) => {
  if (!error) {
    return null;
  }
  if (!(error instanceof Error)) {
    return "Failed to authenticate";
  }
  const message = error.message;

  if (message === "2FA_REQUIRED") {
    return null; // 2FA dialog will handle this
  }

  if (message.includes("access_denied")) {
    return "Authorization cancelled.";
  }

  if (message.includes("timed out")) {
    return "Authorization timed out. Please try again.";
  }

  if (message.includes("SSO login required")) {
    return message;
  }

  return message;
};

type AuthMode = "login" | "signup";

export function AuthScreen() {
  const [region, setRegion] = useState<CloudRegion>("us");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const { loginWithOAuth, signupWithOAuth } = useAuthStore();

  // Login mutation (OAuth authorization code + PKCE)
  const loginMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
    },
  });

  // Signup mutation
  const signupMutation = useMutation({
    mutationFn: async () => {
      await signupWithOAuth(region);
    },
  });

  const handleLogin = async () => {
    loginMutation.mutate();
  };

  const handleSignup = async () => {
    signupMutation.mutate();
  };

  const handleAuthModeChange = (mode: AuthMode) => {
    if (mode !== authMode) {
      setAuthMode(mode);
    }
  };

  const handleRegionChange = (value: CloudRegion) => {
    setRegion(value);
    loginMutation.reset();
    signupMutation.reset();
  };

  const handleCancel = async () => {
    loginMutation.reset();
    await trpcVanilla.oauth.cancelFlow.mutate();
  };

  const isLoading = loginMutation.isPending || signupMutation.isPending;
  const error = loginMutation.error || signupMutation.error;
  const errorMessage = getErrorMessage(error);

  return (
    <Flex height="100vh" style={{ position: "relative" }}>
      <DraggableTitleBar />
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

          <Flex
            align="center"
            gap="2"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.6)",
              borderRadius: "999px",
              padding: "4px",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            <Button
              type="button"
              size="2"
              variant={authMode === "login" ? "solid" : "ghost"}
              onClick={() => handleAuthModeChange("login")}
              style={{
                borderRadius: "999px",
                flex: 1,
              }}
            >
              Sign in
            </Button>
            <Button
              type="button"
              size="2"
              variant={authMode === "signup" ? "solid" : "ghost"}
              onClick={() => handleAuthModeChange("signup")}
              style={{
                borderRadius: "999px",
                flex: 1,
              }}
            >
              Sign up
            </Button>
          </Flex>

          {authMode === "login" ? (
            <LoginForm
              region={region}
              onRegionChange={handleRegionChange}
              onLogin={handleLogin}
              onSwitchToSignup={() => setAuthMode("signup")}
              isLoading={isLoading}
              isPending={loginMutation.isPending}
              error={errorMessage}
              onCancel={handleCancel}
            />
          ) : (
            <SignupForm
              region={region}
              onRegionChange={handleRegionChange}
              onSignup={handleSignup}
              onSwitchToLogin={() => setAuthMode("login")}
              isLoading={isLoading}
              error={errorMessage}
            />
          )}
        </Flex>
      </Flex>

      {/* Right side - empty, shows background */}
      <Box width="50%" />
    </Flex>
  );
}
