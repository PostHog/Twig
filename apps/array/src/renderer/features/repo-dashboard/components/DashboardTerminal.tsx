import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import {
  CaretDownIcon,
  CaretRightIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";

interface DashboardTerminalProps {
  repoPath: string;
}

export function DashboardTerminal({ repoPath }: DashboardTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Box
      style={{
        borderTop: "1px solid var(--gray-5)",
        backgroundColor: "var(--gray-1)",
      }}
    >
      <Button
        variant="ghost"
        size="1"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ width: "100%", justifyContent: "flex-start" }}
      >
        <Flex align="center" gap="2" p="1">
          {isExpanded ? (
            <CaretDownIcon size={12} />
          ) : (
            <CaretRightIcon size={12} />
          )}
          <TerminalIcon size={14} />
          <Text size="1" weight="medium">
            Terminal
          </Text>
        </Flex>
      </Button>

      {isExpanded && (
        <Box style={{ height: "300px" }}>
          <ShellTerminal cwd={repoPath} stateKey={`dashboard-${repoPath}`} />
        </Box>
      )}
    </Box>
  );
}
