import { Tooltip } from "@components/ui/Tooltip";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleNotchIcon,
  SparkleIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { RepoAutonomyStatus, Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useInboxRepoReadiness } from "../hooks/useInboxRepoReadiness";
import { useInboxRepoStatus } from "../hooks/useInboxRepoStatus";
import { buildSetupTaskPrompt } from "../utils/buildSetupTaskPrompt";

type CapabilityState = RepoAutonomyStatus["coreSuggestions"]["state"];
type ProjectSetupStatus = {
  sessionReplayEnabled: boolean;
  errorTrackingEnabled: boolean;
};

function isCapabilityApplicable(state: CapabilityState): boolean {
  return state !== "not_applicable";
}

function isCapabilityConfigured(state: CapabilityState): boolean {
  return state === "ready" || state === "waiting_for_data";
}

function isCapabilityPartiallyConfigured(state: CapabilityState): boolean {
  return state === "detected";
}

function requiresSetupTask(state: CapabilityState): boolean {
  return state === "needs_setup" || state === "detected";
}

function getCapabilityDotColor(state: CapabilityState) {
  if (state === "ready" || state === "waiting_for_data")
    return "var(--green-9)";
  if (state === "detected") return "var(--yellow-9)";
  if (state === "needs_setup") return "var(--red-9)";
  if (state === "not_applicable") return "var(--gray-8)";
  return "var(--gray-8)";
}

function getRepoDotColor(status?: RepoAutonomyStatus) {
  if (!status) return "var(--gray-8)";
  const states = [
    status.coreSuggestions.state,
    status.replayInsights.state,
    status.errorInsights.state,
  ];
  const applicableStates = states.filter(isCapabilityApplicable);
  if (applicableStates.length === 0) return "var(--gray-8)";

  const configuredCount = applicableStates.filter(
    isCapabilityConfigured,
  ).length;
  const partiallyConfiguredCount = applicableStates.filter(
    isCapabilityPartiallyConfigured,
  ).length;

  if (configuredCount === applicableStates.length) return "var(--green-9)";
  if (configuredCount === 0 && partiallyConfiguredCount === 0)
    return "var(--red-9)";
  return "var(--yellow-9)";
}

function capabilitySetupSummary(label: string, state: CapabilityState): string {
  if (state === "ready") return `${label}: set up`;
  if (state === "waiting_for_data") return `${label}: waiting on data`;
  if (state === "detected") return `${label}: detected`;
  if (state === "needs_setup") return `${label}: not set up`;
  if (state === "not_applicable") return `${label}: n/a`;
  return `${label}: unknown`;
}

function getCapabilityGoalDotColor(state: CapabilityState): string {
  if (state === "not_applicable") return "var(--gray-8)";
  if (state === "ready") return "var(--green-9)";
  return "var(--red-9)";
}

function getGateDotColor(value: boolean | null): string {
  if (value === null) return "var(--gray-8)";
  return value ? "var(--green-9)" : "var(--red-9)";
}

function getGateLabel(value: boolean | null): string {
  if (value === null) return "n/a";
  return value ? "yes" : "no";
}

function getNumericEvidence(
  capability: RepoAutonomyStatus["coreSuggestions"],
  key: string,
): number | null {
  const value = capability.evidence?.[key];
  return typeof value === "number" ? value : null;
}

function inferCodeDetectedFromState(state: CapabilityState): boolean | null {
  if (state === "not_applicable") return null;
  if (state === "unknown") return null;
  return state !== "needs_setup";
}

function inferDataReceivedFromState(state: CapabilityState): boolean | null {
  if (state === "not_applicable") return null;
  if (state === "unknown") return null;
  return state === "ready";
}

function inferProjectSettingFromState(state: CapabilityState): boolean | null {
  if (
    state === "not_applicable" ||
    state === "unknown" ||
    state === "needs_setup"
  ) {
    return null;
  }

  if (state === "detected") {
    return false;
  }

  return true;
}

