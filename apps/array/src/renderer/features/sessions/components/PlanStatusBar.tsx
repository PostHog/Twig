import type { Plan } from "@features/sessions/types";
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Circle,
  Spinner,
  XCircle,
} from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo, useState } from "react";

interface PlanStatusBarProps {
  plan: Plan | null;
}

export function PlanStatusBar({ plan }: PlanStatusBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = useMemo(() => {
    if (!plan?.entries?.length) return null;

    const completed = plan.entries.filter(
      (e) => e.status === "completed",
    ).length;
    const total = plan.entries.length;
    const inProgress = plan.entries.find((e) => e.status === "in_progress");
    const allCompleted = completed === total;

    return { completed, total, inProgress, allCompleted };
  }, [plan]);

  // Hide if no plan or all tasks completed
  if (!stats || stats.allCompleted) return null;

  return (
    <Box
      className="cursor-pointer border-gray-4 border-t bg-gray-2"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <Flex align="center" gap="2" className="px-3 py-2">
        {isExpanded ? (
          <CaretDown size={12} className="text-gray-9" />
        ) : (
          <CaretRight size={12} className="text-gray-9" />
        )}
        <Text size="1" color="gray">
          {stats.completed}/{stats.total} completed
        </Text>
        {stats.inProgress && (
          <>
            <Text size="1" color="gray">
              •
            </Text>
            <Spinner size={12} className="animate-spin text-blue-9" />
            <Text size="1" className="truncate text-gray-11">
              {stats.inProgress.content}
            </Text>
          </>
        )}
      </Flex>

      {isExpanded && plan && (
        <Box className="border-gray-4 border-t px-3 pb-2">
          <Flex direction="column" gap="1" className="pt-2">
            {plan.entries.map((entry) => (
              <Flex key={entry.content} align="center" gap="2">
                <StatusIcon status={entry.status} />
                <Text
                  size="1"
                  color={entry.status === "completed" ? "gray" : undefined}
                  className={entry.status === "completed" ? "text-gray-9" : ""}
                >
                  {entry.content}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Box>
      )}
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
