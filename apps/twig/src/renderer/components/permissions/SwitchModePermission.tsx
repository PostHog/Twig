import { ActionSelector } from "@components/ActionSelector";
import { isSwitchModeToolMeta } from "@posthog/agent/adapters/claude/tool-meta";
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
    const meta = toolCall._meta;
    if (meta && isSwitchModeToolMeta(meta)) {
      return meta.switch_mode.plan ?? null;
    }

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
  }, [toolCall._meta, toolCall.content]);

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
