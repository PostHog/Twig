import type {
  PermissionOption,
  RequestPermissionRequest,
  ToolCallContent,
} from "@agentclientprotocol/sdk";
import type { SelectorOption } from "@components/ActionSelector";
import type { TwigToolKind, TwigToolMeta } from "@features/sessions/types";

type AcpToolCall = RequestPermissionRequest["toolCall"];
export type PermissionToolCall = Omit<AcpToolCall, "kind" | "_meta"> & {
  _meta?: TwigToolMeta | null;
  kind?: TwigToolKind | null;
};

export interface BasePermissionProps {
  toolCall: PermissionToolCall;
  options: PermissionOption[];
  onSelect: (
    optionId: string,
    customInput?: string,
    answers?: Record<string, string>,
  ) => void;
  onCancel: () => void;
}

export function toSelectorOptions(
  options: PermissionOption[],
): SelectorOption[] {
  return options.map((opt) => {
    const meta = opt._meta as
      | { description?: string; customInput?: boolean }
      | undefined;
    return {
      id: opt.optionId,
      label: opt.name,
      description: meta?.description,
      customInput: meta?.customInput,
    };
  });
}

export type DiffContent = Extract<ToolCallContent, { type: "diff" }>;
export type TerminalContent = Extract<ToolCallContent, { type: "terminal" }>;
export type StandardContent = Extract<ToolCallContent, { type: "content" }>;

export function findDiffContent(
  content: ToolCallContent[] | null | undefined,
): DiffContent | undefined {
  return content?.find((c): c is DiffContent => c.type === "diff");
}

export function findTerminalContent(
  content: ToolCallContent[] | null | undefined,
): TerminalContent | undefined {
  return content?.find((c): c is TerminalContent => c.type === "terminal");
}

export function findTextContent(
  content: ToolCallContent[] | null | undefined,
): string | undefined {
  const stdContent = content?.find(
    (c): c is StandardContent => c.type === "content",
  );
  if (stdContent?.content.type === "text") {
    return stdContent.content.text;
  }
  return undefined;
}
