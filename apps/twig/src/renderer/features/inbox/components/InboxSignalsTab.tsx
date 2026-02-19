import { ResizableSidebar } from "@components/ResizableSidebar";
import { useAuthStore } from "@features/auth/stores/authStore";
import {
  useInboxReportArtefacts,
  useInboxReports,
} from "@features/inbox/hooks/useInboxReports";
import { useInboxSignalsSidebarStore } from "@features/inbox/stores/inboxSignalsSidebarStore";
import { buildSignalTaskPrompt } from "@features/inbox/utils/buildSignalTaskPrompt";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import type { TaskService } from "@features/task-detail/service/service";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowSquareOutIcon,
  ClockIcon,
  Cloud as CloudIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Flex,
  ScrollArea,
  Select,
  Text,
} from "@radix-ui/themes";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { logger } from "@renderer/lib/logger";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import type { SignalReportArtefactsResponse } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SignalsErrorState, SignalsLoadingState } from "./InboxEmptyStates";
import { ReportCard } from "./ReportCard";

const log = logger.scope("inbox-signals-tab");

interface InboxSignalsTabProps {
  onGoToSetup: () => void;
}

function getArtefactsUnavailableMessage(
  reason: SignalReportArtefactsResponse["unavailableReason"],
): string {
  switch (reason) {
    case "forbidden":
      return "Evidence could not be loaded with the current API permissions.";
    case "not_found":
      return "Evidence endpoint is unavailable for this signal in this environment.";
    case "invalid_payload":
      return "Evidence format was unexpected, so no artefacts could be shown.";
    case "request_failed":
      return "Evidence is temporarily unavailable. You can still create a task from this report.";
    default:
      return "Evidence is currently unavailable for this signal.";
  }
}

