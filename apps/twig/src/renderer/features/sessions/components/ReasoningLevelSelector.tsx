import { Select, Text } from "@radix-ui/themes";
import {
  type CodexReasoningLevel,
  useCodexReasoningLevelForTask,
  useSessionActions,
  useSessionForTask,
} from "../stores/sessionStore";

interface ReasoningLevelSelectorProps {
  taskId?: string;
  disabled?: boolean;
}

const REASONING_LEVELS: { value: CodexReasoningLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

function supportsConfigurableReasoning(model: string | undefined): boolean {
  if (!model) return false;
  const normalizedModel = model.toLowerCase();
  return normalizedModel.includes("gpt-5.2");
}

function extractReasoningFromModelId(
  modelId: string | undefined,
): CodexReasoningLevel | undefined {
  if (!modelId) return undefined;
  const match = modelId.match(/\/(low|medium|high|xhigh)$/);
  return match ? (match[1] as CodexReasoningLevel) : undefined;
}

export function ReasoningLevelSelector({
  taskId,
  disabled,
}: ReasoningLevelSelectorProps) {
  const { setCodexReasoningLevel } = useSessionActions();
  const session = useSessionForTask(taskId);
  const reasoningLevel = useCodexReasoningLevelForTask(taskId);

  const isCodex = session?.adapter === "codex";
  const hasConfigurableReasoning = supportsConfigurableReasoning(
    session?.model,
  );

  if (!isCodex || !hasConfigurableReasoning) {
    return null;
  }

  const levelFromModelId = extractReasoningFromModelId(session?.model);
  const activeLevel = reasoningLevel ?? levelFromModelId ?? "medium";

  const handleChange = (value: string) => {
    if (taskId && session?.status === "connected" && !session.isCloud) {
      setCodexReasoningLevel(taskId, value as CodexReasoningLevel);
    }
  };

  return (
    <Select.Root
      value={activeLevel}
      onValueChange={handleChange}
      disabled={disabled}
      size="1"
    >
      <Select.Trigger
        variant="ghost"
        style={{
          fontSize: "var(--font-size-1)",
          color: "var(--gray-11)",
          padding: "4px 8px",
          marginLeft: "4px",
          height: "auto",
          minHeight: "unset",
        }}
      >
        <Text size="1" style={{ fontFamily: "var(--font-mono)" }}>
          Reasoning:{" "}
          {REASONING_LEVELS.find((l) => l.value === activeLevel)?.label}
        </Text>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {REASONING_LEVELS.map((level) => (
          <Select.Item key={level.value} value={level.value}>
            {level.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
