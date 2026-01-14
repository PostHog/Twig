import type { ReactNode } from "react";

type ListSize = "1" | "1.5" | "2" | "3";

interface ListProps {
  children: ReactNode;
  size?: ListSize;
  as?: "ul" | "ol";
}

interface ListItemProps {
  children: ReactNode;
  size?: ListSize;
}

const sizeStyles: Record<
  ListSize,
  { fontSize: string; lineHeight: string; spacing: string }
> = {
  "1": {
    fontSize: "var(--font-size-1)",
    lineHeight: "var(--line-height-1)",
    spacing: "var(--space-1)",
  },
  "1.5": {
    fontSize: "var(--font-size-1-5)",
    lineHeight: "var(--line-height-1-5)",
    spacing: "var(--space-1)",
  },
  "2": {
    fontSize: "var(--font-size-2)",
    lineHeight: "var(--line-height-2)",
    spacing: "var(--space-1)",
  },
  "3": {
    fontSize: "var(--font-size-3)",
    lineHeight: "var(--line-height-3)",
    spacing: "var(--space-2)",
  },
};

export function List({ children, as = "ul" }: ListProps) {
  const Component = as;

  return (
    <Component
      className="marker:text-[var(--accent-10)]"
      style={{
        margin: 0,
        marginTop: "var(--space-2)",
        paddingLeft: as === "ol" ? "var(--space-5)" : "var(--space-4)",
        marginBottom: "var(--space-3)",
        listStyleType: as === "ol" ? "decimal" : "disc",
        listStylePosition: "outside",
      }}
    >
      {children}
    </Component>
  );
}

export function ListItem({ children, size = "2" }: ListItemProps) {
  const styles = sizeStyles[size];

  return (
    <li
      style={{
        fontSize: styles.fontSize,
        lineHeight: styles.lineHeight,
        marginBottom: styles.spacing,
        color: "var(--gray-12)",
      }}
    >
      {children}
    </li>
  );
}
