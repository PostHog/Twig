import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSync } from "./executor";

/**
 * State persisted during conflict resolution.
 * Stored in .jj/arr-resolve-state.json
 */
export interface ResolveState {
  /** Original bookmark to return to when done */
  originalBookmark: string;
  /** Original change ID for safety checks */
  originalChangeId: string;
  /** Timestamp when resolution started */
  startedAt: string;
}

function getStatePath(cwd: string): string {
  // Find .jj directory
  const jjRoot = runSync("jj", ["root"], { cwd, onError: "ignore" });
  if (!jjRoot) return join(cwd, ".jj", "arr-resolve-state.json");
  return join(jjRoot, ".jj", "arr-resolve-state.json");
}

/**
 * Save resolve state to disk.
 */
export function saveResolveState(state: ResolveState, cwd: string): void {
  const path = getStatePath(cwd);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

/**
 * Load resolve state from disk, or null if not in resolution.
 */
export function loadResolveState(cwd: string): ResolveState | null {
  const path = getStatePath(cwd);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as ResolveState;
  } catch {
    return null;
  }
}

/**
 * Clear resolve state (resolution complete or aborted).
 */
export function clearResolveState(cwd: string): void {
  const path = getStatePath(cwd);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Check if we're currently in conflict resolution mode.
 */
export function isInResolveMode(cwd: string): boolean {
  return loadResolveState(cwd) !== null;
}
