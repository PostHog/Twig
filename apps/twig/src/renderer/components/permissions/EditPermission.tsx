import { ActionSelector } from "@components/ActionSelector";
import { InlineDiffPreview } from "@features/sessions/components/session-update/InlineDiffPreview";
import { NewFilePreview } from "@features/sessions/components/session-update/NewFilePreview";
import { Code } from "@radix-ui/themes";
import {
  type BasePermissionProps,
  findDiffContent,
  toSelectorOptions,
} from "./types";

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

export function EditPermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  const diff = findDiffContent(toolCall.content);
  const filePath = diff?.path ?? toolCall.locations?.[0]?.path ?? "";
  const oldText = diff?.oldText;
  const newText = diff?.newText;
  const isNewFile = diff && !oldText;

  return (
    <ActionSelector
      title={isNewFile ? "Create new file" : (toolCall.title ?? "Edit file")}
      pendingAction={
        diff && !isNewFile && oldText && newText ? (
          <InlineDiffPreview
            oldText={oldText}
            newText={newText}
            filePath={filePath}
            showPath
          />
        ) : isNewFile && newText ? (
          <NewFilePreview content={newText} filePath={filePath} showPath />
        ) : null
      }
      question={
        isNewFile ? (
          <>
            Do you want to create{" "}
            <Code variant="ghost" weight="bold">
              {getFileName(filePath)}
            </Code>
            ?
          </>
        ) : (
          "Do you want to apply this edit?"
        )
      }
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
