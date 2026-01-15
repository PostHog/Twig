import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanup,
  getLogPath,
  getWorkspacePath,
  isRunning,
  type RepoEntry,
  readPid,
  readRepos,
} from "../daemon/pid";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

// Get the path to the daemon process script
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_PROCESS_PATH = join(__dirname, "../daemon/daemon-process.ts");

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  repos: Array<{ path: string; workspaces: string[] }>;
  logPath: string;
}

/**
 * Start the global daemon process
 */
export async function daemonStart(): Promise<Result<void>> {
  if (isRunning()) {
    return err(createError("DAEMON_RUNNING", "Daemon is already running"));
  }

  // Spawn detached daemon process
  const proc = spawn("bun", [DAEMON_PROCESS_PATH], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });

  proc.unref();

  // Give it a moment to start and write PID
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Verify it started
  if (!isRunning()) {
    return err(createError("COMMAND_FAILED", "Failed to start daemon"));
  }

  return ok(undefined);
}

/**
 * Stop the global daemon process
 */
export async function daemonStop(): Promise<Result<void>> {
  const pid = readPid();

  if (!pid || !isRunning()) {
    return err(createError("DAEMON_NOT_RUNNING", "Daemon is not running"));
  }

  try {
    process.kill(pid, "SIGTERM");
    cleanup();
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to stop daemon: ${e}`));
  }
}

/**
 * Get daemon status
 */
export async function daemonStatus(): Promise<Result<DaemonStatus>> {
  const running = isRunning();
  const pid = running ? (readPid() ?? undefined) : undefined;
  const logPath = getLogPath();

  // Filter repos to only include workspaces that actually exist
  const rawRepos = readRepos();
  const repos: RepoEntry[] = [];
  for (const repo of rawRepos) {
    const validWorkspaces = repo.workspaces.filter((ws) => {
      const wsPath = getWorkspacePath(repo.path, ws);
      return existsSync(wsPath);
    });
    if (validWorkspaces.length > 0) {
      repos.push({ path: repo.path, workspaces: validWorkspaces });
    }
  }

  return ok({ running, pid, repos, logPath });
}

/**
 * Restart the daemon (stop if running, then start)
 */
export async function daemonRestart(): Promise<Result<void>> {
  // Stop if running (ignore errors if not running)
  if (isRunning()) {
    const stopResult = await daemonStop();
    if (!stopResult.ok) return stopResult;

    // Brief pause to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return daemonStart();
}

export const daemonStartCommand: Command<void, []> = {
  meta: {
    name: "daemon start",
    description: "Start the global workspace sync daemon",
    category: "management",
  },
  run: daemonStart,
};

export const daemonStopCommand: Command<void, []> = {
  meta: {
    name: "daemon stop",
    description: "Stop the global workspace sync daemon",
    category: "management",
  },
  run: daemonStop,
};

export const daemonStatusCommand: Command<DaemonStatus, []> = {
  meta: {
    name: "daemon status",
    description: "Check daemon status and watched repos",
    category: "management",
  },
  run: daemonStatus,
};

export const daemonRestartCommand: Command<void, []> = {
  meta: {
    name: "daemon restart",
    description: "Restart the daemon",
    category: "management",
  },
  run: daemonRestart,
};
