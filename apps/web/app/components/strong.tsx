interface StrongProps extends React.ComponentPropsWithoutRef<"strong"> {}

export function Strong({ className = "", ...props }: StrongProps) {
  return <strong className={`font-semibold ${className}`} {...props} />;
}
