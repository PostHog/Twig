import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useAutoDetectedTasks } from "@features/tasks/hooks/useTasks";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  SparkleIcon,
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
import type { Task } from "@shared/types";
import { useSuggestedTasksStore } from "../stores/suggestedTasksStore";

interface SuggestedTasksProps {
  editorRef: React.RefObject<MessageEditorHandle | null>;
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

function AnalystSetupCTA() {
  const handleSetupClick = () => {};

  return (
    <Box
      mt="3"
      p="3"
      className="rounded border border-gray-7 border-dashed bg-gray-1"
    >
      <Flex direction="column" align="center" gap="2">
        <Text size="1" color="gray" align="center">
          Detect issues from real product usage
        </Text>
        <Button size="1" variant="soft" onClick={handleSetupClick}>
          <SparkleIcon size={14} />
          Set up Analyst
        </Button>
      </Flex>
    </Box>
  );
}

export function SuggestedTasks({ editorRef }: SuggestedTasksProps) {
  const staticSuggestions = useSuggestedTasksStore((state) =>
    state.getSuggestions(),
  );
  const rotateSuggestions = useSuggestedTasksStore(
    (state) => state.rotateSuggestions,
  );
  const incrementUsage = useSuggestedTasksStore(
    (state) => state.incrementUsage,
  );
  const { navigateToTaskPreview } = useNavigationStore();

  const { data: autoDetectedTasks = [], isLoading } = useAutoDetectedTasks();
  const hasAutoDetectedTasks = autoDetectedTasks.length > 0;

  // Show CTA if user hasn't used Analyst yet (no session_summaries tasks exist)
  const isAnalystConfigured = hasAutoDetectedTasks;

  const handleStaticSuggestionClick = (
    suggestionTitle: string,
    prompt: string,
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    incrementUsage(suggestionTitle);
    editor.setContent(prompt);
  };

  const handleAutoDetectedTaskClick = (task: Task) => {
    navigateToTaskPreview(task);
  };

  if (staticSuggestions.length === 0 && !hasAutoDetectedTasks && !isLoading) {
    return !isAnalystConfigured ? <AnalystSetupCTA /> : null;
  }

  return (
    <Box mt="3">
      <Flex align="center" justify="between" mb="2">
        <Text size="1" color="gray" weight="medium">
          Suggested tasks
        </Text>
        {!hasAutoDetectedTasks && (
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

      {isLoading && <LoadingSkeleton />}

      {!isLoading && hasAutoDetectedTasks && (
        <Flex direction="column" gap="2">
          {autoDetectedTasks.slice(0, 3).map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={() => handleAutoDetectedTaskClick(task)}
              className="group relative flex cursor-pointer items-start gap-2 rounded border border-accent-6 bg-accent-2 p-2 text-left transition-colors hover:border-accent-8 hover:bg-accent-3"
            >
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Flex align="start" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="text-pretty text-accent-12"
                  >
                    {task.title}
                  </Text>
                  <Text
                    size="1"
                    className="whitespace-nowrap rounded bg-accent-4 px-1 py-0.5 text-accent-11"
                  >
                    AUTO-DETECTED
                  </Text>
                </Flex>
                <Text
                  size="1"
                  className="line-clamp-2 text-accent-11 leading-snug"
                >
                  {task.description}
                </Text>
              </Flex>
              <ArrowRightIcon
                size={16}
                className="flex-shrink-0 text-accent-9 group-hover:text-accent-11"
              />
            </button>
          ))}
        </Flex>
      )}

      {!isLoading && !hasAutoDetectedTasks && (
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

      {!isAnalystConfigured && <AnalystSetupCTA />}
    </Box>
  );
}
