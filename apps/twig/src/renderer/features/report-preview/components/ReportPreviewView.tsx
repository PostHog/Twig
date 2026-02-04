import { useAuthStore } from "@features/auth/stores/authStore";
import { useReportArtefacts } from "@features/reports/hooks/useReports";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { SignalReport } from "@shared/types";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { ReportArtefactList } from "./ReportArtefactList";

interface ReportPreviewViewProps {
  report: SignalReport;
}

export function ReportPreviewView({ report }: ReportPreviewViewProps) {
  useSetHeaderContent(null);

  const { navigateToTaskInput } = useNavigationStore();
  const projectId = useAuthStore((state) => state.projectId);
  const cloudRegion = useAuthStore((state) => state.cloudRegion);

  const {
    data: artefactsData,
    isLoading: isLoadingArtefacts,
    error: artefactsError,
  } = useReportArtefacts(report.id);

  const replayBaseUrl = cloudRegion
    ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
    : "";

  const handleGoBack = () => {
    navigateToTaskInput();
  };

  return (
    <Box height="100%" overflowY="auto">
      <Box p="6" style={{ maxWidth: "700px", margin: "0 auto" }}>
        <Flex direction="column" gap="6">
          {/* Header with title */}
          <Flex direction="column" gap="2">
            <Flex align="center" gap="3">
              <Button variant="ghost" size="1" onClick={handleGoBack}>
                <ArrowLeftIcon size={14} />
                Back to tasks
              </Button>
              <Box className="h-4 w-px bg-gray-6" />
              <Text
                size="1"
                className="whitespace-nowrap rounded bg-accent-4 px-1 py-0.5 text-accent-11"
              >
                AUTO-DETECTED
              </Text>
            </Flex>
            <Heading size="5">{report.title ?? "Untitled Report"}</Heading>
          </Flex>

          {/* Summary */}
          {report.summary && (
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                Summary
              </Text>
              <Box className="rounded border border-gray-6 bg-gray-2 p-3">
                <Text size="2" className="whitespace-pre-wrap text-gray-12">
                  {report.summary}
                </Text>
              </Box>
            </Flex>
          )}

          {/* Stats */}
          <Flex gap="4">
            {report.relevant_user_count !== null && (
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Affected users
                </Text>
                <Text size="2" weight="medium">
                  {report.relevant_user_count}
                </Text>
              </Flex>
            )}
            <Flex direction="column" gap="0">
              <Text size="1" color="gray">
                Occurrences
              </Text>
              <Text size="2" weight="medium">
                {report.signal_count}
              </Text>
            </Flex>
          </Flex>

          {/* Artefacts section */}
          <Box>
            <ReportArtefactList
              artefacts={artefactsData?.results ?? []}
              count={artefactsData?.count ?? 0}
              isLoading={isLoadingArtefacts}
              error={artefactsError}
              replayBaseUrl={replayBaseUrl}
            />
          </Box>
        </Flex>
      </Box>
    </Box>
  );
}
