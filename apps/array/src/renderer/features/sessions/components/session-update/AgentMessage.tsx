import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { ChatBubble } from "../ChatBubble";

interface AgentMessageProps {
  content: string;
}

export function AgentMessage({ content }: AgentMessageProps) {
  return (
    <ChatBubble variant="agent">
      <MarkdownRenderer content={content} />
    </ChatBubble>
  );
}