function renderCapabilityStatusLine(
  label: string,
  state: CapabilityState,
): ReactNode {
  return (
    <Flex key={label} align="center" gap="3">
      <span
        aria-hidden
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "9999px",
          backgroundColor: getCapabilityGoalDotColor(state),
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <Text size="1" className="font-mono text-[11px]">
        {capabilitySetupSummary(label, state)}
      </Text>
    </Flex>
  );
}

function getRepoSetupTooltip(status?: RepoAutonomyStatus): ReactNode {
  if (!status) {
    return (
      <Text size="1" className="font-mono text-[11px]">
        Evaluate readiness to see setup progress.
      </Text>
    );
  }

  const capabilities: Array<{ label: string; state: CapabilityState }> = [
    { label: "Tracking", state: status.coreSuggestions.state },
    { label: "Computer vision", state: status.replayInsights.state },
    { label: "Errors", state: status.errorInsights.state },
  ];

  const notFullySetUp = capabilities
    .filter((capability) => isCapabilityApplicable(capability.state))
    .filter((capability) => !isCapabilityConfigured(capability.state))
    .map((capability) => capability.label);

  return (
    <Flex
      direction="column"
      gap="1"
      style={{ whiteSpace: "normal", maxWidth: "340px" }}
    >
      {capabilities.map((capability) =>
        renderCapabilityStatusLine(capability.label, capability.state),
      )}
      {notFullySetUp.length === 0 ? null : (
        <Text size="1" className="font-mono text-[11px] text-gray-11">
          To get green: {notFullySetUp.join(", ")}
        </Text>
      )}
    </Flex>
  );
}

function CapabilityPill({
  label,
  capability,
  gates,
}: {
  label: string;
  capability: RepoAutonomyStatus["coreSuggestions"];
  gates: Array<{ label: string; value: boolean | null }>;
}) {
  const tooltipContent = (
    <Flex
      direction="column"
      gap="1"
      style={{ whiteSpace: "normal", maxWidth: "320px" }}
    >
      {gates.map((gate) => (
        <Flex key={gate.label} align="center" gap="3">
          <span
            aria-hidden
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "9999px",
              backgroundColor: getGateDotColor(gate.value),
              display: "inline-block",
              flexShrink: 0,
              marginRight: "6px",
            }}
          />
          <Text size="1" className="font-mono text-[11px]">
            {gate.label}: {getGateLabel(gate.value)}
          </Text>
        </Flex>
      ))}
    </Flex>
  );

  return (
    <Tooltip content={tooltipContent} side="top">
      <Flex
        align="center"
        gap="2"
        className="rounded border border-gray-6 bg-gray-2 px-2 py-1"
      >
        <span
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "9999px",
            backgroundColor: getCapabilityDotColor(capability.state),
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <Text size="1" className="font-mono text-[11px]">
          {label}
        </Text>
      </Flex>
    </Tooltip>
  );
}

