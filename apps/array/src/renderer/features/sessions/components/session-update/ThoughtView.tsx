import { AgentMessage } from "./AgentMessage";

interface ThoughtViewProps {
  content: string;
}

export function ThoughtView({ content }: ThoughtViewProps) {
  return <AgentMessage content={`💭 ${content}`} />;
}
