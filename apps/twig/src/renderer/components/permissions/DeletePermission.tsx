import { ActionSelector } from "@components/ActionSelector";
import { Code, Text } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { type BasePermissionProps, toSelectorOptions } from "./types";

export function DeletePermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  const filePath = toolCall.locations?.[0]?.path ?? "";

  return (
    <ActionSelector
      title={toolCall.title ?? "Delete file"}
      pendingAction={
        <>
          <Code size="1" title={filePath} className="truncate">
            {compactHomePath(filePath)}
          </Code>
          <Text size="1" color="red" mt="1" as="p">
            This action cannot be undone.
          </Text>
        </>
      }
      question="Do you want to delete this file?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
