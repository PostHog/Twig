import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useAutoDetectedTasks } from "@features/tasks/hooks/useTasks";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  SparkleIcon,
  XIcon,
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
import { useState } from "react";
import { useSuggestedTasksStore } from "../stores/suggestedTasksStore";

const AUTO_DETECTED_INFO_DISMISSED_KEY = "autoDetectedTasksInfoDismissed";

// Mock tasks for development - realistic issues from a Dropbox-like product called Hedgebox
const DEV_MOCK_AUTO_DETECTED_TASKS: Task[] = [
  {
    id: "mock-task-1",
    task_number: 1,
    slug: "fix-upload-progress-indicator",
    title: "Upload progress bar freezes at 99% for large files",
    description:
      "Multiple users observed waiting 30+ seconds with the progress bar stuck at 99% when uploading files over 100MB. The upload eventually completes but the UI doesn't reflect this, causing users to cancel and retry unnecessarily.",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    origin_product: "session_summaries",
  },
  {
    id: "mock-task-2",
    task_number: 2,
    slug: "share-link-permission-confusion",
    title: "Users confused by 'Anyone with link' vs 'Specific people' sharing",
    description:
      "Session recordings show users toggling between sharing options multiple times before giving up. Several users shared sensitive documents with 'Anyone with link' when they intended to restrict access to specific team members.",
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    origin_product: "session_summaries",
  },
  {
    id: "mock-task-3",
    task_number: 3,
    slug: "search-not-finding-recent-files",
    title: "Search fails to find files uploaded in the last hour",
    description:
      "Users searching for recently uploaded files get no results, then navigate manually through folders to find the file. Search indexing appears delayed, causing frustration and repeated search attempts.",
    created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    origin_product: "session_summaries",
  },
  {
    id: "mock-task-4",
    task_number: 4,
    slug: "drag-drop-fails-silently",
    title: "Drag and drop to folders fails silently on nested folders",
    description:
      "When dragging files to deeply nested folders (3+ levels), the drop appears to succeed but files end up in the parent folder instead. No error message is shown, leaving users confused about where their files went.",
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    origin_product: "session_summaries",
  },
  {
    id: "mock-task-5",
    task_number: 5,
    slug: "sync-conflict-resolution-unclear",
    title: "Sync conflict modal doesn't show file preview or timestamps",
    description:
      "When a sync conflict occurs, users must choose between 'Keep local' or 'Keep remote' without seeing the actual content differences or when each version was modified. Most users pick randomly or cancel entirely.",
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    origin_product: "session_summaries",
  },
];

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

interface AnalystSetupCTAProps {
  onSetup: () => void;
}

function AnalystSetupCTA({ onSetup }: AnalystSetupCTAProps) {
  return (
    <Box
      mt="3"
      p="3"
      className="rounded border border-gray-7 border-dashed bg-gray-1"
    >
      <Flex direction="column" align="center" gap="2">
        <Text size="1" color="gray" align="center">
          Detect issues from real product usage.
          <br />
          <strong>Analyst</strong> continuously analyzes user sessions for you,
          looking for issues.
          <br />
          Each suggested task above addresses a potential issue.
        </Text>
        <Button size="1" variant="soft" onClick={onSetup}>
          <SparkleIcon size={14} />
          Set up Analyst
        </Button>
      </Flex>
    </Box>
  );
}

interface AutoDetectedInfoBannerProps {
  onDismiss: () => void;
}

function AutoDetectedInfoBanner({ onDismiss }: AutoDetectedInfoBannerProps) {
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
          <strong>Analyst</strong> continuously analyzes user sessions for you,
          looking for issues.
          <br />
          Each suggested task above addresses a potential issue.
        </Text>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={onDismiss}
          title="Dismiss"
          className="flex-shrink-0"
        >
          <XIcon size={12} />
        </IconButton>
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

  const { data: fetchedAutoDetectedTasks = [], isLoading: isFetching } =
    useAutoDetectedTasks();

  // In development, use mock tasks for testing
  const isDev = import.meta.env.DEV;
  const autoDetectedTasks = isDev
    ? DEV_MOCK_AUTO_DETECTED_TASKS
    : fetchedAutoDetectedTasks;
  const isLoading = isDev ? false : isFetching;

  const [hasAutoDetectedTasks, setHasAutoDetectedTasks] = useState(isDev);

  // Track if the info banner has been dismissed (persisted to localStorage)
  const [isInfoDismissed, setIsInfoDismissed] = useState(() => {
    return localStorage.getItem(AUTO_DETECTED_INFO_DISMISSED_KEY) === "true";
  });

  const handleDismissInfo = () => {
    setIsInfoDismissed(true);
    localStorage.setItem(AUTO_DETECTED_INFO_DISMISSED_KEY, "true");
  };

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
    return !isAnalystConfigured ? (
      <AnalystSetupCTA onSetup={() => setHasAutoDetectedTasks(true)} />
    ) : null;
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
                    className="grow text-pretty text-accent-12"
                  >
                    {task.title}
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

      {!isAnalystConfigured && (
        <AnalystSetupCTA onSetup={() => setHasAutoDetectedTasks(true)} />
      )}
      {hasAutoDetectedTasks && !isInfoDismissed && (
        <AutoDetectedInfoBanner onDismiss={handleDismissInfo} />
      )}
    </Box>
  );
}
