import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  ClockIcon,
  PersonIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Link, Text } from "@radix-ui/themes";
import type { SignalReportArtefact } from "@shared/types";
import { useState } from "react";

interface ReportArtefactItemProps {
  artefact: SignalReportArtefact;
  replayBaseUrl: string;
}

export function ReportArtefactItem({
  artefact,
  replayBaseUrl,
}: ReportArtefactItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const { session_id, start_time, distinct_id, content } = artefact.content;

  const formattedStartTime = new Date(start_time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Calculate timestamp for replay URL
  const replayUrl = `${replayBaseUrl}/${session_id}`;

  return (
    <Box className="rounded border border-gray-6 bg-gray-2 p-3">
      <Flex direction="column" gap="2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex cursor-pointer items-start gap-2 text-left"
        >
          <Box className="mt-0.5 text-gray-9">
            {isExpanded ? (
              <CaretDownIcon size={14} />
            ) : (
              <CaretRightIcon size={14} />
            )}
          </Box>
          <Text
            size="2"
            className={`text-gray-12 ${isExpanded ? "" : "line-clamp-2"}`}
          >
            {content}
          </Text>
        </button>

        {/* Metadata */}
        <Flex align="center" gap="3" className="ml-5">
          <Flex align="center" gap="1">
            <PersonIcon size={12} className="text-gray-9" />
            <Text size="1" color="gray">
              {distinct_id}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            <ClockIcon size={12} className="text-gray-9" />
            <Text size="1" color="gray">
              {formattedStartTime}
            </Text>
          </Flex>
        </Flex>

        {/* Expanded content */}
        {isExpanded && (
          <Flex direction="column" gap="2" className="ml-5 mt-1">
            <Flex align="center" gap="2">
              <Text size="1" color="gray">
                Session ID:
              </Text>
              <Text size="1" className="font-mono text-gray-11">
                {session_id}
              </Text>
            </Flex>
            <Link
              href={replayUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="1"
              className="flex items-center gap-1"
            >
              View session recording
              <ArrowSquareOutIcon size={12} />
            </Link>
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
