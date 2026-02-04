import { useAutonomyFeatureFlag } from "@features/autonomy/hooks/useAutonomyFeatureFlag";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useReports } from "@features/reports/hooks/useReports";
import { useProjectQuery } from "@hooks/useProjectQuery";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { SignalReport } from "@shared/types";
import { useSuggestedTasksStore } from "../stores/suggestedTasksStore";

interface SuggestedTasksProps {
  editorRef: React.RefObject<MessageEditorHandle | null>;
  selectedDirectory: string;
}

function LoadingSkeleton() {
  return (
    <Flex direction="column" gap="2">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="rounded border border-gray-6 bg-gray-2 p-2">
          <Skeleton height="16px" width="60%" mb="1" />
          <Skeleton height="14px" width="90%" />
        </Box>
      ))}
    </Flex>
  );
}

function AutoDetectedInfoBanner() {
  return (
    <Box
      mt="3"
      p="3"
      className="rounded border border-gray-7 border-dashed bg-gray-1"
    >
      <Flex align="start" gap="2">
        <Text
          size="1"
          color="gray"
          style={{ flex: 1 }}
          align="center"
          className="cursor-default text-pretty"
        >
          <strong>Autonomy</strong> continuously analyzes user sessions for you,
          looking for issues.
          <br />
          Each suggested task above addresses a potential issue.
        </Text>
      </Flex>
    </Box>
  );
}

export function SuggestedTasks({
  editorRef,
  selectedDirectory,
}: SuggestedTasksProps) {
  const isAutonomyEnabled = useAutonomyFeatureFlag();
  const { data: project } = useProjectQuery();
  const isProactiveTasksEnabled = (
    project as
      | { proactive_tasks_enabled?: boolean }
      | undefined // We won't need the cast when posthog/posthog#45813 is merged
  )?.proactive_tasks_enabled;
  const staticSuggestions = useSuggestedTasksStore((state) =>
    state.getSuggestions(),
  );
  const rotateSuggestions = useSuggestedTasksStore(
    (state) => state.rotateSuggestions,
  );
  const incrementUsage = useSuggestedTasksStore(
    (state) => state.incrementUsage,
  );
  const {
    navigateToReportPreview,
    navigateToAutonomyTasks,
  } = useNavigationStore();

  const { data: reportsData, isLoading: isFetching } = useReports({
    enabled: isProactiveTasksEnabled === true,
  });

  // Get reports from the response
  const reports = reportsData?.results ?? [];
  const hasReports = reports.length > 0;

  const handleStaticSuggestionClick = (
    suggestionTitle: string,
    prompt: string,
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    incrementUsage(suggestionTitle);
    editor.setContent(prompt);
  };

  const handleReportClick = (report: SignalReport) => {
    navigateToReportPreview(report);
  };

  // Only show UI if we have suggestions or reports (or are loading reports)
  if (staticSuggestions.length === 0 && !hasReports && !isFetching) {
    return null;
  }

  return (
    <Box mt="3">
      <Flex align="center" justify="between" mb="2">
        <Text size="1" color="gray" weight="medium">
          Suggested tasks
        </Text>
        {!hasReports && (
          <IconButton
            size="1"
            variant="ghost"
            onClick={rotateSuggestions}
            title="Show different suggestions"
          >
            <ArrowsClockwiseIcon size={14} />
          </IconButton>
        )}
      </Flex>

      {isFetching ? (
        <LoadingSkeleton />
      ) : hasReports ? (
        <Flex direction="column" gap="2">
          {reports.slice(0, 3).map((report) => (
            <button
              type="button"
              key={report.id}
              onClick={() => handleReportClick(report)}
              className="group relative flex cursor-pointer items-start gap-2 rounded border border-accent-6 bg-accent-2 p-2 text-left transition-colors hover:border-accent-8 hover:bg-accent-3"
            >
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Flex align="start" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="grow text-pretty text-accent-12"
                  >
                    {report.title ?? "Untitled Report"}
                  </Text>
                  <Text
                    size="1"
                    className="-mt-0.5 whitespace-nowrap rounded bg-accent-4 px-1 py-0.5 text-accent-11"
                  >
                    AUTO-DETECTED
                  </Text>
                </Flex>
                <Text
                  size="1"
                  className="line-clamp-2 text-accent-11 leading-snug"
                >
                  {report.summary}
                </Text>
              </Flex>
              <ArrowRightIcon
                size={16}
                className="flex-shrink-0 text-accent-9 group-hover:text-accent-11"
              />
            </button>
          ))}
          {reports.length > 3 && (
            <Button
              variant="ghost"
              size="1"
              onClick={() => navigateToAutonomyTasks()}
              className="self-start"
            >
              View all {reports.length} reports
              <ArrowRightIcon size={12} />
            </Button>
          )}
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {staticSuggestions.map((suggestion, index) => {
            const IconComponent = suggestion.icon;
            return (
              <button
                type="button"
                key={`${suggestion.title}-${index}`}
                onClick={() =>
                  handleStaticSuggestionClick(
                    suggestion.title,
                    suggestion.prompt,
                  )
                }
                className="group relative flex cursor-pointer items-start gap-2 rounded border border-gray-6 bg-gray-2 p-2 text-left transition-colors hover:border-accent-6 hover:bg-accent-2"
              >
                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Text size="1" weight="medium" className="text-gray-12">
                    {suggestion.title}
                  </Text>
                  <Text size="1" color="gray" className="leading-snug">
                    {suggestion.description}
                  </Text>
                </Flex>
                <IconComponent
                  size={18}
                  className="text-gray-9 group-hover:text-accent-9"
                />
              </button>
            );
          })}
        </Flex>
      )}

      {hasReports && <AutoDetectedInfoBanner />}
    </Box>
  );
}
