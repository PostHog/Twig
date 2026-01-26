import { useAutonomyFeatureFlag } from "@features/autonomy/hooks/useAutonomyFeatureFlag";
import { useAutoDetectedTasks } from "@features/tasks/hooks/useTasks";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Task } from "@shared/types";

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-accent-6 bg-accent-2 p-4 text-left transition-colors hover:border-accent-8 hover:bg-accent-3"
    >
      <SparkleIcon size={20} className="mt-0.5 flex-shrink-0 text-accent-9" />
      <Flex direction="column" gap="2" style={{ flex: 1 }}>
        <Flex align="start" justify="between" gap="2">
          <Text size="3" weight="medium" className="text-accent-12">
            {task.title || "Untitled task"}
          </Text>
          <Text
            size="1"
            className="whitespace-nowrap rounded bg-accent-4 px-1.5 py-0.5 text-accent-11"
          >
            AUTO-DETECTED
          </Text>
        </Flex>
        {task.description && (
          <Text
            size="2"
            className="line-clamp-3 text-accent-11 leading-relaxed"
          >
            {task.description}
          </Text>
        )}
        <Flex align="center" gap="2" mt="1">
          <Text size="1" color="gray">
            Created {new Date(task.created_at).toLocaleDateString()}
          </Text>
        </Flex>
      </Flex>
      <ArrowRightIcon
        size={18}
        className="mt-0.5 flex-shrink-0 text-accent-9 group-hover:text-accent-11"
      />
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <Flex direction="column" gap="3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Box key={i} className="rounded-lg border border-gray-6 bg-gray-2 p-4">
          <Flex align="start" gap="3">
            <Skeleton height="20px" width="20px" className="rounded" />
            <Flex direction="column" gap="2" style={{ flex: 1 }}>
              <Skeleton height="20px" width="70%" />
              <Skeleton height="16px" width="100%" />
              <Skeleton height="16px" width="85%" />
              <Skeleton height="14px" width="30%" />
            </Flex>
          </Flex>
        </Box>
      ))}
    </Flex>
  );
}

function EmptyState() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      py="9"
      className="text-center"
    >
      <SparkleIcon size={48} className="text-gray-6" />
      <Heading size="4" color="gray">
        No auto-detected tasks yet
      </Heading>
      <Text size="2" color="gray" style={{ maxWidth: 400 }}>
        Autonomy is analyzing your user sessions. Check back soon for
        auto-detected issues and suggested tasks.
      </Text>
    </Flex>
  );
}

export function AutonomyTasksView() {
  const isAutonomyEnabled = useAutonomyFeatureFlag();
  const { navigateToTaskInput, navigateToTaskPreview } = useNavigationStore();
  const { data: tasks = [], isLoading } = useAutoDetectedTasks();

  // Feature flag gating
  if (!isAutonomyEnabled) {
    return null;
  }

  const handleTaskClick = (task: Task) => {
    navigateToTaskPreview(task);
  };

  return (
    <Flex direction="column" height="100%">
      <Box px="4" py="3" className="border-gray-6 border-b bg-gray-1">
        <Flex align="center" gap="3">
          <IconButton
            variant="ghost"
            size="1"
            onClick={() => navigateToTaskInput()}
            title="Back to task input"
          >
            <ArrowLeftIcon size={16} />
          </IconButton>
          <Flex align="center" gap="2">
            <SparkleIcon size={20} className="text-accent-9" />
            <Heading size="4">Autonomy Tasks</Heading>
          </Flex>
        </Flex>
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="4">
          <Text size="2" color="gray" mb="4" className="block">
            Tasks automatically detected from user session analysis. These
            represent potential issues or improvements identified by Autonomy.
          </Text>

          {isLoading && <LoadingSkeleton />}

          {!isLoading && tasks.length === 0 && <EmptyState />}

          {!isLoading && tasks.length > 0 && (
            <Flex direction="column" gap="3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleTaskClick(task)}
                />
              ))}
            </Flex>
          )}
        </Box>
      </ScrollArea>
    </Flex>
  );
}
