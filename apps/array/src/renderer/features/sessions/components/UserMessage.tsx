import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { ChatBubble } from "./ChatBubble";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <ChatBubble variant="user">
      <MarkdownRenderer content={content} />
    </ChatBubble>
  );
}
