import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { TorchGlow } from "@components/TorchGlow";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import {
  Box,
  Button,
  Callout,
  Flex,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import caveHero from "@renderer/assets/images/cave-hero.jpg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

type AuthMode = "login" | "signup";

export function TwigAuthScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { login, signup } = useTwigAuthStore();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await login(email, password);
    },
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      await signup(email, password, name);
    },
  });

  const isLoading = loginMutation.isPending || signupMutation.isPending;
  const error = loginMutation.error || signupMutation.error;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === "login") {
      loginMutation.mutate();
    } else {
      signupMutation.mutate();
    }
  };

  const handleAuthModeChange = (mode: AuthMode) => {
    if (mode !== authMode) {
      setAuthMode(mode);
      loginMutation.reset();
      signupMutation.reset();
    }
  };

  return (
    <Flex ref={containerRef} height="100vh" style={{ position: "relative" }}>
      <DraggableTitleBar />
      <TorchGlow containerRef={containerRef} alwaysShow />

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

      {/* Left side - auth form */}
      <Flex
        width="50%"
        align="center"
        justify="center"
        style={{ position: "relative", zIndex: 1 }}
      >
        <Flex direction="column" gap="6" style={{ width: "320px" }}>
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

          {/* Auth mode toggle */}
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
              style={{ borderRadius: "999px", flex: 1 }}
            >
              Sign in
            </Button>
            <Button
              type="button"
              size="2"
              variant={authMode === "signup" ? "solid" : "ghost"}
              onClick={() => handleAuthModeChange("signup")}
              style={{ borderRadius: "999px", flex: 1 }}
            >
              Sign up
            </Button>
          </Flex>

          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="4">
              <Text
                size="4"
                weight="medium"
                style={{ color: "var(--cave-charcoal)" }}
              >
                {authMode === "login"
                  ? "Sign in to your account"
                  : "Create your account"}
              </Text>

              {error && (
                <Callout.Root color="red" size="1">
                  <Callout.Text>
                    {error instanceof Error
                      ? error.message
                      : "Authentication failed"}
                  </Callout.Text>
                </Callout.Root>
              )}

              {authMode === "signup" && (
                <Flex direction="column" gap="1">
                  <Text
                    size="2"
                    weight="medium"
                    style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
                  >
                    Name
                  </Text>
                  <TextField.Root
                    size="3"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                  />
                </Flex>
              )}

              <Flex direction="column" gap="1">
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
                >
                  Email
                </Text>
                <TextField.Root
                  size="3"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </Flex>

              <Flex direction="column" gap="1">
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
                >
                  Password
                </Text>
                <TextField.Root
                  size="3"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </Flex>

              <Button
                type="submit"
                size="3"
                disabled={isLoading || !email}
                style={{
                  backgroundColor: "var(--cave-charcoal)",
                  color: "var(--cave-cream)",
                }}
              >
                {isLoading && <Spinner />}
                {authMode === "login" ? "Sign in" : "Create account"}
              </Button>

              <Text
                size="2"
                style={{ color: "var(--cave-charcoal)", textAlign: "center" }}
              >
                {authMode === "login"
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <button
                  type="button"
                  onClick={() =>
                    handleAuthModeChange(
                      authMode === "login" ? "signup" : "login",
                    )
                  }
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent-9)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {authMode === "login" ? "Create one" : "Sign in"}
                </button>
              </Text>
            </Flex>
          </form>
        </Flex>
      </Flex>

      {/* Right side - shows background */}
      <Box width="50%" />
    </Flex>
  );
}
