import { Slot } from "@radix-ui/react-slot";

type HeadingLevel = 1 | 2 | 3 | 4;

interface HeadingProps extends React.ComponentPropsWithoutRef<"h1"> {
  asChild?: boolean;
  level?: HeadingLevel;
}

const levelClasses: Record<HeadingLevel, string> = {
  1: "text-heading-1",
  2: "text-heading-2",
  3: "text-heading-3",
  4: "text-heading-4",
};

export function Heading({
  asChild,
  level = 2,
  className = "",
  ...props
}: HeadingProps) {
  const Tag = `h${level}` as const;
  const Component = asChild ? Slot : Tag;
  return (
    <Component
      className={`font-heading ${levelClasses[level]} ${className}`}
      {...props}
    />
  );
}
