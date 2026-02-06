import { exec } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import { injectable, preDestroy } from "inversify";
import { logger } from "../../lib/logger.js";
import { isProcessAlive, killProcessTree } from "../../lib/process-utils.js";

const log = logger.scope("process-tracking");
const execAsync = promisify(exec);

export type ProcessCategory = "shell" | "agent" | "child";

export interface TrackedProcess {
  pid: number;
  category: ProcessCategory;
  label: string;
  registeredAt: number;
  taskId?: string;
  metadata?: Record<string, string>;
}

export interface DiscoveredProcess {
  pid: number;
  ppid: number;
  command: string;
  tracked: boolean;
}

export interface ProcessSnapshot {
  tracked: Record<ProcessCategory, TrackedProcess[]>;
  discovered?: DiscoveredProcess[];
  timestamp: number;
}

@injectable()
export class ProcessTrackingService {
  private _isShuttingDown = false;

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  private processes = new Map<number, TrackedProcess>();
  private taskProcesses = new Map<string, Set<number>>();

  register(
    pid: number,
    category: ProcessCategory,
    label: string,
    metadata?: Record<string, string>,
    taskId?: string,
  ): void {
    // Clean up previous entry if PID was already tracked under a different task
    this.removeFromTaskIndex(pid);

    this.processes.set(pid, {
      pid,
      category,
      label,
      registeredAt: Date.now(),
      taskId,
      metadata,
    });

    if (taskId) {
      let pids = this.taskProcesses.get(taskId);
      if (!pids) {
        pids = new Set();
        this.taskProcesses.set(taskId, pids);
      }
      pids.add(pid);
    }

    log.info(
      `Registered process: pid=${pid} category=${category} label=${label}${taskId ? ` taskId=${taskId}` : ""}`,
    );
  }

  unregister(pid: number, reason: string): void {
    const proc = this.processes.get(pid);
    if (proc) {
      this.removeFromTaskIndex(pid);
      this.processes.delete(pid);
      log.info(
        `Unregistered process: pid=${pid} category=${proc.category} label=${proc.label} reason=${reason}`,
      );
    }
  }

  private removeFromTaskIndex(pid: number): void {
    const proc = this.processes.get(pid);
    if (proc?.taskId) {
      const pids = this.taskProcesses.get(proc.taskId);
      if (pids) {
        pids.delete(pid);
        if (pids.size === 0) {
          this.taskProcesses.delete(proc.taskId);
        }
      }
    }
  }

  getAll(): TrackedProcess[] {
    return Array.from(this.processes.values());
  }

  getByCategory(category: ProcessCategory): TrackedProcess[] {
    return this.getAll().filter((p) => p.category === category);
  }

  async getSnapshot(includeDiscovered = false): Promise<ProcessSnapshot> {
    // Prune dead PIDs
    for (const [pid] of this.processes) {
      if (!isProcessAlive(pid)) {
        this.unregister(pid, "pruned-dead");
      }
    }

    const tracked: Record<ProcessCategory, TrackedProcess[]> = {
      shell: [],
      agent: [],
      child: [],
    };

    for (const proc of this.processes.values()) {
      tracked[proc.category].push(proc);
    }

    const snapshot: ProcessSnapshot = {
      tracked,
      timestamp: Date.now(),
    };

    if (includeDiscovered) {
      snapshot.discovered = await this.discoverChildren();
    }

    return snapshot;
  }

  /**
   * Uses `ps` to find all descendant processes of the Electron app,
   * and flags which are tracked vs untracked.
   */
  async discoverChildren(): Promise<DiscoveredProcess[]> {
    if (platform() === "win32") {
      // Not implemented for Windows
      return [];
    }

    const appPid = process.pid;

    let stdout: string;
    try {
      const result = await execAsync(
        `ps -eo pid,ppid,comm --no-headers 2>/dev/null || ps -eo pid,ppid,comm`,
      );
      stdout = result.stdout;
    } catch (error) {
      log.warn("Failed to discover child processes", error);
      return [];
    }

    const allProcesses: { pid: number; ppid: number; command: string }[] = [];

    for (const line of stdout.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = Number.parseInt(parts[0], 10);
        const ppid = Number.parseInt(parts[1], 10);
        const command = parts.slice(2).join(" ");
        if (!Number.isNaN(pid) && !Number.isNaN(ppid)) {
          allProcesses.push({ pid, ppid, command });
        }
      }
    }

    // Build a set of all descendant PIDs
    const descendants = new Set<number>();
    const findDescendants = (parentPid: number): void => {
      for (const p of allProcesses) {
        if (p.ppid === parentPid && !descendants.has(p.pid)) {
          descendants.add(p.pid);
          findDescendants(p.pid);
        }
      }
    };

    findDescendants(appPid);

    const trackedPids = new Set(this.processes.keys());
    const discovered: DiscoveredProcess[] = [];

    for (const p of allProcesses) {
      if (descendants.has(p.pid)) {
        discovered.push({
          pid: p.pid,
          ppid: p.ppid,
          command: p.command,
          tracked: trackedPids.has(p.pid),
        });
      }
    }

    return discovered;
  }

  isAlive(pid: number): boolean {
    return isProcessAlive(pid);
  }

  kill(pid: number): void {
    killProcessTree(pid);
    this.unregister(pid, "killed");
  }

  getByTaskId(taskId: string): TrackedProcess[] {
    const pids = this.taskProcesses.get(taskId);
    if (!pids) return [];
    return Array.from(pids)
      .map((pid) => this.processes.get(pid))
      .filter((p): p is TrackedProcess => p !== undefined);
  }

  killByCategory(category: ProcessCategory): void {
    const procs = this.getByCategory(category);
    for (const proc of procs) {
      this.kill(proc.pid);
    }
  }

  killByTaskId(taskId: string): void {
    const procs = this.getByTaskId(taskId);
    if (procs.length > 0) {
      log.info(`Killing ${procs.length} processes for taskId=${taskId}`);
    }
    for (const proc of procs) {
      this.kill(proc.pid);
    }
  }

  @preDestroy()
  killAll(): void {
    this._isShuttingDown = true;

    const count = this.processes.size;
    if (count > 0) {
      log.info(`Killing all tracked processes (${count} active)`);
    }
    for (const proc of this.processes.values()) {
      killProcessTree(proc.pid);
    }
    this.processes.clear();
    this.taskProcesses.clear();
  }
}
