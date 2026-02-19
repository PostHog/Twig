import { Flex } from "@radix-ui/themes";
import { ONBOARDING_STEPS, type OnboardingStep } from "../types";

interface StepIndicatorProps {
  currentStep: OnboardingStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  return (
    <Flex align="center" gap="2" justify="center" py="6">
      {ONBOARDING_STEPS.map((step, index) => (
        <div
          key={step}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor:
              index <= currentIndex
                ? "var(--accent-9)"
                : "rgba(255, 255, 255, 0.3)",
            transition: "background-color 0.3s ease",
          }}
        />
      ))}
    </Flex>
  );
}
