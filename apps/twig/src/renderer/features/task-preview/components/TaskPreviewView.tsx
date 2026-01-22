import { useAuthStore } from "@features/auth/stores/authStore";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { ArrowLeftIcon, PlayIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Task } from "@shared/types";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { useTaskReferences } from "../hooks/useTaskReferences";
import { TaskReferenceList } from "./TaskReferenceList";

interface TaskPreviewViewProps {
  task: Task;
}

export function TaskPreviewView({ task }: TaskPreviewViewProps) {
  useSetHeaderContent(null);

  const { navigateToTask, navigateToTaskInput } = useNavigationStore();
  const projectId = useAuthStore((state) => state.projectId);
  const cloudRegion = useAuthStore((state) => state.cloudRegion);

  const showReferences = task.origin_product === "session_summaries";
  const {
    data: referencesData,
    isLoading: isLoadingReferences,
    error: referencesError,
  } = useTaskReferences(showReferences ? task.id : "");

  const replayBaseUrl = cloudRegion
    ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
    : "";

  const handleStartTask = () => {
    navigateToTask(task);
  };

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
            <Heading size="5">{task.title}</Heading>
          </Flex>

          {/* Description */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Description
            </Text>
            <Box className="rounded border border-gray-6 bg-gray-2 p-3">
              <Text size="2" className="whitespace-pre-wrap text-gray-12">
                {task.description}
              </Text>
            </Box>
          </Flex>

          {/* References section - only for session_summaries tasks */}
          {showReferences && (
            <Box>
              <TaskReferenceList
                references={referencesData?.results ?? []}
                count={referencesData?.count ?? 0}
                isLoading={isLoadingReferences}
                error={referencesError}
                replayBaseUrl={replayBaseUrl}
              />
            </Box>
          )}

          {/* Action button */}
          <Button variant="solid" size="2" onClick={handleStartTask}>
            <PlayIcon size={16} />
            Start task
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
