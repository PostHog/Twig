import type {
  LoadSessionRequest,
  NewSessionRequest,
} from "@agentclientprotocol/sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export function parseMcpServers(
  params: NewSessionRequest | LoadSessionRequest,
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {};
  if (!Array.isArray(params.mcpServers)) {
    return mcpServers;
  }

  for (const server of params.mcpServers) {
    if ("type" in server) {
      mcpServers[server.name] = {
        type: server.type,
        url: server.url,
        headers: server.headers
          ? Object.fromEntries(server.headers.map((e) => [e.name, e.value]))
          : undefined,
      };
    } else {
      mcpServers[server.name] = {
        type: "stdio",
        command: server.command,
        args: server.args,
        env: server.env
          ? Object.fromEntries(server.env.map((e) => [e.name, e.value]))
          : undefined,
      };
    }
  }

  return mcpServers;
}
