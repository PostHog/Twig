import { Box, Flex, Text } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export interface PermissionOption {
  optionId: string;
  name: string;
  description?: string;
  kind: string;
}

interface InlinePermissionSelectorProps {
  title: string;
  options: PermissionOption[];
  onSelect: (optionId: string, customInput?: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export function InlinePermissionSelector({
  title,
  options,
  onSelect,
  onCancel,
  disabled = false,
}: InlinePermissionSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCustomInputMode, setIsCustomInputMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Add "Type feedback" as the last option
  const allOptions = [
    ...options,
    { optionId: "_custom", name: "Type feedback", description: "", kind: "custom" },
  ];

  const numOptions = allOptions.length;

  // Focus custom input when entering that mode
  useEffect(() => {
    if (isCustomInputMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCustomInputMode]);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : numOptions - 1));
  }, [numOptions]);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < numOptions - 1 ? prev + 1 : 0));
  }, [numOptions]);

  const selectCurrent = useCallback(() => {
    const selected = allOptions[selectedIndex];
    if (selected.optionId === "_custom") {
      setIsCustomInputMode(true);
    } else {
      onSelect(selected.optionId);
    }
  }, [allOptions, selectedIndex, onSelect]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // Keyboard navigation using useHotkeys
  const isEnabled = !disabled && !isCustomInputMode;

  const moveUpWithLog = useCallback(() => {
    console.log("[InlinePermissionSelector] moveUp triggered");
    moveUp();
  }, [moveUp]);

  const moveDownWithLog = useCallback(() => {
    console.log("[InlinePermissionSelector] moveDown triggered");
    moveDown();
  }, [moveDown]);

  const selectCurrentWithLog = useCallback(() => {
    console.log("[InlinePermissionSelector] selectCurrent triggered");
    selectCurrent();
  }, [selectCurrent]);

  useHotkeys("up", moveUpWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveUpWithLog, isEnabled]);
  useHotkeys("down", moveDownWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDownWithLog, isEnabled]);
  useHotkeys("left", moveUpWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveUpWithLog, isEnabled]);
  useHotkeys("right", moveDownWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDownWithLog, isEnabled]);
  useHotkeys("tab", moveDownWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDownWithLog, isEnabled]);
  useHotkeys("enter", selectCurrentWithLog, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [selectCurrentWithLog, isEnabled]);
  useHotkeys("escape", handleCancel, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [handleCancel, isEnabled]);

  // Debug: log when component renders with enabled state
  useEffect(() => {
    console.log("[InlinePermissionSelector] Mounted/updated, isEnabled:", isEnabled, "disabled:", disabled, "isCustomInputMode:", isCustomInputMode);
  }, [isEnabled, disabled, isCustomInputMode]);

  const handleCustomInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsCustomInputMode(false);
        setCustomInput("");
      } else if (e.key === "Enter" && customInput.trim()) {
        e.preventDefault();
        const keepPlanningOption = options.find((o) => o.kind === "reject_once");
        if (keepPlanningOption) {
          onSelect(keepPlanningOption.optionId, customInput.trim());
        }
      }
    },
    [customInput, options, onSelect],
  );

  const handleOptionClick = (index: number) => {
    if (disabled) return;
    const opt = allOptions[index];
    if (opt.optionId === "_custom") {
      setSelectedIndex(index);
      setIsCustomInputMode(true);
    } else {
      onSelect(opt.optionId);
    }
  };

  return (
    <Box className="border-t border-gray-6 bg-gray-2 px-4 py-3">
      {/* Question/Title */}
      <Text size="2" weight="medium" className="text-amber-11 mb-2 block">
        {title}
      </Text>

      {/* Options - single line each */}
      <Flex direction="column" gap="1">
        {allOptions.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCustom = option.optionId === "_custom";

          if (isCustom && isCustomInputMode) {
            return (
              <Flex key={option.optionId} align="center" gap="2" className="py-1">
                <Text size="2" className="text-green-9">›</Text>
                <input
                  ref={inputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={handleCustomInputKeyDown}
                  placeholder="Type your feedback and press Enter..."
                  className="flex-1 bg-transparent border-none text-sm text-gray-12 outline-none placeholder:text-gray-9"
                  disabled={disabled}
                />
              </Flex>
            );
          }

          return (
            <Flex
              key={option.optionId}
              align="center"
              gap="2"
              className={`cursor-pointer py-1 ${isSelected ? "text-gray-12" : "text-gray-10"}`}
              onClick={() => handleOptionClick(index)}
            >
              <Text size="2" className={isSelected ? "text-green-9" : "text-gray-8"}>
                {isSelected ? "›" : " "}
              </Text>
              <Text size="2">
                [{isSelected ? "✓" : " "}] {option.name}
              </Text>
            </Flex>
          );
        })}
      </Flex>

      {/* Keyboard hints */}
      <Text size="1" className="text-gray-9 mt-2 block">
        Enter to select · Arrow keys to navigate · Esc to cancel
      </Text>
    </Box>
  );
}
