import { Box, Text } from "@radix-ui/themes";
import { useCallback, useEffect } from "react";

interface InlineEditableTextProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onEscape: () => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLSpanElement | null>;
}

export function InlineEditableText({
  value,
  placeholder,
  onChange,
  onNavigateUp,
  onNavigateDown,
  onEscape,
  onSubmit,
  inputRef,
}: InlineEditableTextProps) {
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.textContent = value || "";
      inputRef.current.focus();
      if (value) {
        const range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [inputRef, value]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      const text = e.currentTarget.textContent ?? "";
      onChange(text);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigateUp();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        onNavigateDown();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onNavigateUp, onNavigateDown, onEscape, onSubmit],
  );

  return (
    <Box
      style={{
        display: "inline-grid",
        minWidth: "200px",
      }}
    >
      {!value && (
        <Text
          size="1"
          weight="medium"
          className="text-gray-10"
          style={{
            gridRow: 1,
            gridColumn: 1,
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {placeholder}
        </Text>
      )}
      <Text
        asChild
        size="1"
        weight="medium"
        className={value ? "text-gray-12" : ""}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: contentEditable span needed for inline editing UX */}
        <span
          ref={inputRef}
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          onClick={(e) => e.stopPropagation()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          style={{
            gridRow: 1,
            gridColumn: 1,
            outline: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        />
      </Text>
    </Box>
  );
}
