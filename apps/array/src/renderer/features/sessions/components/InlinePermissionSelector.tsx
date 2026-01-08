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
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the container when component mounts to capture keyboard events
  useEffect(() => {
    if (!disabled && containerRef.current) {
      containerRef.current.focus();
    }
  }, [disabled]);

  // Filter to only show: allow_always (Accept All), allow_once (Accept), and custom input
  // The custom input uses reject_once under the hood to send feedback
  const filteredOptions = options.filter(
    (o) => o.kind === "allow_always" || o.kind === "allow_once",
  );
  const allOptions = [
    ...filteredOptions,
    { optionId: "_custom", name: "Other", description: "", kind: "custom" },
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

  useHotkeys("up", moveUp, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveUp, isEnabled]);
  useHotkeys("down", moveDown, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDown, isEnabled]);
  useHotkeys("left", moveUp, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveUp, isEnabled]);
  useHotkeys("right", moveDown, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDown, isEnabled]);
  useHotkeys("tab", moveDown, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [moveDown, isEnabled]);
  useHotkeys("enter", selectCurrent, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [selectCurrent, isEnabled]);
  useHotkeys("escape", handleCancel, { enabled: isEnabled, enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }, [handleCancel, isEnabled]);

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
    <Box
      ref={containerRef}
      tabIndex={0}
      className="border-t border-gray-6 bg-gray-2 px-4 py-3 outline-none"
    >
      {/* Question/Title */}
      <Text size="1" weight="medium" className="text-amber-11 mb-2 block">
        {title}
      </Text>

      {/* Options - single line each */}
      <Flex direction="column" gap="1">
        {allOptions.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCustom = option.optionId === "_custom";

          if (isCustom && isCustomInputMode) {
            return (
              <Flex key={option.optionId} align="center" gap="2" className="py-0.5">
                <span className="inline-block w-3 text-xs text-green-9">›</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={handleCustomInputKeyDown}
                  placeholder="Type your feedback and press Enter..."
                  className="flex-1 bg-transparent border-none text-xs text-gray-12 outline-none placeholder:text-gray-9"
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
              className={`cursor-pointer py-0.5 ${isSelected ? "text-gray-12" : "text-gray-10"}`}
              onClick={() => handleOptionClick(index)}
            >
              <span className={`inline-block w-3 text-xs ${isSelected ? "text-green-9" : "text-transparent"}`}>
                ›
              </span>
              <Text size="1">{option.name}</Text>
            </Flex>
          );
        })}
      </Flex>

      {/* Keyboard hints */}
      <Text size="1" className="text-gray-9 mt-1 block">
        Enter to select · ↑↓ to navigate · Esc to cancel
      </Text>
    </Box>
  );
}
