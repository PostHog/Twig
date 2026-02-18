interface KbdProps extends React.ComponentPropsWithoutRef<"kbd"> {}

export function Kbd({ className = "", ...props }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center rounded border border-fg/20 bg-fg/5 px-1.5 py-0.5 text-caption ${className}`}
      {...props}
    />
  );
}
