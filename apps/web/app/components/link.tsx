import NextLink from "next/link";

interface LinkProps extends React.ComponentPropsWithoutRef<typeof NextLink> {}

export function Link({ className = "", ...props }: LinkProps) {
  return (
    <NextLink
      className={`text-primary underline underline-offset-2 transition-colors hover:text-primary/80 ${className}`}
      {...props}
    />
  );
}
