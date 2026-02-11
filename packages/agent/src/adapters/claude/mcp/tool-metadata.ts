import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "../../../utils/logger.js";

export interface McpToolMetadata {
  readOnly: boolean;
}

const mcpToolMetadataCache: Map<string, McpToolMetadata> = new Map();

function buildToolKey(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

function isHttpMcpServer(
  config: McpServerConfig,
): config is McpServerConfig & { type: "http"; url: string } {
  return config.type === "http" && typeof (config as any).url === "string";
}

async function fetchToolsFromHttpServer(
  _serverName: string,
  config: McpServerConfig & { type: "http"; url: string },
): Promise<Tool[]> {
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: (config as any).headers || {},
    },
  });

  const client = new Client({
    name: "twig-metadata-fetcher",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools;
  } finally {
    await client.close().catch(() => {});
  }
}

function extractToolMetadata(tool: Tool): McpToolMetadata {
  return {
    readOnly: tool.annotations?.readOnlyHint === true,
  };
}

export async function fetchMcpToolMetadata(
  mcpServers: Record<string, McpServerConfig>,
  logger: Logger = new Logger({ debug: false, prefix: "[McpToolMetadata]" }),
): Promise<void> {
  const fetchPromises: Promise<void>[] = [];

  for (const [serverName, config] of Object.entries(mcpServers)) {
    if (!isHttpMcpServer(config)) {
      continue;
    }

    const fetchPromise = fetchToolsFromHttpServer(serverName, config)
      .then((tools) => {
        const toolCount = tools.length;
        const readOnlyCount = tools.filter(
          (t) => t.annotations?.readOnlyHint === true,
        ).length;

        for (const tool of tools) {
          const toolKey = buildToolKey(serverName, tool.name);
          mcpToolMetadataCache.set(toolKey, extractToolMetadata(tool));
        }

        logger.info("Fetched MCP tool metadata", {
          serverName,
          toolCount,
          readOnlyCount,
        });
      })
      .catch((error) => {
        logger.error("Failed to fetch MCP tool metadata", {
          serverName,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    fetchPromises.push(fetchPromise);
  }

  await Promise.all(fetchPromises);
}

export function isMcpToolReadOnly(toolName: string): boolean {
  const metadata = mcpToolMetadataCache.get(toolName);
  return metadata?.readOnly === true;
}

export function clearMcpToolMetadataCache(): void {
  mcpToolMetadataCache.clear();
}
