import { Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import { useRef } from "react";
import { isOtherOption, isSubmitOption } from "./constants";
import { InlineEditableText } from "./InlineEditableText";
import type { SelectorOption } from "./types";

function needsCustomInput(option: SelectorOption): boolean {
  return option.customInput === true || isOtherOption(option.id);
}

function getPlaceholder(
  option: SelectorOption,
  customInputPlaceholder: string,
): string {
  if (option.customInput) {
    return "Type here to tell the agent what to do differently";
  }
  return customInputPlaceholder;
}

interface OptionRowProps {
  option: SelectorOption;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  showCheckbox: boolean;
  customInput: string;
  customInputPlaceholder: string;
  isEditing: boolean;
  submitLabel: string;
  onCustomInputChange: (value: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onEscape: () => void;
  onInlineSubmit: () => void;
  onClick: () => void;
  onMouseEnter: () => void;
}

export function OptionRow({
  option,
  index,
  isSelected,
  isChecked,
  showCheckbox,
  customInput,
  customInputPlaceholder,
  isEditing,
  submitLabel,
  onCustomInputChange,
  onNavigateUp,
  onNavigateDown,
  onEscape,
  onInlineSubmit,
  onClick,
  onMouseEnter,
}: OptionRowProps) {
  const inputRef = useRef<HTMLSpanElement>(null);

  if (isSubmitOption(option.id)) {
    return (
      <Flex
        align="center"
        gap="2"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        mt="2"
        py="1"
        px="2"
        style={{
          cursor: "pointer",
          borderRadius: "var(--radius-2)",
          background: isSelected ? "var(--blue-8)" : "var(--blue-3)",
          display: "inline-flex",
          width: "auto",
          alignSelf: "flex-start",
        }}
      >
        <Text
          size="1"
          weight="medium"
          className={isSelected ? "text-blue-12" : "text-gray-12"}
        >
          {submitLabel}
        </Text>
      </Flex>
    );
  }

  const showsCustomInput = needsCustomInput(option);
  const isCurrentlyEditing = isEditing && isSelected;

  const renderLabel = () => {
    if (isCurrentlyEditing && showsCustomInput) {
      return (
        <InlineEditableText
          value={customInput}
          placeholder={getPlaceholder(option, customInputPlaceholder)}
          onChange={onCustomInputChange}
          onNavigateUp={onNavigateUp}
          onNavigateDown={onNavigateDown}
          onEscape={onEscape}
          onSubmit={onInlineSubmit}
          inputRef={inputRef}
        />
      );
    }

    const displayText = showsCustomInput
      ? customInput || getPlaceholder(option, customInputPlaceholder)
      : option.label;

    const textClass =
      showsCustomInput && !customInput
        ? "text-gray-10"
        : isSelected
          ? "text-blue-11"
          : "text-gray-12";

    return (
      <Text size="1" weight="medium" className={textClass}>
        {displayText}
      </Text>
    );
  };

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{ cursor: "pointer" }}
    >
      <Flex align="center" gap="2">
        <Text
          size="1"
          className={isSelected ? "text-blue-11" : "text-gray-11"}
          style={{ width: "1ch" }}
        >
          {isSelected ? "›" : ""}
        </Text>
        <Text
          size="1"
          className={isSelected ? "text-blue-11" : "text-gray-11"}
          style={{
            minWidth: "16px",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {index + 1}.
        </Text>
        {showCheckbox && (
          <Checkbox
            size="1"
            color="green"
            checked={isChecked}
            style={{ pointerEvents: "none" }}
          />
        )}
        {renderLabel()}
      </Flex>
      {option.description && !isCurrentlyEditing && (
        <Text
          size="1"
          as="p"
          className="text-gray-11"
          style={{
            marginLeft: showCheckbox ? "64px" : "40px",
            marginTop: "2px",
          }}
        >
          {option.description}
        </Text>
      )}
    </Box>
  );
}
