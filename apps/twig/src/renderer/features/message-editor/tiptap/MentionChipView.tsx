import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MentionChipAttrs } from "./MentionChipNode";

function DefaultChip({
  type,
  label,
}: {
  type: string;
  label: string;
}) {
  const isCommand = type === "command";
  const prefix = isCommand ? "/" : "@";

  return (
    <span
      className={`${isCommand ? "cli-slash-command" : "cli-file-mention"} inline select-all cursor-default rounded-[var(--radius-1)] bg-[var(--accent-a3)] px-1 py-px text-xs font-medium text-[var(--accent-11)]`}
      contentEditable={false}
    >
      {prefix}
      {label}
    </span>
  );
}

export function MentionChipView({ node }: NodeViewProps) {
  const { type, label } = node.attrs as MentionChipAttrs;

  return (
    <NodeViewWrapper as="span" className="inline">
      <DefaultChip type={type} label={label} />
    </NodeViewWrapper>
  );
}
