import type { Plan } from "@features/sessions/types";
import { CheckCircle, Circle, Spinner, XCircle } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

interface PlanViewProps {
  plan: Plan;
}

export function PlanView({ plan }: PlanViewProps) {
  if (!plan.entries || plan.entries.length === 0) return null;

  return (
    <Box className="my-3 rounded-lg border-2 border-blue-6 bg-blue-2 p-4">
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium" className="text-blue-12">
          Implementation Plan
        </Text>
        <Flex direction="column" gap="1">
          {plan.entries.map((entry, index) => (
            <Flex key={`${entry.content}-${index}`} align="start" gap="2">
              <Box className="pt-0.5">
                <StatusIcon status={entry.status} />
              </Box>
              <Text
                size="2"
                className={
                  entry.status === "completed"
                    ? "text-blue-11 line-through"
                    : "text-blue-12"
                }
              >
                {entry.content}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Flex>
    </Box>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={16} weight="fill" className="text-blue-9" />;
    case "in_progress":
      return <Spinner size={16} className="animate-spin text-blue-10" />;
    case "failed":
      return <XCircle size={16} className="text-red-9" />;
    default:
      return <Circle size={16} className="text-blue-8" />;
  }
}
