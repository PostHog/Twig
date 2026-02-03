import type React from "react";

interface KeyHintProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function KeyHint({ children, style }: KeyHintProps) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "11px",
        fontFamily: "inherit",
        color: "var(--gray-11)",
        ...style,
      }}
    >
      {children}
    </kbd>
  );
}
