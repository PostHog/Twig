import { BaseLogEntry } from "@features/logs/components/BaseLogEntry";
import type { AgentEvent } from "@posthog/agent";
import { Code } from "@radix-ui/themes";

interface ConsoleViewProps {
  event: Extract<AgentEvent, { type: "console" }>;
}

const LEVEL_COLORS = {
  debug: "gray",
  info: "blue",
  warn: "yellow",
  error: "red",
} as const;

export function ConsoleView({ event }: ConsoleViewProps) {
  const color = LEVEL_COLORS[event.level] || "gray";

  return (
    <BaseLogEntry ts={event.ts}>
      <Code size="2" color={color} variant="ghost">
        [{event.level}] {event.message}
      </Code>
    </BaseLogEntry>
  );
}
