import { ModelSelector } from "@features/sessions/components/ModelSelector";
import { Paperclip } from "@phosphor-icons/react";
import { Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { useRef } from "react";
import type { MentionChip } from "../core/content";

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
    </Flex>
  );
}
