interface QuoteProps extends React.ComponentPropsWithoutRef<"q"> {}

export function Quote({ className = "", ...props }: QuoteProps) {
  return (
    <q className={`text-body text-fg/80 italic ${className}`} {...props} />
  );
}
