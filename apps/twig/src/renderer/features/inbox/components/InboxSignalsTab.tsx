import { ResizableSidebar } from "@components/ResizableSidebar";
import { useAuthStore } from "@features/auth/stores/authStore";
import {
  useInboxReportArtefacts,
  useInboxReports,
} from "@features/inbox/hooks/useInboxReports";
import { useInboxSignalsSidebarStore } from "@features/inbox/stores/inboxSignalsSidebarStore";
import { buildSignalTaskPrompt } from "@features/inbox/utils/buildSignalTaskPrompt";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  ArrowSquareOutIcon,
  ClockIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Badge, Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useEffect, useMemo, useState } from "react";
import { getCloudUrlFromRegion } from "@/constants/oauth";

interface InboxSignalsTabProps {
  onGoToSetup: () => void;
}

function ReportCard({
  report,
  isSelected,
  onClick,
}: {
  report: SignalReport;
  isSelected: boolean;
  onClick: () => void;
}) {
  const updatedAtLabel = new Date(report.updated_at).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );

  const isStrongSignal = report.total_weight >= 65 || report.signal_count >= 20;
  const isMediumSignal = report.total_weight >= 30 || report.signal_count >= 6;
  const strengthColor = isStrongSignal
    ? "var(--green-9)"
    : isMediumSignal
      ? "var(--yellow-9)"
      : "var(--gray-8)";
  const strengthLabel = isStrongSignal
    ? "strong"
    : isMediumSignal
      ? "medium"
      : "light";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-gray-5 border-b px-3 py-2 text-left transition-colors hover:bg-gray-2"
      style={{
        backgroundColor: isSelected ? "var(--gray-3)" : "transparent",
      }}
    >
      <Flex align="start" justify="between" gap="3">
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2">
            <span
              title={`Signal strength: ${strengthLabel}`}
              aria-hidden
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                backgroundColor: strengthColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <Text
              size="1"
              weight="medium"
              className="truncate font-mono text-[12px]"
            >
              {report.title ?? "Untitled signal"}
            </Text>
          </Flex>
          <Text
            size="1"
            color="gray"
            className="truncate font-mono text-[11px]"
          >
            {report.summary ?? "No summary available yet."}
          </Text>
        </Flex>
        <Flex direction="column" align="end" gap="1" className="shrink-0">
          <Text size="1" color="gray" className="font-mono text-[11px]">
            {updatedAtLabel}
          </Text>
          <Flex align="center" gap="1">
            <SparkleIcon size={11} />
            <Text size="1" color="gray" className="font-mono text-[10px]">
              {report.signal_count}
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </button>
  );
}

