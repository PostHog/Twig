import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { Query } from "@anthropic-ai/claude-agent-sdk";

const UNSUPPORTED_COMMANDS = [
  "context",
  "cost",
  "login",
  "logout",
  "output-style:new",
  "release-notes",
  "todos",
];

export async function getAvailableSlashCommands(
  q: Query,
): Promise<AvailableCommand[]> {
  const commands = await q.supportedCommands();

  return commands
    .map((command) => {
      const input = command.argumentHint
        ? { hint: command.argumentHint }
        : null;
      let name = command.name;
      if (command.name.endsWith(" (MCP)")) {
        name = `mcp:${name.replace(" (MCP)", "")}`;
      }
      return {
        name,
        description: command.description || "",
        input,
      };
    })
    .filter(
      (command: AvailableCommand) =>
        !UNSUPPORTED_COMMANDS.includes(command.name),
    );
}
