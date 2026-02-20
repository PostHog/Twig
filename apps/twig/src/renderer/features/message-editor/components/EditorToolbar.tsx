import { ModelSelector } from "@features/sessions/components/ModelSelector";
import { ReasoningLevelSelector } from "@features/sessions/components/ReasoningLevelSelector";
import { Paperclip } from "@phosphor-icons/react";
import { Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { useRef } from "react";
import type { FileAttachment } from "../utils/content";

interface EditorToolbarProps {
  disabled?: boolean;
  taskId?: string;
  adapter?: "claude" | "codex";
  onAddAttachment: (attachment: FileAttachment) => void;
  onAttachFiles?: (files: File[]) => void;
  attachTooltip?: string;
  iconSize?: number;
  /** Hide model and reasoning selectors (when rendered separately) */
  hideSelectors?: boolean;
}

export function EditorToolbar({
  disabled = false,
  taskId,
  adapter,
  onAddAttachment,
  onAttachFiles,
  attachTooltip = "Attach file",
  iconSize = 14,
  hideSelectors = false,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const filePath = (file as File & { path?: string }).path || file.name;
        onAddAttachment({ id: filePath, label: file.name });
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
      {!hideSelectors && (
        <>
          <ModelSelector
            taskId={taskId}
            adapter={adapter}
            disabled={disabled}
          />
          <ReasoningLevelSelector taskId={taskId} disabled={disabled} />
        </>
      )}
    </Flex>
  );
}