export function InboxSignalsTab({ onGoToSetup }: InboxSignalsTabProps) {
  const { data, isLoading, error } = useInboxReports();
  const reports = data?.results ?? [];
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const sidebarOpen = useInboxSignalsSidebarStore((state) => state.open);
  const sidebarWidth = useInboxSignalsSidebarStore((state) => state.width);
  const sidebarIsResizing = useInboxSignalsSidebarStore(
    (state) => state.isResizing,
  );
  const setSidebarOpen = useInboxSignalsSidebarStore((state) => state.setOpen);
  const setSidebarWidth = useInboxSignalsSidebarStore(
    (state) => state.setWidth,
  );
  const setSidebarIsResizing = useInboxSignalsSidebarStore(
    (state) => state.setIsResizing,
  );

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null);
      return;
    }
    if (!selectedReportId) {
      return;
    }
    const selectedExists = reports.some(
      (report) => report.id === selectedReportId,
    );
    if (!selectedExists) {
      setSelectedReportId(null);
      setSidebarOpen(false);
    }
  }, [reports, selectedReportId, setSidebarOpen]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const artefactsQuery = useInboxReportArtefacts(selectedReport?.id ?? "", {
    enabled: !!selectedReport,
  });
  const visibleArtefacts = artefactsQuery.data?.results ?? [];

  const cloudRegion = useAuthStore((state) => state.cloudRegion);
  const projectId = useAuthStore((state) => state.projectId);
  const replayBaseUrl =
    cloudRegion && projectId
      ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
      : null;

  const { navigateToTaskInput } = useNavigationStore();
  const draftActions = useDraftStore((s) => s.actions);

  const handleCreateTask = () => {
    if (!selectedReport) return;

    const prompt = buildSignalTaskPrompt({
      report: selectedReport,
      artefacts: visibleArtefacts,
      replayBaseUrl,
    });

    draftActions.setPendingContent("task-input", {
      segments: [{ type: "text", text: prompt }],
    });
    navigateToTaskInput();
  };

  if (isLoading) {
    return (
      <Flex direction="column" gap="3">
        <Text size="1" color="gray" className="font-mono text-[11px]">
          Loading signals...
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Text size="1" color="red" className="font-mono text-[11px]">
        Failed to load Inbox signals.
      </Text>
    );
  }

  if (reports.length === 0) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        height="100%"
        className="text-center"
      >
        <SparkleIcon size={24} className="text-gray-8" />
        <Text size="2" weight="medium" className="font-mono text-[12px]">
          No signals yet
        </Text>
        <Text
          size="1"
          color="gray"
          className="font-mono text-[11px]"
          style={{ maxWidth: 520 }}
        >
          Autonomy has not surfaced repository signals yet. Complete setup and
          wait for fresh events to arrive.
        </Text>
        <Button
          size="1"
          variant="ghost"
          onClick={onGoToSetup}
          className="font-mono text-[11px]"
        >
          Go to Setup
        </Button>
      </Flex>
    );
  }

  return (
    <Flex height="100%" style={{ minHeight: 0 }}>
      <Box flexGrow="1" style={{ minWidth: 0 }}>
        <ScrollArea type="auto" style={{ height: "100%" }}>
          <Flex direction="column">
            <Flex
              align="center"
              justify="between"
              px="3"
              py="2"
              style={{ borderBottom: "1px solid var(--gray-5)" }}
            >
              <Text size="1" color="gray" className="font-mono text-[11px]">
                Signals
              </Text>
            </Flex>
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isSelected={selectedReport?.id === report.id}
                onClick={() => {
                  setSelectedReportId(report.id);
                  setSidebarOpen(true);
                }}
              />
            ))}
          </Flex>
        </ScrollArea>
      </Box>

      <ResizableSidebar
        open={sidebarOpen && !!selectedReport}
        width={sidebarWidth}
        setWidth={setSidebarWidth}
        isResizing={sidebarIsResizing}
        setIsResizing={setSidebarIsResizing}
        side="right"
      >
        {selectedReport ? (
          <>
            <Flex
              align="center"
              justify="between"
              px="3"
              py="2"
              style={{ borderBottom: "1px solid var(--gray-5)" }}
            >
              <Text
                size="1"
                weight="medium"
                className="truncate font-mono text-[12px]"
              >
                {selectedReport.title ?? "Untitled signal"}
              </Text>
              <Flex align="center" gap="1">
                <Button
                  size="1"
                  variant="solid"
                  onClick={handleCreateTask}
                  className="font-mono text-[11px]"
                >
                  Create task
                </Button>
                <Button
                  size="1"
                  variant="ghost"
                  onClick={() => {
                    setSidebarOpen(false);
                    setSelectedReportId(null);
                  }}
                  className="font-mono text-[11px]"
                >
                  <XIcon size={12} />
                  Close
                </Button>
              </Flex>
            </Flex>
            <ScrollArea type="auto" style={{ height: "calc(100% - 41px)" }}>
              <Flex direction="column" gap="2" p="2">
                <Text
                  size="1"
                  color="gray"
                  className="whitespace-pre-wrap text-pretty font-mono text-[11px]"
                >
                  {selectedReport.summary ?? "No summary available."}
                </Text>
                <Flex align="center" gap="2" wrap="wrap">
                  <Badge variant="soft" color="gray" size="1">
                    {selectedReport.signal_count} occurrences
                  </Badge>
                  <Badge variant="soft" color="gray" size="1">
                    {selectedReport.relevant_user_count ?? 0} affected users
                  </Badge>
                </Flex>

                <Box>
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[12px]"
                    mb="2"
                  >
                    Evidence
                  </Text>
                  {artefactsQuery.isLoading && (
                    <Text
                      size="1"
                      color="gray"
                      className="font-mono text-[11px]"
                    >
                      Loading evidence...
                    </Text>
                  )}
                  {artefactsQuery.error && (
                    <Text
                      size="1"
                      color="red"
                      className="font-mono text-[11px]"
                    >
                      Failed to load signal artefacts.
                    </Text>
                  )}
                  {!artefactsQuery.isLoading &&
                    !artefactsQuery.error &&
                    visibleArtefacts.length === 0 && (
                      <Text
                        size="1"
                        color="gray"
                        className="font-mono text-[11px]"
                      >
                        No artefacts were returned for this signal.
                      </Text>
                    )}

                  <Flex direction="column" gap="1">
                    {visibleArtefacts.map((artefact) => (
                      <Box
                        key={artefact.id}
                        className="rounded border border-gray-6 bg-gray-1 p-2"
                      >
                        <Text
                          size="1"
                          className="whitespace-pre-wrap text-pretty font-mono text-[11px]"
                        >
                          {artefact.content.content}
                        </Text>
                        <Flex align="center" justify="between" mt="1" gap="2">
                          <Flex align="center" gap="1">
                            <ClockIcon size={12} className="text-gray-9" />
                            <Text
                              size="1"
                              color="gray"
                              className="font-mono text-[11px]"
                            >
                              {new Date(
                                artefact.content.start_time,
                              ).toLocaleString()}
                            </Text>
                          </Flex>
                          {replayBaseUrl && (
                            <a
                              href={`${replayBaseUrl}/${artefact.content.session_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-11 hover:text-gray-12"
                            >
                              View replay
                              <ArrowSquareOutIcon size={12} />
                            </a>
                          )}
                        </Flex>
                      </Box>
                    ))}
                  </Flex>
                </Box>
              </Flex>
            </ScrollArea>
          </>
        ) : null}
      </ResizableSidebar>
    </Flex>
  );
}
