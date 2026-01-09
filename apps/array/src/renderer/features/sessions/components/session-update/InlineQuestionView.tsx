import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import {
  usePendingPermissionsForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import type { ToolCall } from "@features/sessions/types";
import {
  CaretRight,
  ChatCircle,
  CheckCircle,
  Circle,
} from "@phosphor-icons/react";
import { Box, Button, Checkbox, Flex, Text, TextField } from "@radix-ui/themes";
import { useCallback, useState } from "react";

interface InlineQuestionViewProps {
  toolCall: ToolCall;
  taskId: string;
  turnCancelled?: boolean;
}

interface Question {
  question: string;
  header?: string;
  options: Array<{
    label: string;
    description?: string;
  }>;
  multiSelect?: boolean;
}

interface QuestionInput {
  questions?: Question[];
  currentQuestion?: Question;
  questionIndex?: number;
  totalQuestions?: number;
  answers?: Record<string, string | string[]>;
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

  // Multi-select state
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(),
  );
  // "Other" text input state
  const [otherText, setOtherText] = useState("");
  const [isOtherSelected, setIsOtherSelected] = useState(false);

  const pendingPermission = pendingPermissions.get(toolCallId);
  const isComplete = status === "completed";
  const isPending = !!pendingPermission && !isComplete;
  const wasCancelled =
    (status === "pending" || status === "in_progress") && turnCancelled;

  // Get all questions - from questions array or build from currentQuestion
  const allQuestions: Question[] =
    input?.questions || (input?.currentQuestion ? [input.currentQuestion] : []);
  const totalQuestions = input?.totalQuestions ?? allQuestions.length;
  const questionIndex = input?.questionIndex ?? 0;
  const hasMultipleQuestions = totalQuestions > 1;

  // Current question being asked
  const currentQuestion = input?.currentQuestion || allQuestions[questionIndex];
  const questionText = currentQuestion?.question ?? "Question";
  const headerText = currentQuestion?.header;
  const isMultiSelect = currentQuestion?.multiSelect ?? false;

  // Get all answers
  const answers = input?.answers ?? {};

  // Check if we only have the "Other" option (no predefined options from Claude)
  const hasOnlyOtherOption =
    pendingPermission?.options.length === 1 &&
    pendingPermission.options[0]?.optionId === "other";

  const toggleOption = useCallback(
    (optionId: string) => {
      if (optionId === "other") {
        setIsOtherSelected((prev) => !prev);
        if (isOtherSelected) {
          setOtherText("");
        }
      } else {
        setSelectedOptions((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(optionId)) {
            newSet.delete(optionId);
          } else {
            newSet.add(optionId);
          }
          return newSet;
        });
      }
    },
    [isOtherSelected],
  );

  const handleSingleSelect = async (optionId: string) => {
    if (!pendingPermission || isResponding) return;

    if (optionId === "other") {
      setIsOtherSelected(true);
      return;
    }

    setIsResponding(true);
    try {
      await respondToPermission(taskId, toolCallId, optionId);
    } finally {
      setIsResponding(false);
    }
  };

  const handleMultiSelectSubmit = async () => {
    if (!pendingPermission || isResponding) return;
    if (selectedOptions.size === 0 && !isOtherSelected) return;

    setIsResponding(true);
    try {
      const selectedIds = Array.from(selectedOptions);
      const primaryOptionId = selectedIds.length > 0 ? selectedIds[0] : "other";

      await respondToPermission(
        taskId,
        toolCallId,
        primaryOptionId,
        selectedIds.length > 0 ? selectedIds : undefined,
        isOtherSelected ? otherText : undefined,
      );
    } finally {
      setIsResponding(false);
    }
  };

  const handleOtherSubmit = async () => {
    if (!pendingPermission || isResponding || !otherText.trim()) return;
    setIsResponding(true);
    try {
      await respondToPermission(
        taskId,
        toolCallId,
        "other",
        undefined,
        otherText.trim(),
      );
    } finally {
      setIsResponding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleOtherSubmit();
    }
  };

  // Format answer for display
  const formatAnswer = (answer: string | string[] | undefined): string => {
    if (!answer) return "";
    if (Array.isArray(answer)) return answer.join(", ");
    return answer;
  };

  // Build questions list for multi-question display
  const questionsList = hasMultipleQuestions
    ? Array.from({ length: totalQuestions }, (_, idx) => {
        const q = allQuestions[idx];
        const qText = q?.question || `Question ${idx + 1}`;
        const qHeader = q?.header || `Question ${idx + 1}`;
        const answer = answers[qText];
        const isAnswered = answer !== undefined;
        const isCurrent = idx === questionIndex && isPending;
        return { idx, qHeader, answer, isAnswered, isCurrent };
      })
    : [];

  return (
    <Box className="my-2 max-w-xl overflow-hidden rounded-lg border border-accent-6 bg-accent-2">
      {/* Header */}
      <Flex
        align="center"
        gap="2"
        className="border-accent-6 border-b px-3 py-2"
      >
        {isPending && !isResponding ? (
          <ChatCircle size={14} weight="fill" className="text-accent-9" />
        ) : isComplete ? (
          <CheckCircle size={14} weight="fill" className="text-green-9" />
        ) : (
          <DotsCircleSpinner size={14} className="text-accent-9" />
        )}
        <Text size="1" weight="medium" className="text-accent-11">
          {headerText || "Question"}
        </Text>
        {hasMultipleQuestions && (
          <Text size="1" className="ml-auto text-gray-10">
            {questionIndex + 1} of {totalQuestions}
          </Text>
        )}
      </Flex>

      {/* Multi-question progress list */}
      {hasMultipleQuestions && (
        <Box className="border-accent-6 border-b px-3 py-2">
          <Flex direction="column" gap="1">
            {questionsList.map(
              ({ idx, qHeader, isAnswered, isCurrent, answer }) => (
                <Flex key={idx} align="center" gap="2">
                  {isAnswered ? (
                    <CheckCircle
                      size={12}
                      weight="fill"
                      className="flex-shrink-0 text-green-9"
                    />
                  ) : isCurrent ? (
                    <CaretRight
                      size={12}
                      weight="bold"
                      className="flex-shrink-0 text-accent-9"
                    />
                  ) : (
                    <Circle
                      size={12}
                      weight="regular"
                      className="flex-shrink-0 text-gray-8"
                    />
                  )}
                  <Text
                    size="1"
                    className={
                      isCurrent
                        ? "text-accent-11"
                        : isAnswered
                          ? "text-gray-11"
                          : "text-gray-9"
                    }
                  >
                    {qHeader}
                  </Text>
                  {isAnswered && (
                    <>
                      <Text size="1" className="flex-shrink-0 text-gray-8">
                        —
                      </Text>
                      <Text
                        size="1"
                        className="min-w-0 flex-1 truncate text-gray-11"
                      >
                        {formatAnswer(answer)}
                      </Text>
                    </>
                  )}
                </Flex>
              ),
            )}
          </Flex>
        </Box>
      )}

      {/* Current question content (when pending) */}
      {isPending && pendingPermission.options.length > 0 && (
        <Box className="px-3 py-2">
          {/* Full question text */}
          <Text size="1" className="mb-2 block text-gray-12">
            {questionText}
          </Text>

          {/* Options */}
          {hasOnlyOtherOption ? (
            <Flex direction="column" gap="2">
              <TextField.Root
                size="1"
                placeholder="Type your answer..."
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isResponding}
                autoFocus
                className="[&_input]:text-[12px]"
              />
              <Button
                size="1"
                variant="soft"
                disabled={isResponding || wasCancelled || !otherText.trim()}
                onClick={handleOtherSubmit}
                className="self-start"
              >
                Submit
              </Button>
            </Flex>
          ) : isMultiSelect ? (
            <Flex direction="column" gap="2">
              {pendingPermission.options.map((option) => (
                <Flex key={option.optionId} align="start" gap="2">
                  <Checkbox
                    checked={
                      option.optionId === "other"
                        ? isOtherSelected
                        : selectedOptions.has(option.optionId)
                    }
                    onCheckedChange={() => toggleOption(option.optionId)}
                    disabled={isResponding || wasCancelled}
                    className="mt-0.5"
                  />
                  <Flex direction="column" gap="0">
                    <Text size="1">{option.name}</Text>
                    {option.description && (
                      <Text size="1" className="text-gray-10">
                        {option.description}
                      </Text>
                    )}
                  </Flex>
                </Flex>
              ))}
              {isOtherSelected && (
                <TextField.Root
                  size="1"
                  placeholder="Enter your response..."
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  disabled={isResponding}
                  className="ml-6 [&_input]:text-[12px]"
                />
              )}
              <Button
                size="1"
                variant="soft"
                disabled={
                  isResponding ||
                  wasCancelled ||
                  (selectedOptions.size === 0 && !isOtherSelected)
                }
                onClick={handleMultiSelectSubmit}
                className="mt-1 self-start"
              >
                Submit
              </Button>
            </Flex>
          ) : isOtherSelected ? (
            <Flex direction="column" gap="2">
              <TextField.Root
                size="1"
                placeholder="Enter your response..."
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isResponding}
                autoFocus
                className="[&_input]:text-[12px]"
              />
              <Flex gap="2">
                <Button
                  size="1"
                  variant="soft"
                  disabled={isResponding || !otherText.trim()}
                  onClick={handleOtherSubmit}
                >
                  Submit
                </Button>
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={isResponding}
                  onClick={() => {
                    setIsOtherSelected(false);
                    setOtherText("");
                  }}
                >
                  Back
                </Button>
              </Flex>
            </Flex>
          ) : (
            <Flex direction="column" gap="2">
              {pendingPermission.options.map((option) => (
                <Flex key={option.optionId} direction="column" gap="0">
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={isResponding || wasCancelled}
                    onClick={() => handleSingleSelect(option.optionId)}
                    className="justify-start"
                  >
                    {option.name}
                  </Button>
                  {option.description && (
                    <Text size="1" className="mt-0.5 ml-2 text-gray-10">
                      {option.description}
                    </Text>
                  )}
                </Flex>
              ))}
            </Flex>
          )}
        </Box>
      )}

      {/* Completed state - show answer(s) */}
      {isComplete && (
        <Box className="px-3 py-2">
          {Object.keys(answers).length > 0 ? (
            <Flex direction="column" gap="1">
              {Object.entries(answers).map(([question, answer]) => (
                <Flex key={question} align="start" gap="2">
                  <CheckCircle
                    size={12}
                    weight="fill"
                    className="mt-0.5 flex-shrink-0 text-green-9"
                  />
                  <Text size="1" className="text-gray-11">
                    {formatAnswer(answer)}
                  </Text>
                </Flex>
              ))}
            </Flex>
          ) : (
            <Text size="1" className="text-gray-10">
              Completed
            </Text>
          )}
        </Box>
      )}

      {/* Cancelled state */}
      {wasCancelled && (
        <Box className="px-3 py-2">
          <Text size="1" className="text-gray-9">
            (Cancelled)
          </Text>
        </Box>
      )}
    </Box>
  );
}
