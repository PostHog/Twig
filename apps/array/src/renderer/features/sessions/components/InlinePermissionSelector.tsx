import { Box, Flex, Text } from "@radix-ui/themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the container when component mounts to capture keyboard events
  useEffect(() => {
    if (!disabled && containerRef.current) {
      containerRef.current.focus();
    }
  }, [disabled]);

  // Filter to only show: allow_always (Accept All), allow_once (Accept), and custom input
  // The custom input uses reject_once under the hood to send feedback
  // Only add "Other" if there's a reject_once option available for custom feedback
  const allOptions = useMemo(() => {
    const filteredOptions = options.filter(
      (o) => o.kind === "allow_always" || o.kind === "allow_once",
    );
    // Check if there's already an "Other" option or if we have reject_once for custom input
    const hasOtherOption = filteredOptions.some(
      (o) => o.name.toLowerCase() === "other",
    );
    const hasRejectOnce = options.some((o) => o.kind === "reject_once");

    // Only add custom "Other" if there isn't one already AND we have reject_once available
    if (!hasOtherOption && hasRejectOnce) {
      return [
        ...filteredOptions,
        { optionId: "_custom", name: "Other", description: "", kind: "custom" },
      ];
    }
    return filteredOptions;
  }, [options]);

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

  // Check if an option is a custom input option (either "_custom" or "other")
  const isCustomOption = useCallback((optionId: string) => {
    return optionId === "_custom" || optionId === "other";
  }, []);

  const selectCurrent = useCallback(() => {
    const selected = allOptions[selectedIndex];
    if (isCustomOption(selected.optionId)) {
      setIsCustomInputMode(true);
    } else {
      onSelect(selected.optionId);
    }
  }, [allOptions, selectedIndex, onSelect, isCustomOption]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // Keyboard navigation using useHotkeys
  const isEnabled = !disabled && !isCustomInputMode;

  useHotkeys(
    "up",
    moveUp,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [moveUp, isEnabled],
  );
  useHotkeys(
    "down",
    moveDown,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [moveDown, isEnabled],
  );
  useHotkeys(
    "left",
    moveUp,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [moveUp, isEnabled],
  );
  useHotkeys(
    "right",
    moveDown,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [moveDown, isEnabled],
  );
  useHotkeys(
    "tab",
    moveDown,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [moveDown, isEnabled],
  );
  useHotkeys(
    "enter",
    selectCurrent,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [selectCurrent, isEnabled],
  );
  useHotkeys(
    "escape",
    handleCancel,
    {
      enabled: isEnabled,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [handleCancel, isEnabled],
  );

  const handleCustomInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsCustomInputMode(false);
        setCustomInput("");
      } else if (e.key === "Enter" && customInput.trim()) {
        e.preventDefault();
        // First try to find the "other" option (for AskUserQuestion)
        const otherOption = options.find((o) => o.optionId === "other");
        if (otherOption) {
          onSelect(otherOption.optionId, customInput.trim());
          return;
        }
        // Fallback to reject_once for plan mode feedback
        const keepPlanningOption = options.find(
          (o) => o.kind === "reject_once",
        );
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
    if (isCustomOption(opt.optionId)) {
      setSelectedIndex(index);
      setIsCustomInputMode(true);
    } else {
      onSelect(opt.optionId);
    }
  };

  return (
    <Box
      ref={containerRef}
      tabIndex={0}
      className="border-gray-6 border-t bg-gray-2 px-3 py-2 outline-none"
    >
      {/* Question/Title */}
      <Text size="1" weight="medium" className="mb-1 block text-amber-11">
        {title}
      </Text>

      {/* Options - single line each */}
      <Flex direction="column" gap="1">
        {allOptions.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCustom = isCustomOption(option.optionId);

          if (isCustom && isCustomInputMode) {
            return (
              <Flex
                key={option.optionId}
                align="center"
                gap="1"
                className="py-0.5"
              >
                <span className="inline-block w-3 text-green-9 text-xs">›</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={handleCustomInputKeyDown}
                  placeholder="Type your response and press Enter..."
                  className="h-5 flex-1 border-none bg-transparent text-[12px] text-gray-12 leading-tight outline-none placeholder:text-gray-9"
                  disabled={disabled}
                />
              </Flex>
            );
          }

          return (
            <Flex
              key={option.optionId}
              align="center"
              gap="1"
              className={`cursor-pointer py-0.5 ${
                isSelected ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => handleOptionClick(index)}
            >
              <span
                className={`inline-block w-3 text-xs ${
                  isSelected ? "text-green-9" : "text-transparent"
                }`}
              >
                ›
              </span>
              <Text size="1">{option.name}</Text>
            </Flex>
          );
        })}
      </Flex>

      {/* Keyboard hints */}
      <Text size="1" className="mt-1 block text-gray-9">
        Enter to select · ↑↓ to navigate · Esc to cancel
      </Text>
    </Box>
  );
}