export function InboxSignalsTab({ onGoToSetup }: InboxSignalsTabProps) {
  const { data, isLoading, isFetching, error, refetch } = useInboxReports();
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
  const artefactsUnavailableReason = artefactsQuery.data?.unavailableReason;
  const showArtefactsUnavailable =
    !artefactsQuery.isLoading &&
    (!!artefactsQuery.error || !!artefactsUnavailableReason);
  const artefactsUnavailableMessage = artefactsQuery.error
    ? "Evidence could not be loaded right now. You can still create a task from this report."
    : getArtefactsUnavailableMessage(artefactsUnavailableReason);

  const cloudRegion = useAuthStore((state) => state.cloudRegion);
  const projectId = useAuthStore((state) => state.projectId);
  const replayBaseUrl =
    cloudRegion && projectId
      ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
      : null;

  const { navigateToTaskInput, navigateToTask } = useNavigationStore();
  const draftActions = useDraftStore((s) => s.actions);
  const { invalidateTasks } = useCreateTask();
  const { githubIntegration, repositories } = useRepositoryIntegration();
  const cloudModeEnabled = useFeatureFlag("twig-cloud-mode-toggle");
  const [isRunningCloudTask, setIsRunningCloudTask] = useState(false);
  const [showCloudConfirm, setShowCloudConfirm] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const buildPrompt = useCallback(() => {
    if (!selectedReport) return null;
    return buildSignalTaskPrompt({
      report: selectedReport,
      artefacts: visibleArtefacts,
      replayBaseUrl,
    });
  }, [selectedReport, visibleArtefacts, replayBaseUrl]);

  const handleCreateTask = () => {
    const prompt = buildPrompt();
    if (!prompt) return;

    draftActions.setPendingContent("task-input", {
      segments: [{ type: "text", text: prompt }],
    });
    navigateToTaskInput();
  };

  const handleOpenCloudConfirm = useCallback(() => {
    setSelectedRepo(repositories[0] ?? null);
    setShowCloudConfirm(true);
  }, [repositories]);

  const handleRunCloudTask = useCallback(async () => {
    setShowCloudConfirm(false);
    const prompt = buildPrompt();
    if (!prompt) return;

    setIsRunningCloudTask(true);
    try {
      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
      const result = await taskService.createTask({
        content: prompt,
        workspaceMode: "cloud",
        githubIntegrationId: githubIntegration?.id,
        repository: selectedRepo,
      });

      if (result.success) {
        const { task } = result.data;
        invalidateTasks(task);
        navigateToTask(task);
        log.info("Cloud task created from signal report", {
          taskId: task.id,
          reportId: selectedReport?.id,
          repository: selectedRepo,
        });
      } else {
        toast.error(result.error ?? "Failed to create cloud task");
        log.error("Cloud task creation failed", {
          failedStep: result.failedStep,
          error: result.error,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to run cloud task: ${message}`);
      log.error("Unexpected error during cloud task creation", { error });
    } finally {
      setIsRunningCloudTask(false);
    }
  }, [
    buildPrompt,
    invalidateTasks,
    navigateToTask,
    selectedReport?.id,
    githubIntegration?.id,
    selectedRepo,
  ]);

  if (isLoading) {
    return <SignalsLoadingState />;
  }

  if (error) {
    return (
      <SignalsErrorState
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isFetching}
        onGoToSetup={onGoToSetup}
      />
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
              direction="column"
              gap="2"
              px="3"
              py="2"
              style={{ borderBottom: "1px solid var(--gray-5)" }}
            >
              <Flex align="center" justify="between" gap="2">
                <Text
                  size="1"
                  weight="medium"
                  className="block truncate font-mono text-[12px]"
                >
                  {selectedReport.title ?? "Untitled signal"}
                </Text>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    setSelectedReportId(null);
                  }}
                  className="shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                >
                  <XIcon size={14} />
                </button>
              </Flex>
              <Flex align="center" gap="1">
                <Button
                  size="1"
                  variant="soft"
                  onClick={handleCreateTask}
                  className="font-mono text-[11px]"
                >
                  Create task
                </Button>
                {cloudModeEnabled && (
                  <Button
                    size="1"
                    variant="solid"
                    onClick={handleOpenCloudConfirm}
                    disabled={isRunningCloudTask || repositories.length === 0}
                    className="font-mono text-[11px]"
                  >
                    <CloudIcon size={12} />
                    {isRunningCloudTask ? "Running..." : "Run cloud"}
                  </Button>
                )}
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
                    className="block font-mono text-[12px]"
                    mb="2"
                  >
                    Evidence
                  </Text>
                  {artefactsQuery.isLoading && (
                    <Text
                      size="1"
                      color="gray"
                      className="block font-mono text-[11px]"
                    >
                      Loading evidence...
                    </Text>
                  )}
                  {showArtefactsUnavailable && (
                    <Text
                      size="1"
                      color="gray"
                      className="block font-mono text-[11px]"
                    >
                      {artefactsUnavailableMessage}
                    </Text>
                  )}
                  {!artefactsQuery.isLoading &&
                    !showArtefactsUnavailable &&
                    visibleArtefacts.length === 0 && (
                      <Text
                        size="1"
                        color="gray"
                        className="block font-mono text-[11px]"
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
                              {artefact.content.start_time
                                ? new Date(
                                    artefact.content.start_time,
                                  ).toLocaleString()
                                : "Unknown time"}
                            </Text>
                          </Flex>
                          {replayBaseUrl && artefact.content.session_id && (
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

      <AlertDialog.Root
        open={showCloudConfirm}
        onOpenChange={setShowCloudConfirm}
      >
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <CloudIcon size={18} />
              <Text weight="bold" className="font-mono">
                Run cloud task
              </Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="3">
              <Text className="font-mono text-[12px]">
                This will create and run a cloud task from this signal report.
              </Text>
              {repositories.length > 1 ? (
                <Flex direction="column" gap="1">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    Target repository
                  </Text>
                  <Select.Root
                    value={selectedRepo ?? undefined}
                    onValueChange={setSelectedRepo}
                  >
                    <Select.Trigger className="font-mono text-[12px]" />
                    <Select.Content>
                      {repositories.map((repo) => (
                        <Select.Item
                          key={repo}
                          value={repo}
                          className="font-mono text-[12px]"
                        >
                          {repo}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Flex>
              ) : selectedRepo ? (
                <Flex direction="column" gap="1">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    Target repository
                  </Text>
                  <Text size="2" className="font-mono text-[12px]">
                    {selectedRepo}
                  </Text>
                </Flex>
              ) : null}
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" className="font-mono">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                onClick={() => void handleRunCloudTask()}
                className="font-mono"
              >
                <CloudIcon size={14} />
                Run
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
