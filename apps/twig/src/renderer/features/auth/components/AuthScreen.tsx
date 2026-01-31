import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Box, Flex, Text } from "@radix-ui/themes";
import caveHero from "@renderer/assets/images/cave-hero.jpg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { trpcVanilla } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import type { SocialProvider } from "./SocialAuthButtons";
import { TwoFactorDialog } from "./TwoFactorDialog";

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
  const [show2FA, setShow2FA] = useState(false);

  const {
    loginWithPassword,
    loginWithSocialAuth,
    complete2FA,
    cancel2FA,
    signupWithOAuth,
    pending2FA,
  } = useAuthStore();

  // Password login mutation
  const passwordLoginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
      selectedRegion,
    }: {
      email: string;
      password: string;
      selectedRegion: CloudRegion;
    }) => {
      await loginWithPassword(email, password, selectedRegion);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "2FA_REQUIRED") {
        setShow2FA(true);
      }
    },
  });

  // 2FA completion mutation
  const twoFactorMutation = useMutation({
    mutationFn: async (code: string) => {
      await complete2FA(code);
    },
    onSuccess: () => {
      setShow2FA(false);
    },
  });

  // Social auth (first-party flow) mutation
  const socialAuthMutation = useMutation({
    mutationFn: async ({
      provider,
      selectedRegion,
    }: {
      provider: "google-oauth2" | "github" | "gitlab";
      selectedRegion: CloudRegion;
    }) => {
      await loginWithSocialAuth(provider, selectedRegion);
    },
  });

  // Signup mutation
  const signupMutation = useMutation({
    mutationFn: async (params: {
      email: string;
      password: string;
      firstName: string;
    }) => {
      await signupWithOAuth(
        params.email,
        params.password,
        params.firstName,
        region,
      );
    },
  });

  const handlePasswordLogin = async (email: string, password: string) => {
    passwordLoginMutation.mutate({ email, password, selectedRegion: region });
  };

  const handleSocialAuth = async (provider: SocialProvider) => {
    socialAuthMutation.mutate({
      provider,
      selectedRegion: region,
    });
  };

  const handleSignup = async (params: {
    email: string;
    password: string;
    firstName: string;
  }) => {
    signupMutation.mutate(params);
  };

  const handleRegionChange = (value: CloudRegion) => {
    setRegion(value);
    passwordLoginMutation.reset();
    socialAuthMutation.reset();
    signupMutation.reset();
  };

  const handleCancel = async () => {
    passwordLoginMutation.reset();
    socialAuthMutation.reset();
    await trpcVanilla.oauth.cancelFlow.mutate();
  };

  const handle2FACancel = () => {
    setShow2FA(false);
    cancel2FA();
    passwordLoginMutation.reset();
  };

  const isLoading =
    passwordLoginMutation.isPending ||
    socialAuthMutation.isPending ||
    signupMutation.isPending;
  const error =
    passwordLoginMutation.error ||
    socialAuthMutation.error ||
    signupMutation.error ||
    twoFactorMutation.error;
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

          {authMode === "login" ? (
            <LoginForm
              region={region}
              onRegionChange={handleRegionChange}
              onPasswordLogin={handlePasswordLogin}
              onSocialAuth={handleSocialAuth}
              onSwitchToSignup={() => setAuthMode("signup")}
              isLoading={isLoading}
              isPending={
                passwordLoginMutation.isPending || socialAuthMutation.isPending
              }
              error={errorMessage}
              onCancel={handleCancel}
            />
          ) : (
            <SignupForm
              region={region}
              onSignup={handleSignup}
              onSocialAuth={handleSocialAuth}
              onSwitchToLogin={() => setAuthMode("login")}
              isLoading={isLoading}
              error={errorMessage}
            />
          )}
        </Flex>
      </Flex>

      {/* Right side - empty, shows background */}
      <Box width="50%" />

      {/* 2FA Dialog */}
      {show2FA && pending2FA && (
        <TwoFactorDialog
          methods={pending2FA.methods}
          onSubmit={(code) => twoFactorMutation.mutate(code)}
          onCancel={handle2FACancel}
          isLoading={twoFactorMutation.isPending}
          error={twoFactorMutation.error?.message}
        />
      )}
    </Flex>
  );
}