function RepoSetupRow({
  repository,
  isOpen,
  onToggle,
  githubIntegrationId,
  projectStatus,
  onCreateSetupTask,
  creatingRepo,
}: {
  repository: string;
  isOpen: boolean;
  onToggle: () => void;
  githubIntegrationId: number | undefined;
  projectStatus: ProjectSetupStatus;
  onCreateSetupTask: (status: RepoAutonomyStatus) => Promise<void>;
  creatingRepo: string | null;
}) {
  const { status, error, evaluate, refresh, isEvaluating, isRefreshing } =
    useInboxRepoReadiness(repository, { windowDays: 7 });

  const canOpen = !!status;

  const missingCapabilities: string[] = [];
  if (status && requiresSetupTask(status.coreSuggestions.state)) {
    missingCapabilities.push("Tracking");
  }
  if (status && requiresSetupTask(status.replayInsights.state)) {
    missingCapabilities.push("Computer vision");
  }
  if (status && requiresSetupTask(status.errorInsights.state)) {
    missingCapabilities.push("Errors");
  }

  const trackingCodeDetected = status?.scan
    ? status.scan.foundPosthogInit &&
      (status.scan.foundPosthogCapture || status.scan.eventNameCount > 0)
    : undefined;
  const computerVisionCodeDetected = status?.scan
    ? status.scan.foundPosthogInit
    : undefined;
  const errorsCodeDetected = status?.scan
    ? status.scan.foundErrorSignal ||
      (status.classification === "frontend_js" && status.scan.foundPosthogInit)
    : undefined;

  const trackingDataCount = status
    ? getNumericEvidence(status.coreSuggestions, "matchedEventCount")
    : null;
  const replayDataCount = status
    ? getNumericEvidence(status.replayInsights, "replayTaskCount")
    : null;
  const errorDataCount = status
    ? getNumericEvidence(status.errorInsights, "recentErrorIssueCount")
    : null;

  const handleEvaluate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const result = await evaluate();
    if (result && !isOpen) {
      onToggle();
    }
  };

  const handleRefresh = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await refresh();
  };

  return (
    <Box className="rounded border border-gray-6 bg-gray-1">
      <Flex align="center" justify="between" gap="2" className="px-2 py-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={!canOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {canOpen ? (
            isOpen ? (
              <CaretDownIcon size={12} />
            ) : (
              <CaretRightIcon size={12} />
            )
          ) : (
            <span
              aria-hidden
              style={{ width: "12px", height: "12px", display: "inline-block" }}
            />
          )}
          <Text
            size="1"
            className="truncate font-mono text-[12px]"
            style={{ maxWidth: "70ch" }}
          >
            {repository}
          </Text>
        </button>
        <Flex align="center" gap="2">
          <Tooltip
            content={status ? "Re-evaluate readiness" : "Evaluate readiness"}
          >
            <Button
              size="1"
              variant="ghost"
              onClick={(event) => {
                if (status) {
                  void handleRefresh(event);
                } else {
                  void handleEvaluate(event);
                }
              }}
              disabled={isEvaluating || isRefreshing}
              className="font-mono text-[11px]"
            >
              {isEvaluating || isRefreshing ? (
                <CircleNotchIcon size={12} className="animate-spin" />
              ) : (
                <ArrowsClockwiseIcon size={12} />
              )}
              {status ? "Sync" : "Evaluate"}
            </Button>
          </Tooltip>
          <Tooltip content={getRepoSetupTooltip(status)}>
            <span
              aria-hidden
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                backgroundColor: getRepoDotColor(status),
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          </Tooltip>
        </Flex>
      </Flex>

      {!status && error && (
        <Text size="1" color="red" className="px-2 pb-2 font-mono text-[11px]">
          Failed to evaluate readiness.
        </Text>
      )}

      {isOpen && status && (
        <Flex direction="column" gap="2" px="2" pb="2">
          <Text size="1" color="gray" className="font-mono text-[11px]">
            {status.classification
              ? `type: ${status.classification.replaceAll("_", " ")}`
              : "type: unknown"}
          </Text>

          {error && (
            <Text size="1" color="red" className="font-mono text-[11px]">
              Failed to refresh readiness.
            </Text>
          )}

          <Flex gap="2" wrap="wrap">
            <CapabilityPill
              label="Tracking"
              capability={status.coreSuggestions}
              gates={[
                {
                  label: "Code detected",
                  value:
                    trackingCodeDetected ??
                    inferCodeDetectedFromState(status.coreSuggestions.state),
                },
                {
                  label: "Project setting",
                  value: inferProjectSettingFromState(
                    status.coreSuggestions.state,
                  ),
                },
                {
                  label: "Data received",
                  value:
                    trackingDataCount !== null
                      ? trackingDataCount > 0
                      : inferDataReceivedFromState(
                          status.coreSuggestions.state,
                        ),
                },
              ]}
            />
            <CapabilityPill
              label="Computer vision"
              capability={status.replayInsights}
              gates={[
                {
                  label: "Code detected",
                  value:
                    computerVisionCodeDetected ??
                    inferCodeDetectedFromState(status.replayInsights.state),
                },
                {
                  label: "Project setting",
                  value:
                    status.replayInsights.state === "not_applicable"
                      ? null
                      : projectStatus.sessionReplayEnabled,
                },
                {
                  label: "Data received",
                  value:
                    replayDataCount !== null
                      ? replayDataCount > 0
                      : inferDataReceivedFromState(status.replayInsights.state),
                },
              ]}
            />
            <CapabilityPill
              label="Errors"
              capability={status.errorInsights}
              gates={[
                {
                  label: "Code detected",
                  value:
                    errorsCodeDetected ??
                    inferCodeDetectedFromState(status.errorInsights.state),
                },
                {
                  label: "Project setting",
                  value:
                    status.errorInsights.state === "not_applicable"
                      ? null
                      : projectStatus.errorTrackingEnabled,
                },
                {
                  label: "Data received",
                  value:
                    errorDataCount !== null
                      ? errorDataCount > 0
                      : inferDataReceivedFromState(status.errorInsights.state),
                },
              ]}
            />
          </Flex>

          {status.excluded ? (
            <Text size="1" color="gray" className="font-mono text-[11px]">
              This repository is excluded from autonomy setup.
            </Text>
          ) : (
            <Flex p="2">
              <Button
                size="1"
                variant="ghost"
                onClick={() => void onCreateSetupTask(status)}
                disabled={
                  creatingRepo === status.repository ||
                  !githubIntegrationId ||
                  missingCapabilities.length === 0
                }
                className="w-fit font-mono text-[11px]"
              >
                {creatingRepo === status.repository ? (
                  <CircleNotchIcon size={12} className="animate-spin" />
                ) : (
                  <SparkleIcon size={12} />
                )}
                setup with wizard
              </Button>
            </Flex>
          )}
        </Flex>
      )}
    </Box>
  );
}

