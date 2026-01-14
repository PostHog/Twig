import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE_LIMIT_FILE = ".git/arr-last-pr-refresh";
const RATE_LIMIT_MS = 60 * 1000; // 1 minute

/**
 * Get the path to the rate limit file.
 */
function getRateLimitPath(cwd: string): string {
  return join(cwd, RATE_LIMIT_FILE);
}

/**
 * Check if we should refresh PR info (rate limited to once per minute).
 */
function shouldRefreshPRInfo(cwd: string): boolean {
  const path = getRateLimitPath(cwd);

  if (!existsSync(path)) {
    return true;
  }

  try {
    const content = readFileSync(path, "utf-8");
    const lastRefresh = parseInt(content, 10);
    const now = Date.now();
    return now - lastRefresh > RATE_LIMIT_MS;
  } catch {
    return true;
  }
}

/**
 * Mark that we're starting a PR refresh (update the timestamp).
 */
function markPRRefreshStarted(cwd: string): void {
  const path = getRateLimitPath(cwd);
  writeFileSync(path, String(Date.now()));
}

/**
 * Trigger background PR info refresh if rate limit allows.
 * Spawns a detached process that runs `arr __refresh-pr-info`.
 */
export function triggerBackgroundRefresh(cwd: string): void {
  if (!shouldRefreshPRInfo(cwd)) {
    return;
  }

  // Mark as started before spawning to prevent race conditions
  markPRRefreshStarted(cwd);

  // Spawn detached process: arr __refresh-pr-info
  const scriptPath = process.argv[1];
  const child = spawn(process.argv[0], [scriptPath, "__refresh-pr-info"], {
    cwd,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
