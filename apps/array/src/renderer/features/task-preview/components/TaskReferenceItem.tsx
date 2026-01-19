import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Link, Text } from "@radix-ui/themes";
import type { TaskReference } from "@shared/types";
import { useState } from "react";

interface TaskReferenceItemProps {
  reference: TaskReference;
  replayBaseUrl: string;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end.getTime() - start.getTime();

  if (durationMs < 1000) {
    return "<1s";
  }

  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TaskReferenceItem({
  reference,
  replayBaseUrl,
}: TaskReferenceItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const duration = formatDuration(reference.start_time, reference.end_time);
  const timestamp = formatTimestamp(reference.start_time);
  const replayUrl = `${replayBaseUrl}/${reference.session_id}`;

  return (
    <Box className="rounded border border-gray-6 bg-gray-2 transition-colors hover:border-gray-7">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-start gap-2 p-3 text-left"
      >
        <Box className="mt-0.5 flex-shrink-0 text-gray-9">
          {isExpanded ? (
            <CaretDownIcon size={14} />
          ) : (
            <CaretRightIcon size={14} />
          )}
        </Box>
        <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
          <Text
            size="1"
            className={
              isExpanded ? "text-gray-12" : "line-clamp-2 text-gray-12"
            }
          >
            {reference.content}
          </Text>
          <Flex align="center" gap="2">
            <Flex align="center" gap="1">
              <UserIcon size={12} className="text-gray-9" />
              <Text size="1" color="gray">
                {reference.distinct_id}
              </Text>
            </Flex>
            <Text size="1" color="gray">
              {timestamp}
            </Text>
          </Flex>
        </Flex>
      </button>

      {isExpanded && (
        <Box className="border-gray-6 border-t px-3 py-2">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="4">
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Session ID
                </Text>
                <Text size="1" className="font-mono text-gray-11">
                  {reference.session_id}
                </Text>
              </Flex>
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Duration
                </Text>
                <Text size="1" className="text-gray-11">
                  {duration}
                </Text>
              </Flex>
            </Flex>
            <Link
              href={replayUrl}
              target="_blank"
              size="1"
              className="inline-flex items-center gap-1"
            >
              View recording
              <ArrowSquareOutIcon size={12} />
            </Link>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
