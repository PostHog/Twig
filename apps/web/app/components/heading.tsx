import { Slot } from "@radix-ui/react-slot";

type HeadingSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps extends React.ComponentPropsWithoutRef<"h1"> {
  asChild?: boolean;
  level?: HeadingLevel;
  size?: HeadingSize;
}

const sizeClasses: Record<HeadingSize, string> = {
  1: "text-heading-1",
  2: "text-heading-2",
  3: "text-heading-3",
  4: "text-heading-4",
  5: "text-heading-5",
  6: "text-heading-6",
  7: "text-heading-7",
  8: "text-heading-8",
  9: "text-heading-9",
  10: "text-heading-10",
};

const defaultSizeForLevel: Record<HeadingLevel, HeadingSize> = {
  1: 2,
  2: 4,
  3: 6,
  4: 7,
  5: 8,
  6: 9,
};

export function Heading({
  asChild,
  level = 2,
  size,
  className = "",
  ...props
}: HeadingProps) {
  const Tag = `h${level}` as const;
  const Component = asChild ? Slot : Tag;
  const effectiveSize = size ?? defaultSizeForLevel[level];
  return (
    <Component
      className={`font-family-heading ${sizeClasses[effectiveSize]} ${className}`}
      {...props}
    />
  );
}
