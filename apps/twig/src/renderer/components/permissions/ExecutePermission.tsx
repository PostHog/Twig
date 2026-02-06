import { ActionSelector } from "@components/ActionSelector";
import { Code } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import {
  type BasePermissionProps,
  findTextContent,
  toSelectorOptions,
} from "./types";

export function ExecutePermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  const command = findTextContent(toolCall.content);

  return (
    <ActionSelector
      title={toolCall.title ?? "Execute command"}
      pendingAction={
        command ? (
          <Code variant="ghost" size="1" title={command}>
            {compactHomePath(command)}
          </Code>
        ) : undefined
      }
      question="Do you want to proceed?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
