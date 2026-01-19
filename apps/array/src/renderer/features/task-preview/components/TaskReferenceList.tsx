import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Badge, Box, Flex, Skeleton, Text } from "@radix-ui/themes";
import type { TaskReference } from "@shared/types";
import { useState } from "react";
import { TaskReferenceItem } from "./TaskReferenceItem";

interface TaskReferenceListProps {
  references: TaskReference[];
  count: number;
  isLoading: boolean;
  error?: Error | null;
  replayBaseUrl: string;
}

function LoadingSkeleton() {
  return (
    <Flex direction="column" gap="2">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="rounded border border-gray-6 bg-gray-2 p-3">
          <Skeleton height="14px" width="90%" mb="2" />
          <Skeleton height="12px" width="40%" />
        </Box>
      ))}
    </Flex>
  );
}

function EmptyState() {
  return (
    <Box className="rounded border border-gray-6 border-dashed bg-gray-1 p-4">
      <Text size="1" color="gray" align="center" as="p">
        No session references found for this task.
      </Text>
    </Box>
  );
}

export function TaskReferenceList({
  references,
  count,
  isLoading,
  error,
  replayBaseUrl,
}: TaskReferenceListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (error) {
    return (
      <Box className="rounded border border-red-6 bg-red-2 p-3">
        <Text size="1" color="red">
          Failed to load references: {error.message}
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mb-2 flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <Box className="text-gray-9">
          {isExpanded ? (
            <CaretDownIcon size={14} />
          ) : (
            <CaretRightIcon size={14} />
          )}
        </Box>
        <Text size="2" weight="medium" className="text-gray-12">
          Session references
        </Text>
        {!isLoading && (
          <Badge size="1" color="gray" variant="soft">
            {count}
          </Badge>
        )}
      </button>

      {isExpanded && (
        <Box>
          {isLoading && <LoadingSkeleton />}
          {!isLoading && references.length === 0 && <EmptyState />}
          {!isLoading && references.length > 0 && (
            <Flex direction="column" gap="2">
              {references.map((reference) => (
                <TaskReferenceItem
                  key={reference.id}
                  reference={reference}
                  replayBaseUrl={replayBaseUrl}
                />
              ))}
            </Flex>
          )}
        </Box>
      )}
    </Box>
  );
}
