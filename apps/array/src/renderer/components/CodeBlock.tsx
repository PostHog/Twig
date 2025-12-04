import type { ReactNode } from "react";

type CodeBlockSize = "1" | "1.5" | "2" | "3";

interface CodeBlockProps {
  children: ReactNode;
  size?: CodeBlockSize;
}

const sizeStyles: Record<
  CodeBlockSize,
  { fontSize: string; lineHeight: string }
> = {
  "1": {
    fontSize: "var(--font-size-1)",
    lineHeight: "var(--line-height-1)",
  },
  "1.5": {
    fontSize: "var(--font-size-1-5)",
    lineHeight: "var(--line-height-1-5)",
  },
  "2": {
    fontSize: "var(--font-size-2)",
    lineHeight: "var(--line-height-2)",
  },
  "3": {
    fontSize: "var(--font-size-3)",
    lineHeight: "var(--line-height-3)",
  },
};

export function CodeBlock({ children, size = "1" }: CodeBlockProps) {
  const styles = sizeStyles[size];

  return (
    <pre
      style={{
        margin: 0,
        marginBottom: "var(--space-3)",
        padding: "var(--space-3)",
        backgroundColor: "var(--gray-2)",
        borderRadius: "var(--radius-2)",
        border: "1px solid var(--gray-4)",
        fontFamily: "var(--code-font-family)",
        fontSize: styles.fontSize,
        lineHeight: styles.lineHeight,
        color: "var(--gray-12)",
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}
