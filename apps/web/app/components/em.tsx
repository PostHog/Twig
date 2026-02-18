interface EmProps extends React.ComponentPropsWithoutRef<"em"> {}

export function Em({ className = "", ...props }: EmProps) {
  return <em className={`italic ${className}`} {...props} />;
}
