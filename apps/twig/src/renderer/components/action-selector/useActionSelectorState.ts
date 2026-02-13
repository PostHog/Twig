import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterOtherOptions,
  isOtherOption,
  isSubmitOption,
  OTHER_OPTION_ID,
  SUBMIT_OPTION_ID,
} from "./constants";
import type { ActionSelectorProps, SelectorOption, StepAnswer } from "./types";

function needsCustomInput(option: SelectorOption): boolean {
  return option.customInput === true || isOtherOption(option.id);
}

interface UseActionSelectorStateProps {
  options: SelectorOption[];
  multiSelect: boolean;
  allowCustomInput: boolean;
  hideSubmitButton: boolean;
  currentStep: number;
  steps: ActionSelectorProps["steps"];
  initialSelections?: string[];
  onSelect: ActionSelectorProps["onSelect"];
  onMultiSelect: ActionSelectorProps["onMultiSelect"];
  onStepChange: ActionSelectorProps["onStepChange"];
  onStepAnswer: ActionSelectorProps["onStepAnswer"];
}

export function useActionSelectorState({
  options,
  multiSelect,
  allowCustomInput,
  hideSubmitButton,
  currentStep,
  steps,
  initialSelections,
  onSelect,
  onMultiSelect,
  onStepChange,
  onStepAnswer,
}: UseActionSelectorStateProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checkedOptions, setCheckedOptions] = useState<Set<string>>(() =>
    initialSelections?.length ? new Set(initialSelections) : new Set(),
  );
  const [customInput, setCustomInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [internalStep, setInternalStep] = useState(currentStep);
  const [stepAnswers, setStepAnswers] = useState<Map<number, StepAnswer>>(
    () => new Map(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const activeStep = internalStep;
  const hasSteps = steps !== undefined && steps.length > 1;
  const numSteps = steps?.length ?? 0;
  const showSubmitButton = !hideSubmitButton && (multiSelect || hasSteps);

  const allOptions = useMemo(() => {
    const opts = allowCustomInput
      ? [...options, { id: OTHER_OPTION_ID, label: "Other", description: "" }]
      : options;
    if (showSubmitButton) {
      return [
        ...opts,
        { id: SUBMIT_OPTION_ID, label: "Submit", description: "" },
      ];
    }
    return opts;
  }, [options, allowCustomInput, showSubmitButton]);

  const numOptions = allOptions.length;
  const selectedOption = allOptions[selectedIndex];
  const showInlineEdit =
    isEditing && selectedOption && needsCustomInput(selectedOption);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    setInternalStep(currentStep);
  }, [currentStep]);

  const setStep = useCallback(
    (nextStep: number) => {
      if (nextStep === activeStep) return;
      onStepChange?.(nextStep);
      setInternalStep(nextStep);
    },
    [activeStep, onStepChange],
  );

  const saveCurrentStepAnswer = useCallback(() => {
    const checkedIds = Array.from(checkedOptions);
    const answer: StepAnswer = {
      selectedIds: checkedIds,
      customInput,
    };
    setStepAnswers((prev) => {
      const next = new Map(prev);
      next.set(activeStep, answer);
      return next;
    });
    onStepAnswer?.(activeStep, checkedIds, customInput.trim() || undefined);
  }, [activeStep, checkedOptions, customInput, onStepAnswer]);

  const restoreStepAnswer = useCallback(
    (step: number) => {
      const saved = stepAnswers.get(step);
      if (saved) {
        setCheckedOptions(new Set(saved.selectedIds));
        setCustomInput(saved.customInput);
      } else if (initialSelections?.length) {
        setCheckedOptions(new Set(initialSelections));
        setCustomInput("");
      } else {
        setCheckedOptions(new Set());
        setCustomInput("");
      }
      setSelectedIndex(0);
      setIsEditing(false);
      containerRef.current?.focus();
    },
    [initialSelections, stepAnswers],
  );

  useEffect(() => {
    restoreStepAnswer(activeStep);
  }, [activeStep, restoreStepAnswer]);

  useEffect(() => {
    if (selectedOption && needsCustomInput(selectedOption)) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [selectedOption]);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : numOptions - 1));
  }, [numOptions]);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < numOptions - 1 ? prev + 1 : 0));
  }, [numOptions]);

  const moveToPrevStep = useCallback(() => {
    if (!hasSteps) return;
    saveCurrentStepAnswer();
    const prevStep = activeStep > 0 ? activeStep - 1 : numSteps - 1;
    setStep(prevStep);
  }, [hasSteps, activeStep, numSteps, saveCurrentStepAnswer, setStep]);

  const moveToNextStep = useCallback(() => {
    if (!hasSteps) return;
    saveCurrentStepAnswer();
    const nextStep = activeStep < numSteps - 1 ? activeStep + 1 : 0;
    setStep(nextStep);
  }, [hasSteps, activeStep, numSteps, saveCurrentStepAnswer, setStep]);

  const toggleCheck = useCallback(
    (optionId: string) => {
      setCheckedOptions((prev) => {
        const next = new Set(prev);
        if (multiSelect) {
          if (next.has(optionId)) {
            next.delete(optionId);
          } else {
            next.add(optionId);
          }
        } else {
          next.clear();
          next.add(optionId);
        }
        return next;
      });
    },
    [multiSelect],
  );

  const handleSubmitMulti = useCallback(() => {
    const ids = Array.from(checkedOptions);
    if (ids.length === 0) return;
    const hasOther = ids.some(isOtherOption);
    const filteredIds = filterOtherOptions(ids);
    if (hasOther && customInput.trim()) {
      onMultiSelect?.(filteredIds, customInput.trim());
    } else {
      onMultiSelect?.(filteredIds);
    }
  }, [checkedOptions, customInput, onMultiSelect]);

  const handleSubmitSingle = useCallback(() => {
    const checkedId = Array.from(checkedOptions)[0];
    if (!checkedId) return;
    if (isOtherOption(checkedId) && customInput.trim()) {
      onSelect(checkedId, customInput.trim());
    } else {
      onSelect(checkedId);
    }
  }, [checkedOptions, customInput, onSelect]);

  const selectCurrent = useCallback(() => {
    const selected = allOptions[selectedIndex];

    if (isSubmitOption(selected.id)) {
      if (!showSubmitButton) {
        onSelect(selected.id);
        return;
      }
      if (hasSteps && activeStep < numSteps - 1) {
        saveCurrentStepAnswer();
        setStep(activeStep + 1);
      } else {
        if (multiSelect) {
          handleSubmitMulti();
        } else {
          handleSubmitSingle();
        }
      }
      return;
    }

    if (showSubmitButton) {
      toggleCheck(selected.id);
    } else if (needsCustomInput(selected)) {
      if (customInput.trim()) {
        onSelect(selected.id, customInput.trim());
      }
    } else {
      onSelect(selected.id);
    }
  }, [
    allOptions,
    selectedIndex,
    hasSteps,
    activeStep,
    numSteps,
    multiSelect,
    handleSubmitMulti,
    handleSubmitSingle,
    showSubmitButton,
    toggleCheck,
    customInput,
    onSelect,
    saveCurrentStepAnswer,
    setStep,
  ]);

  const selectByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= allOptions.length) return;
      const selected = allOptions[index];
      setSelectedIndex(index);

      if (isSubmitOption(selected.id)) {
        if (!showSubmitButton) {
          onSelect(selected.id);
          return;
        }
        if (hasSteps && activeStep < numSteps - 1) {
          saveCurrentStepAnswer();
          setStep(activeStep + 1);
        } else {
          if (multiSelect) {
            handleSubmitMulti();
          } else {
            handleSubmitSingle();
          }
        }
        return;
      }

      if (showSubmitButton) {
        toggleCheck(selected.id);
      } else if (needsCustomInput(selected)) {
        setIsEditing(true);
      } else {
        onSelect(selected.id);
      }
    },
    [
      allOptions,
      hasSteps,
      activeStep,
      numSteps,
      multiSelect,
      handleSubmitMulti,
      handleSubmitSingle,
      showSubmitButton,
      toggleCheck,
      onSelect,
      saveCurrentStepAnswer,
      setStep,
    ],
  );

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      saveCurrentStepAnswer();
      setStep(stepIndex);
    },
    [saveCurrentStepAnswer, setStep],
  );

  const handleEscape = useCallback(() => {
    setCustomInput("");
    setIsEditing(false);
    containerRef.current?.focus();
  }, []);

  const handleCustomInputChange = useCallback(
    (value: string) => {
      setCustomInput(value);
      if (
        value.trim() &&
        showSubmitButton &&
        selectedOption &&
        needsCustomInput(selectedOption)
      ) {
        setCheckedOptions((prev) => {
          if (prev.has(selectedOption.id)) return prev;
          const next = new Set(prev);
          next.add(selectedOption.id);
          return next;
        });
      }
    },
    [showSubmitButton, selectedOption],
  );

  const ensureChecked = useCallback((optionId: string) => {
    setCheckedOptions((prev) => {
      if (prev.has(optionId)) return prev;
      const next = new Set(prev);
      next.add(optionId);
      return next;
    });
  }, []);

  const handleInlineSubmit = useCallback(() => {
    if (!selectedOption) return;
    if (showSubmitButton) {
      ensureChecked(selectedOption.id);
      containerRef.current?.focus();
      moveDown();
    } else if (customInput.trim()) {
      onSelect(selectedOption.id, customInput.trim());
    }
  }, [
    showSubmitButton,
    ensureChecked,
    selectedOption,
    customInput,
    onSelect,
    moveDown,
  ]);

  const handleNavigateUp = useCallback(() => {
    if (
      selectedOption &&
      needsCustomInput(selectedOption) &&
      customInput.trim() &&
      showSubmitButton
    ) {
      ensureChecked(selectedOption.id);
    }
    containerRef.current?.focus();
    moveUp();
  }, [moveUp, selectedOption, customInput, showSubmitButton, ensureChecked]);

  const handleNavigateDown = useCallback(() => {
    if (
      selectedOption &&
      needsCustomInput(selectedOption) &&
      customInput.trim() &&
      showSubmitButton
    ) {
      ensureChecked(selectedOption.id);
    }
    containerRef.current?.focus();
    moveDown();
  }, [moveDown, selectedOption, customInput, showSubmitButton, ensureChecked]);

  return {
    selectedIndex,
    setSelectedIndex,
    checkedOptions,
    customInput,
    setCustomInput: handleCustomInputChange,
    isEditing,
    activeStep,
    stepAnswers,
    containerRef,
    hasSteps,
    numSteps,
    showSubmitButton,
    allOptions,
    selectedOption,
    showInlineEdit,
    moveUp,
    moveDown,
    moveToPrevStep,
    moveToNextStep,
    selectCurrent,
    selectByIndex,
    handleStepClick,
    handleEscape,
    handleInlineSubmit,
    handleNavigateUp,
    handleNavigateDown,
    handleSubmitMulti,
    handleSubmitSingle,
  };
}
