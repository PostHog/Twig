import { Warning } from "@phosphor-icons/react";
import { Box, Button, Callout, Flex, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";

const log = logger.scope("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional name to identify which boundary caught the error */
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error("Error caught by boundary", {
      name: this.props.name,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box p="4">
          <Callout.Root color="red" size="2">
            <Callout.Icon>
              <Warning weight="fill" />
            </Callout.Icon>
            <Callout.Text>
              <Flex direction="column" gap="2">
                <Text weight="medium">Something went wrong</Text>
                <Text size="1" className="text-gray-11">
                  {this.state.error?.message || "An unexpected error occurred"}
                </Text>
                <Flex gap="2" mt="2">
                  <Button size="1" variant="soft" onClick={this.handleRetry}>
                    Try again
                  </Button>
                </Flex>
              </Flex>
            </Callout.Text>
          </Callout.Root>
        </Box>
      );
    }

    return this.props.children;
  }
}