export function InboxSetupTab() {
  const queryClient = useQueryClient();
  const { navigateToTask } = useNavigationStore();
  const [creatingRepo, setCreatingRepo] = useState<string | null>(null);
  const [openRepos, setOpenRepos] = useState<Set<string>>(new Set());

  const {
    repositories,
    hasGithubIntegration,
    githubIntegrationId,
    projectStatus,
    isLoading,
    error,
  } = useInboxRepoStatus();

  const setupTaskMutation = useAuthenticatedMutation(
    (
      client,
      {
        repository,
        missingCapabilities,
      }: { repository: string; missingCapabilities: string[] },
    ) =>
      client.createTask({
        title: `Set up Autonomy for ${repository}`,
        description: buildSetupTaskPrompt({ repository, missingCapabilities }),
        repository,
        origin_product: "twig",
        github_integration: githubIntegrationId ?? null,
      }) as unknown as Promise<Task>,
  );

  const enableProjectSettingsMutation = useAuthenticatedMutation(
    (client, _variables: undefined) =>
      client.updateTeam({
        ...(projectStatus.sessionReplayEnabled
          ? {}
          : { session_recording_opt_in: true }),
        ...(projectStatus.errorTrackingEnabled
          ? {}
          : { autocapture_exceptions_opt_in: true }),
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["project"] });
        queryClient.invalidateQueries({ queryKey: ["inbox", "setup"] });
        toast.success("Autonomy project settings updated.");
      },
      onError: (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update project settings.",
        );
      },
    },
  );

  const missingAutoEnableToggles =
    !projectStatus.sessionReplayEnabled || !projectStatus.errorTrackingEnabled;

  const handleCreateSetupTask = async (status: RepoAutonomyStatus) => {
    const missingCapabilities: string[] = [];

    if (requiresSetupTask(status.coreSuggestions.state)) {
      missingCapabilities.push("Tracking readiness");
    }
    if (requiresSetupTask(status.replayInsights.state)) {
      missingCapabilities.push("Computer vision readiness");
    }
    if (requiresSetupTask(status.errorInsights.state)) {
      missingCapabilities.push("Error insights readiness");
    }

    if (missingCapabilities.length === 0) {
      toast.success(`${status.repository} is already ready.`);
      return;
    }

    setCreatingRepo(status.repository);
    try {
      const task = await setupTaskMutation.mutateAsync({
        repository: status.repository,
        missingCapabilities,
      });

      queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
      queryClient.invalidateQueries({ queryKey: ["inbox", "setup"] });
      toast.success(`Created setup task for ${status.repository}.`);
      await navigateToTask(task);
    } catch (taskError) {
      toast.error(
        taskError instanceof Error
          ? taskError.message
          : "Failed to create setup task.",
      );
    } finally {
      setCreatingRepo(null);
    }
  };

  const toggleRepo = (repo: string) => {
    setOpenRepos((current) => {
      const next = new Set(current);
      if (next.has(repo)) {
        next.delete(repo);
      } else {
        next.add(repo);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Text size="1" color="gray" className="font-mono text-[11px]">
        Loading setup status...
      </Text>
    );
  }

  if (error) {
    return (
      <Text size="1" color="red" className="font-mono text-[11px]">
        Failed to load setup status.
      </Text>
    );
  }

  if (!hasGithubIntegration) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        height="100%"
        className="text-center"
      >
        <WrenchIcon size={24} className="text-gray-8" />
        <Text size="2" weight="medium" className="font-mono text-[12px]">
          Connect GitHub integration
        </Text>
        <Text
          size="1"
          color="gray"
          className="font-mono text-[11px]"
          style={{ maxWidth: 520 }}
        >
          Setup status is repository-based. Connect your GitHub integration in
          PostHog, then return to Inbox to see readiness.
        </Text>
      </Flex>
    );
  }

  if (repositories.length === 0) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        height="100%"
        className="text-center"
      >
        <WrenchIcon size={24} className="text-gray-8" />
        <Text size="2" weight="medium" className="font-mono text-[12px]">
          No connected repositories
        </Text>
        <Text
          size="1"
          color="gray"
          className="font-mono text-[11px]"
          style={{ maxWidth: 520 }}
        >
          Your GitHub integration is connected, but no repositories are
          currently available to evaluate.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2" height="100%" style={{ minHeight: 0 }}>
      {missingAutoEnableToggles && (
        <Box className="rounded border border-gray-6 bg-gray-1 px-2 py-2">
          <Flex direction="column" gap="2">
            <Text size="1" color="gray" className="font-mono text-[11px]">
              Enable project settings for replay and errors.
            </Text>
            <Flex>
              <Button
                size="1"
                variant="ghost"
                onClick={() => enableProjectSettingsMutation.mutate(undefined)}
                disabled={enableProjectSettingsMutation.isPending}
                className="font-mono text-[11px]"
              >
                {enableProjectSettingsMutation.isPending ? (
                  <CircleNotchIcon size={12} className="animate-spin" />
                ) : (
                  <SparkleIcon size={12} />
                )}
                Enable settings
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}

      <Flex align="center" justify="between" px="1">
        <Text size="1" color="gray" className="font-mono text-[11px]">
          Repositories
        </Text>
      </Flex>

      <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
        <Flex direction="column" gap="1" pr="2">
          {repositories.map((repository) => (
            <RepoSetupRow
              key={repository}
              repository={repository}
              isOpen={openRepos.has(repository)}
              onToggle={() => toggleRepo(repository)}
              githubIntegrationId={githubIntegrationId}
              projectStatus={projectStatus}
              onCreateSetupTask={handleCreateSetupTask}
              creatingRepo={creatingRepo}
            />
          ))}
        </Flex>
      </ScrollArea>
    </Flex>
  );
}
