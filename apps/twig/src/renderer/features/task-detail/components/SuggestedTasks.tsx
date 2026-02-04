import { useAutonomyFeatureFlag } from "@features/autonomy/hooks/useAutonomyFeatureFlag";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { ArrowsClockwiseIcon, SparkleIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { useSuggestedTasksStore } from "../stores/suggestedTasksStore";

interface SuggestedTasksProps {
  editorRef: React.RefObject<MessageEditorHandle | null>;
  selectedDirectory: string;
}

interface AutonomySetupCTAProps {
  onSetup: () => void;
  repoName: string | null;
}

function AutonomySetupCTA({ onSetup, repoName }: AutonomySetupCTAProps) {
  const isDisabled = !repoName;

  return (
    <Box
      mt="3"
      p="3"
      className="rounded border border-gray-7 border-dashed bg-gray-1"
    >
      <Flex direction="column" align="center" gap="2">
        <Text size="1" color="gray" align="center">
          <strong>Let your product build itself.</strong>
          <br />
          Twig Autonomy continuously identifies high-impact tasks by analyzing
          your product's usage and operations. Ship what matters, faster than
          ever.
        </Text>
        <Button
          size="1"
          variant="soft"
          onClick={onSetup}
          disabled={isDisabled}
          title={isDisabled ? "Select a repository first" : undefined}
        >
          {repoName ? `Set up Autonomy for ${repoName}` : "Set up Autonomy"}
          <SparkleIcon size={14} />
        </Button>
      </Flex>
    </Box>
  );
}

export function SuggestedTasks({
  editorRef,
  selectedDirectory,
}: SuggestedTasksProps) {
  const isAutonomyEnabled = useAutonomyFeatureFlag();
  const suggestions = useSuggestedTasksStore((state) => state.getSuggestions());
  const rotateSuggestions = useSuggestedTasksStore(
    (state) => state.rotateSuggestions,
  );
  const incrementUsage = useSuggestedTasksStore(
    (state) => state.incrementUsage,
  );
  const { navigateToAutonomyOnboarding } = useNavigationStore();
  const repoName = selectedDirectory?.split("/").pop() || null;

  const handleSuggestionClick = (suggestionTitle: string, prompt: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    incrementUsage(suggestionTitle);
    editor.setContent(prompt);
  };

  // Show Autonomy setup CTA if no suggestions and feature flag is enabled
  if (suggestions.length === 0) {
    if (!isAutonomyEnabled) {
      return null;
    }
    return (
      <AutonomySetupCTA
        onSetup={navigateToAutonomyOnboarding}
        repoName={repoName}
      />
    );
  }

  return (
    <Box mt="3">
      <Flex align="center" justify="between" mb="2">
        <Text size="1" color="gray" weight="medium">
          Suggested tasks
        </Text>
        <IconButton
          size="1"
          variant="ghost"
          onClick={rotateSuggestions}
          title="Show different suggestions"
        >
          <ArrowsClockwiseIcon size={14} />
        </IconButton>
      </Flex>

      <Flex direction="column" gap="2">
        {suggestions.map((suggestion, index) => {
          const IconComponent = suggestion.icon;
          return (
            <button
              type="button"
              key={`${suggestion.title}-${index}`}
              onClick={() =>
                handleSuggestionClick(suggestion.title, suggestion.prompt)
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

      {isAutonomyEnabled && (
        <AutonomySetupCTA
          onSetup={navigateToAutonomyOnboarding}
          repoName={repoName}
        />
      )}
    </Box>
  );
}
