interface CodeProps extends React.ComponentPropsWithoutRef<"code"> {}

export function Code({ className = "", ...props }: CodeProps) {
  return (
    <code
      className={`rounded bg-fg/10 px-1.5 py-0.5 text-code ${className}`}
      {...props}
    />
  );
}
