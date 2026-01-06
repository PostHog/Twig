import { getLogGraphData, type LogGraphData } from "../log-graph";
import type { Result } from "../result";
import type { Command } from "./types";

/**
 * Get log graph data for rendering the stack view.
 * Returns raw jj output with placeholders + PR info for the CLI to render.
 */
export async function log(): Promise<Result<LogGraphData>> {
  return getLogGraphData();
}

export const logCommand: Command<LogGraphData> = {
  meta: {
    name: "log",
    description: "Show a visual overview of the current stack with PR status",
    aliases: ["l"],
    category: "info",
    core: true,
  },
  run: log,
};
