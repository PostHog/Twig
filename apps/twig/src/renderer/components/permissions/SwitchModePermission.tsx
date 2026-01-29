import { ActionSelector } from "@components/ActionSelector";
import { useMemo } from "react";
import { PlanContent } from "./PlanContent";
import { type BasePermissionProps, toSelectorOptions } from "./types";

export function SwitchModePermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  const planText = useMemo(() => {
    const rawPlan = (toolCall.rawInput as { plan?: string } | undefined)?.plan;
    if (rawPlan) return rawPlan;

    const content = toolCall.content;
    if (!content || content.length === 0) return null;
    const textContent = content.find((c) => c.type === "content");
    if (textContent && "content" in textContent) {
      const inner = textContent.content as
        | { type?: string; text?: string }
        | undefined;
      if (inner?.type === "text" && inner.text) {
        return inner.text;
      }
    }
    return null;
  }, [toolCall.rawInput, toolCall.content]);

  return (
    <ActionSelector
      title="Implementation Plan"
      pendingAction={planText ? <PlanContent plan={planText} /> : undefined}
      question="Approve this plan to proceed?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
