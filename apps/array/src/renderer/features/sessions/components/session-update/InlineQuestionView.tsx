import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { ToolCall } from "@features/sessions/types";
import {
  usePendingPermissionsForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import { ChatCircle, CheckCircle } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";

interface InlineQuestionViewProps {
  toolCall: ToolCall;
  taskId: string;
  turnCancelled?: boolean;
}

interface QuestionInput {
  questions?: Array<{
    question: string;
    header?: string;
    options: Array<{
      label: string;
      description?: string;
    }>;
    multiSelect?: boolean;
  }>;
  answers?: Record<string, string>;
}

export function InlineQuestionView({
  toolCall,
  taskId,
  turnCancelled,
}: InlineQuestionViewProps) {
  const { toolCallId, rawInput, status } = toolCall;
  const input = rawInput as QuestionInput | undefined;
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const { respondToPermission } = useSessionActions();
  const [isResponding, setIsResponding] = useState(false);

  const pendingPermission = pendingPermissions.get(toolCallId);
  const isComplete = status === "completed";
  const isPending = !!pendingPermission && !isComplete;
  const wasCancelled = (status === "pending" || status === "in_progress") && turnCancelled;

  const firstQuestion = input?.questions?.[0];
  const questionText = firstQuestion?.question ?? "Question";
  const selectedAnswer = input?.answers?.[questionText];

  const handleOptionClick = async (optionId: string) => {
    if (!pendingPermission || isResponding) return;
    setIsResponding(true);
    try {
      await respondToPermission(taskId, toolCallId, optionId);
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <Box className="my-2 max-w-xl overflow-hidden rounded-lg border border-accent-6 bg-accent-2">
      {/* Header */}
      <Flex align="center" gap="2" className="border-accent-6 border-b px-3 py-2">
        {isPending && !isResponding ? (
          <ChatCircle size={14} weight="fill" className="text-accent-9" />
        ) : isComplete ? (
          <CheckCircle size={14} weight="fill" className="text-green-9" />
        ) : (
          <DotsCircleSpinner size={14} className="text-accent-9" />
        )}
        <Text size="2" weight="medium" className="text-accent-11">
          {firstQuestion?.header ?? "Question"}
        </Text>
      </Flex>

      {/* Question text */}
      <Box className="px-3 py-3">
        <Text size="2" className="text-gray-12">
          {questionText}
        </Text>
      </Box>

      {/* Options or Answer */}
      {isPending && pendingPermission.options.length > 0 ? (
        <Flex gap="2" wrap="wrap" className="border-accent-6 border-t px-3 py-3">
          {pendingPermission.options.map((option) => (
            <Button
              key={option.optionId}
              size="1"
              variant="soft"
              color="gray"
              disabled={isResponding || wasCancelled}
              onClick={() => handleOptionClick(option.optionId)}
            >
              {option.name}
            </Button>
          ))}
        </Flex>
      ) : selectedAnswer ? (
        <Box className="border-accent-6 border-t px-3 py-2">
          <Flex align="center" gap="2">
            <Text size="1" className="text-gray-10">
              Answer:
            </Text>
            <Text size="2" weight="medium" className="text-accent-11">
              {selectedAnswer}
            </Text>
          </Flex>
        </Box>
      ) : wasCancelled ? (
        <Box className="border-accent-6 border-t px-3 py-2">
          <Text size="1" className="text-gray-9">
            (Cancelled)
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
