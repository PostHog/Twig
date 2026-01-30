import { useAuthStore } from "@features/auth/stores/authStore";
import { useSignalReferences } from "@features/signals/hooks/useSignalReferences";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { ArrowLeftIcon, PlayIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Signal } from "@shared/types";
import { useState } from "react";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { SignalReferenceList } from "./SignalReferenceList";

interface SignalPreviewViewProps {
  signal: Signal;
}

export function SignalPreviewView({ signal }: SignalPreviewViewProps) {
  useSetHeaderContent(null);

  const { navigateToTask, navigateToTaskInput } = useNavigationStore();
  const projectId = useAuthStore((state) => state.projectId);
  const cloudRegion = useAuthStore((state) => state.cloudRegion);

  const { mutateAsync: createTask, invalidateTasks } = useCreateTask();
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const {
    data: referencesData,
    isLoading: isLoadingReferences,
    error: referencesError,
  } = useSignalReferences(signal.id);

  const replayBaseUrl = cloudRegion
    ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
    : "";

  const handleStartTask = async () => {
    // If signal already has a linked task, navigate to it
    if (signal.task) {
      navigateToTask(signal.task);
      return;
    }

    // Otherwise, create a new task from the signal
    setIsCreatingTask(true);
    try {
      const newTask = await createTask({
        description: signal.task_prompt,
        createdFrom: "command-menu",
      });
      invalidateTasks(newTask);
      navigateToTask(newTask);
    } catch (_error) {
    } finally {
      setIsCreatingTask(false);
    }
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
                Back
              </Button>
              <Box className="h-4 w-px bg-gray-6" />
              <Text
                size="1"
                className="whitespace-nowrap rounded bg-accent-4 px-1 py-0.5 text-accent-11"
              >
                AUTO-DETECTED
              </Text>
            </Flex>
            <Heading size="5">{signal.title}</Heading>
          </Flex>

          {/* Description */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Description
            </Text>
            <Box className="rounded border border-gray-6 bg-gray-2 p-3">
              <Text size="2" className="whitespace-pre-wrap text-gray-12">
                {signal.task_prompt}
              </Text>
            </Box>
          </Flex>

          {/* References section */}
          <Box>
            <SignalReferenceList
              references={referencesData?.results ?? []}
              count={referencesData?.count ?? 0}
              isLoading={isLoadingReferences}
              error={referencesError}
              replayBaseUrl={replayBaseUrl}
            />
          </Box>

          {/* Action button */}
          <Button
            variant="solid"
            size="2"
            onClick={handleStartTask}
            disabled={isCreatingTask}
          >
            <PlayIcon size={16} />
            {signal.task
              ? "View task"
              : isCreatingTask
                ? "Creating task..."
                : "Start task"}
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
