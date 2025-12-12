import type { Plan } from "@agentclientprotocol/sdk";
import { CheckCircle, Circle, Spinner, XCircle } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

interface PlanViewProps {
  plan: Plan;
}

export function PlanView({ plan }: PlanViewProps) {
  if (!plan.entries.length) return null;

  return (
    <Box className="rounded border border-gray-6 bg-gray-2 p-3">
      <Text size="1" weight="medium" color="gray" className="mb-2 block">
        Plan
      </Text>
      <Flex direction="column" gap="1">
        {plan.entries.map((entry) => (
          <Flex key={entry.content} align="center" gap="2">
            <StatusIcon status={entry.status} />
            <Text
              size="2"
              color={entry.status === "completed" ? "gray" : undefined}
            >
              {entry.content}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={14} className="text-green-9" />;
    case "in_progress":
      return <Spinner size={14} className="animate-spin text-blue-9" />;
    case "failed":
      return <XCircle size={14} className="text-red-9" />;
    default:
      return <Circle size={14} className="text-gray-8" />;
  }
}
