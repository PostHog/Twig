import type { Engine } from "../engine";
import { getCurrentGitBranch } from "../git/status";
import {
  type CachedPRInfo,
  getLogGraphData,
  type LogGraphData,
} from "../log-graph";
import { ok, type Result } from "../result";
import type { Command } from "./types";

export type { CachedPRInfo };

export interface LogOptions {
  trunk?: string;
  engine: Engine;
  cwd?: string;
}

export interface LogResult {
  data: LogGraphData;
  /** Git branch name if on an unmanaged branch, null otherwise */
  unmanagedBranch: string | null;
}

/**
 * Get log graph data for rendering the stack view.
 * Returns raw jj output with placeholders + PR info for the CLI to render.
 * Only shows tracked bookmarks from the engine (plus working copy).
 */
export async function log(options: LogOptions): Promise<Result<LogResult>> {
  const { engine, trunk, cwd = process.cwd() } = options;

  const trackedBookmarks = engine.getTrackedBookmarks();

  // Check if on an unmanaged git branch
  const gitBranch = await getCurrentGitBranch(cwd);
  const isOnUnmanagedBranch =
    gitBranch !== null && gitBranch !== trunk && !engine.isTracked(gitBranch);

  // Build cache from engine
  const cachedPRInfo = new Map<string, CachedPRInfo>();
  for (const bookmark of trackedBookmarks) {
    const meta = engine.getMeta(bookmark);
    if (meta?.prInfo) {
      cachedPRInfo.set(bookmark, {
        number: meta.prInfo.number,
        state: meta.prInfo.state,
        url: meta.prInfo.url,
      });
    }
  }

  const dataResult = await getLogGraphData({
    trunk,
    trackedBookmarks,
    cachedPRInfo: cachedPRInfo.size > 0 ? cachedPRInfo : undefined,
  });

  if (!dataResult.ok) {
    return dataResult;
  }

  return ok({
    data: dataResult.value,
    unmanagedBranch: isOnUnmanagedBranch ? gitBranch : null,
  });
}

export const logCommand: Command<LogResult, [LogOptions]> = {
  meta: {
    name: "log",
    description: "Show a visual overview of the current stack with PR status",
    aliases: ["l"],
    category: "info",
    core: true,
  },
  run: log,
};
