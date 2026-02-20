import { useCallback, useEffect, useRef } from "react";

interface InlineEditableTextProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onEscape: () => void;
  onSubmit: () => void;
}

export function InlineEditableText({
  value,
  placeholder,
  onChange,
  onNavigateUp,
  onNavigateDown,
  onEscape,
  onSubmit,
}: InlineEditableTextProps) {
  const nativeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nativeInputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    <input
      ref={nativeInputRef}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      className="text-gray-12 placeholder:text-gray-10"
      style={{
        all: "unset",
        fontSize: "var(--font-size-1)",
        lineHeight: "var(--line-height-1)",
        fontWeight: 500,
        minWidth: "200px",
        display: "inline-block",
      }}
    />
  );
}
