type DividerSize = "1" | "2" | "3";

interface DividerProps {
  size?: DividerSize;
}

const sizeStyles: Record<DividerSize, { marginY: string }> = {
  "1": { marginY: "var(--space-2)" },
  "2": { marginY: "var(--space-3)" },
  "3": { marginY: "var(--space-4)" },
};

export function Divider({ size = "2" }: DividerProps) {
  const styles = sizeStyles[size];

  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--gray-6)",
        marginTop: styles.marginY,
        marginBottom: styles.marginY,
      }}
    />
  );
}
