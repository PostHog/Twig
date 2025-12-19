import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { toast } from "@utils/toast";
import type { ReactNode } from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

function DefaultFallback({ onReset }: { onReset: () => void }) {
  return (
    <Flex align="center" justify="center" minHeight="100vh" p="4">
      <Card size="3" style={{ maxWidth: 400 }}>
        <Flex direction="column" align="center" gap="4" p="4">
          <Text size="3" weight="bold" align="center">
            Something went wrong
          </Text>
          <Text size="2" color="gray" align="center">
            An unexpected error occurred. Please try again.
          </Text>
          <Button onClick={onReset} variant="soft">
            Try again
          </Button>
        </Flex>
      </Card>
    </Flex>
  );
}

export function ErrorBoundary({ children, fallback }: Props) {
  return (
    <ReactErrorBoundary
      fallbackRender={({ resetErrorBoundary }) =>
        fallback ?? <DefaultFallback onReset={resetErrorBoundary} />
      }
      onError={(error, info) => {
        logger.error("React error boundary caught error", {
          error: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
        });
        toast.error("Something went wrong", { description: error.message });
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
