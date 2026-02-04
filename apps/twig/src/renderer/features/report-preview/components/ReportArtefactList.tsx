import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Badge, Box, Flex, Skeleton, Text } from "@radix-ui/themes";
import type { SignalReportArtefact } from "@shared/types";
import { useState } from "react";
import { ReportArtefactItem } from "./ReportArtefactItem";

interface ReportArtefactListProps {
  artefacts: SignalReportArtefact[];
  count: number;
  isLoading: boolean;
  error: Error | null;
  replayBaseUrl: string;
}

export function ReportArtefactList({
  artefacts,
  count,
  isLoading,
  error,
  replayBaseUrl,
}: ReportArtefactListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  if (isLoading) {
    return (
      <Flex direction="column" gap="2">
        <Skeleton height="20px" width="150px" />
        <Skeleton height="80px" />
        <Skeleton height="80px" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Text size="2" color="red">
        Failed to load session recordings
      </Text>
    );
  }

  if (artefacts.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" gap="2">
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex cursor-pointer items-center gap-2 text-left"
      >
        <Box className="text-gray-9">
          {isExpanded ? (
            <CaretDownIcon size={14} />
          ) : (
            <CaretRightIcon size={14} />
          )}
        </Box>
        <Text size="2" weight="medium">
          Session recordings
        </Text>
        <Badge variant="soft" size="1">
          {count}
        </Badge>
      </button>

      {isExpanded && (
        <Flex direction="column" gap="2" className="ml-5">
          {artefacts.map((artefact) => (
            <ReportArtefactItem
              key={artefact.id}
              artefact={artefact}
              replayBaseUrl={replayBaseUrl}
            />
          ))}
        </Flex>
      )}
    </Flex>
  );
}
