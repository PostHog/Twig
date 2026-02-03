import { execSync } from "node:child_process";
import { platform } from "node:os";
import { logger } from "./logger.js";

const log = logger.scope("process-utils");

/**
 * Kill a process and all its children by killing the process group.
 * On Unix, we use process.kill(-pid) to kill the entire process group.
 * On Windows, we use taskkill with /T flag to kill the process tree.
 */
export function killProcessTree(pid: number): void {
  try {
    if (platform() === "win32") {
      // Windows: use taskkill with /T to kill process tree
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      // Unix: kill the process group by using negative PID
      // This sends SIGTERM to all processes in the group
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // If SIGTERM fails (process may have already exited), try SIGKILL
        try {
          process.kill(-pid, "SIGKILL");
        } catch (err) {
          log.warn(`Failed to kill process group for PID ${pid}`, err);
        }
      }
    }
  } catch (err) {
    log.warn(`Failed to kill process tree for PID ${pid}`, err);
  }
}

/**
 * Check if a process is alive using signal 0.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
