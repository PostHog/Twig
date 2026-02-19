import { useState } from "react";
import { ONBOARDING_STEPS, type OnboardingStep } from "../types";

export function useOnboardingFlow() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");

  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === ONBOARDING_STEPS.length - 1;

  const next = () => {
    if (!isLastStep) {
      setCurrentStep(ONBOARDING_STEPS[currentIndex + 1]);
    }
  };

  const back = () => {
    if (!isFirstStep) {
      setCurrentStep(ONBOARDING_STEPS[currentIndex - 1]);
    }
  };

  const goTo = (step: OnboardingStep) => {
    setCurrentStep(step);
  };

  return {
    currentStep,
    currentIndex,
    totalSteps: ONBOARDING_STEPS.length,
    isFirstStep,
    isLastStep,
    next,
    back,
    goTo,
  };
}
