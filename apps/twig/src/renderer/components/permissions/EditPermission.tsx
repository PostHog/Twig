import { ActionSelector } from "@components/ActionSelector";
import { CodePreview } from "@features/sessions/components/session-update/CodePreview";
import { getFilename } from "@features/sessions/components/session-update/toolCallUtils";
import { Code } from "@radix-ui/themes";
import {
  type BasePermissionProps,
  findDiffContent,
  toSelectorOptions,
} from "./types";

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
        newText ? (
          <CodePreview
            content={newText}
            filePath={filePath}
            oldContent={isNewFile ? null : oldText}
            showPath
          />
        ) : null
      }
      question={
        isNewFile ? (
          <>
            Do you want to create{" "}
            <Code variant="ghost" weight="bold">
              {getFilename(filePath)}
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
