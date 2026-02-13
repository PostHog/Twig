import { Text } from "@radix-ui/themes";
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
      inputRef.current.textContent = value || placeholder;
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
  }, [inputRef, placeholder, value]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      const text = e.currentTarget.textContent ?? "";
      onChange(text);
      if (!text && inputRef.current) {
        inputRef.current.textContent = placeholder;
        const range = document.createRange();
        range.setStart(inputRef.current, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    },
    [onChange, placeholder, inputRef],
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
      } else if (!value && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.currentTarget.textContent = e.key;
        onChange(e.key);
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    },
    [value, onChange, onNavigateUp, onNavigateDown, onEscape, onSubmit],
  );

  return (
    <Text
      asChild
      size="1"
      weight="medium"
      className={value ? "text-gray-12" : "text-gray-10"}
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
          outline: "none",
          minWidth: "200px",
          display: "inline-block",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
    </Text>
  );
}
