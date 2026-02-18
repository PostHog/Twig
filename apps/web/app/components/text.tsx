import { Slot } from "@radix-ui/react-slot";

type TextSize = "body" | "body-sm" | "caption" | "code";

interface TextProps extends React.ComponentPropsWithoutRef<"p"> {
  asChild?: boolean;
  size?: TextSize;
  as?: "p" | "span" | "div" | "label";
}

const sizeClasses: Record<TextSize, string> = {
  body: "text-body",
  "body-sm": "text-body-sm",
  caption: "text-caption",
  code: "text-code",
};

export function Text({
  asChild,
  size = "body",
  as: Tag = "p",
  className = "",
  ...props
}: TextProps) {
  const Component = asChild ? Slot : Tag;
  return (
    <Component className={`${sizeClasses[size]} ${className}`} {...props} />
  );
}
