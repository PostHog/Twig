import { Box, Flex, Text } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { useCallback, useEffect, useRef } from "react";
import { OptionRow } from "./OptionRow";
import { StepTabs } from "./StepTabs";
import type { ActionSelectorProps } from "./types";
import { useActionSelectorState } from "./useActionSelectorState";

export function ActionSelector({
  title,
  pendingAction,
  question,
  options,
  multiSelect = false,
  allowCustomInput = false,
  customInputPlaceholder = "Type your answer...",
  currentStep = 0,
  steps,
  initialSelections,
  hideSubmitButton = false,
  onSelect,
  onMultiSelect,
  onCancel,
  onStepChange,
  onStepAnswer,
}: ActionSelectorProps) {
  const state = useActionSelectorState({
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
  });

  const {
    selectedIndex,
    setSelectedIndex,
    checkedOptions,
    customInput,
    setCustomInput,
    activeStep,
    stepAnswers,
    containerRef,
    hasSteps,
    numSteps,
    showSubmitButton,
    allOptions,
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
  } = state;

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const handlersRef = useRef({
    moveUp,
    moveDown,
    moveToPrevStep,
    moveToNextStep,
    selectCurrent,
    handleSubmitMulti,
    handleSubmitSingle,
    handleCancel,
    selectByIndex,
  });
  handlersRef.current = {
    moveUp,
    moveDown,
    moveToPrevStep,
    moveToNextStep,
    selectCurrent,
    handleSubmitMulti,
    handleSubmitSingle,
    handleCancel,
    selectByIndex,
  };

  const stateRef = useRef({
    showInlineEdit,
    hasSteps,
    showSubmitButton,
    multiSelect,
  });
  stateRef.current = {
    showInlineEdit,
    hasSteps,
    showSubmitButton,
    multiSelect,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { showInlineEdit, hasSteps, showSubmitButton, multiSelect } =
        stateRef.current;
      const h = handlersRef.current;

      if (showInlineEdit) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          h.moveUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          h.moveDown();
          break;
        case "ArrowLeft":
          if (hasSteps) {
            e.preventDefault();
            e.stopPropagation();
            h.moveToPrevStep();
          }
          break;
        case "ArrowRight":
          if (hasSteps) {
            e.preventDefault();
            e.stopPropagation();
            h.moveToNextStep();
          }
          break;
        case "Tab":
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            hasSteps ? h.moveToPrevStep() : h.moveUp();
          } else {
            hasSteps ? h.moveToNextStep() : h.moveDown();
          }
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey && showSubmitButton) {
            multiSelect ? h.handleSubmitMulti() : h.handleSubmitSingle();
          } else {
            h.selectCurrent();
          }
          break;
        case " ":
          if (showSubmitButton) {
            e.preventDefault();
            e.stopPropagation();
            h.selectCurrent();
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          h.handleCancel();
          break;
        default:
          if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            h.selectByIndex(Number.parseInt(e.key, 10) - 1);
          }
          break;
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () =>
      document.removeEventListener("keydown", handler, { capture: true });
  }, []);

  const getSubmitLabel = () => {
    return hasSteps && activeStep < numSteps - 1 ? "Next" : "Submit";
  };

  return (
    <Box
      ref={containerRef}
      tabIndex={0}
      p="3"
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement) {
          return;
        }
        containerRef.current?.focus();
      }}
      style={{
        outline: "none",
        border: "1px solid var(--blue-11)",
        background: "var(--blue-1)",
        borderRadius: "var(--radius-3)",
      }}
    >
      <Flex direction="column" gap="2">
        {hasSteps && steps && (
          <StepTabs
            steps={steps}
            activeStep={activeStep}
            stepAnswers={stepAnswers}
            onStepClick={handleStepClick}
          />
        )}

        {title && (
          <Text size="1" weight="medium" className="text-blue-11" title={title}>
            {compactHomePath(title)}
          </Text>
        )}

        {pendingAction && <Box>{pendingAction}</Box>}

        <Box>
          <Text size="1" mb="2" as="p">
            {question}
          </Text>

          <Flex direction="column" gap="1">
            {allOptions.map((option, index) => {
              const isSelected = selectedIndex === index;
              const isChecked = checkedOptions.has(option.id);

              return (
                <OptionRow
                  key={option.id}
                  option={option}
                  index={index}
                  isSelected={isSelected}
                  isChecked={isChecked}
                  showCheckbox={showSubmitButton}
                  customInput={customInput}
                  customInputPlaceholder={customInputPlaceholder}
                  isEditing={showInlineEdit && isSelected}
                  submitLabel={getSubmitLabel()}
                  onCustomInputChange={setCustomInput}
                  onNavigateUp={handleNavigateUp}
                  onNavigateDown={handleNavigateDown}
                  onEscape={handleEscape}
                  onInlineSubmit={handleInlineSubmit}
                  onClick={() => selectByIndex(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              );
            })}
          </Flex>

          <Text size="1" color="gray" mt="2" as="p">
            Enter to select · Tab/Arrow keys to navigate · Esc to cancel
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
