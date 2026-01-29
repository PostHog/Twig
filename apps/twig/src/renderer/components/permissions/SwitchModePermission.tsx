import { ActionSelector } from "@components/ActionSelector";
import { type BasePermissionProps, toSelectorOptions } from "./types";

export function SwitchModePermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  return (
    <ActionSelector
      title={toolCall.title ?? "Switch mode"}
      question="Approve this mode change?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
