import { ActionSelector } from "@components/ActionSelector";
import { type BasePermissionProps, toSelectorOptions } from "./types";

export function DefaultPermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  return (
    <ActionSelector
      title={toolCall.title ?? "Permission required"}
      question="Do you want to proceed?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
