import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { TorchGlow } from "@components/TorchGlow";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import { Flex } from "@radix-ui/themes";
import caveHero from "@renderer/assets/images/cave-hero.jpg";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { BillingStep } from "./BillingStep";
import { PostHogIntegrationStep } from "./PostHogIntegrationStep";
import { StepIndicator } from "./StepIndicator";
import { WelcomeStep } from "./WelcomeStep";

export function OnboardingFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentStep, next, back } = useOnboardingFlow();
  const { completeOnboarding } = useTwigAuthStore();

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
    <Flex
      ref={containerRef}
      direction="column"
      height="100vh"
      style={{ position: "relative" }}
    >
      <DraggableTitleBar />
      <TorchGlow containerRef={containerRef} alwaysShow />

      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${caveHero})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Content */}
      <Flex
        direction="column"
        flexGrow="1"
        style={{ position: "relative", zIndex: 1 }}
      >
        <Flex flexGrow="1" align="center" justify="center" overflow="hidden">
          <AnimatePresence mode="wait">
            {currentStep === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{ width: "100%", height: "100%" }}
              >
                <WelcomeStep onNext={next} />
              </motion.div>
            )}

            {currentStep === "billing" && (
              <motion.div
                key="billing"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{ width: "100%", height: "100%" }}
              >
                <BillingStep onNext={next} onBack={back} />
              </motion.div>
            )}

            {currentStep === "posthog-integration" && (
              <motion.div
                key="posthog-integration"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{ width: "100%", height: "100%" }}
              >
                <PostHogIntegrationStep
                  onComplete={handleComplete}
                  onSkip={handleComplete}
                  onBack={back}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Flex>

        <StepIndicator currentStep={currentStep} />
      </Flex>
    </Flex>
  );
}
