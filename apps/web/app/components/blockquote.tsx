interface BlockquoteProps
  extends React.ComponentPropsWithoutRef<"blockquote"> {}

export function Blockquote({ className = "", ...props }: BlockquoteProps) {
  return (
    <blockquote
      className={`border-primary border-l-2 pl-4 text-body text-fg/80 italic ${className}`}
      {...props}
    />
  );
}
