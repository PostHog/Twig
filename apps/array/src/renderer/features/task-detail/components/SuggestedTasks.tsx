import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { useSuggestedTasksStore } from "../stores/suggestedTasksStore";

interface SuggestedTasksProps {
  editor: Editor | null;
}

export function SuggestedTasks({ editor }: SuggestedTasksProps) {
  const suggestions = useSuggestedTasksStore((state) => state.getSuggestions());
  const rotateSuggestions = useSuggestedTasksStore(
    (state) => state.rotateSuggestions,
  );
  const incrementUsage = useSuggestedTasksStore(
    (state) => state.incrementUsage,
  );

  const handleSuggestionClick = (suggestionTitle: string, prompt: string) => {
    if (!editor) return;

    incrementUsage(suggestionTitle);
    editor.commands.setContent(prompt);
    editor.commands.focus("end");
  };

  if (suggestions.length === 0) return null;

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
              className="group relative flex cursor-pointer items-start gap-2 rounded border border-gray-6 bg-gray-2 p-2 text-left transition-colors hover:border-orange-6 hover:bg-accent-2"
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
    </Box>
  );
}
