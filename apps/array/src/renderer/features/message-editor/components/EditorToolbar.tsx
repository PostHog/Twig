import { ModelSelector } from "@features/sessions/components/ModelSelector";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { useThinkingStore } from "@features/sessions/stores/thinkingStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Brain, Paperclip } from "@phosphor-icons/react";
import { Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { AVAILABLE_MODELS } from "@shared/types/models";
import { useRef } from "react";
import type { MentionChip } from "../utils/content";

interface EditorToolbarProps {
  disabled?: boolean;
  taskId?: string;
  onInsertChip: (chip: MentionChip) => void;
  onAttachFiles?: (files: File[]) => void;
  attachTooltip?: string;
  iconSize?: number;
}

export function EditorToolbar({
  disabled = false,
  taskId,
  onInsertChip,
  onAttachFiles,
  attachTooltip = "Attach file",
  iconSize = 14,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const session = useSessionForTask(taskId);
  const defaultModel = useSettingsStore((state) => state.defaultModel);
  const activeModel = session?.model ?? defaultModel;

  // Check if current model is Anthropic
  const isAnthropicModel = AVAILABLE_MODELS.some(
    (m) => m.id === activeModel && m.provider === "anthropic",
  );

  // Thinking state for this task
  const thinkingEnabled = useThinkingStore((state) =>
    taskId ? state.getThinking(taskId) : false,
  );
  const toggleThinking = useThinkingStore((state) => state.toggleThinking);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const filePath = (file as File & { path?: string }).path || file.name;
        onInsertChip({
          type: "file",
          id: filePath,
          label: file.name,
        });
      }
      onAttachFiles?.(fileArray);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Flex align="center" gap="1">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <Tooltip content={attachTooltip}>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={disabled}
        >
          <Paperclip size={iconSize} weight="bold" />
        </IconButton>
      </Tooltip>
      <ModelSelector taskId={taskId} disabled={disabled} />
      {isAnthropicModel && taskId && (
        <Tooltip
          content={
            thinkingEnabled
              ? "Extended thinking enabled"
              : "Extended thinking disabled"
          }
        >
          <IconButton
            size="1"
            variant="ghost"
            color={thinkingEnabled ? "red" : "gray"}
            onClick={(e) => {
              e.stopPropagation();
              toggleThinking(taskId);
            }}
            disabled={disabled}
            style={{ marginLeft: "8px" }}
          >
            <Brain
              size={iconSize}
              weight={thinkingEnabled ? "fill" : "regular"}
            />
          </IconButton>
        </Tooltip>
      )}
    </Flex>
  );
}
