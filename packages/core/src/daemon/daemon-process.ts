#!/usr/bin/env bun

/**
 * Global daemon process that watches registered repos for bidirectional sync:
 * 1. Agent→Preview sync: Watches workspace directories for changes, copies files to main repo WC
 * 2. Preview→Agent sync: Routes user edits from WC to appropriate agent workspaces
 *
 * Both directions skip copying if file content is identical (prevents feedback loops).
 *
 * Focus state is tracked in ~/.twig/workspaces/<repo>/focus.json
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as watcher from "@parcel/watcher";
import { type DiffEntry, parseDiffSummary } from "../jj/diff";
import { buildFileOwnershipMap } from "../jj/file-ownership";
import {
  cleanup,
  getReposPath,
  getRepoWorkspacesDir,
  getWorkspacePath,
  log,
  readRepos,
  writePid,
  writeRepos,
} from "./pid";

const JJ_TIMEOUT_MS = 10000;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 20;
const DEBOUNCE_MS = 500;

interface JJResult {
  stdout: string | null;
  isLockError: boolean;
}

// ============================================================================
// Focus State (file-based)
// ============================================================================

interface FocusState {
  workspaces: string[];
}

function getFocusFilePath(repoPath: string): string {
  return join(getRepoWorkspacesDir(repoPath), "focus.json");
}

function readFocusState(repoPath: string): FocusState {
  const focusPath = getFocusFilePath(repoPath);
  try {
    if (existsSync(focusPath)) {
      const content = readFileSync(focusPath, "utf-8");
      return JSON.parse(content) as FocusState;
    }
  } catch {
    // Invalid or missing file
  }
  return { workspaces: [] };
}

// ============================================================================
// JJ Command Execution
// ============================================================================

/**
 * Run jj command with timeout.
 */
function runJJOnce(args: string[], cwd: string): Promise<JJResult> {
  return new Promise((resolve) => {
    const proc = spawn("jj", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      log(`jj ${args[0]} timed out after ${JJ_TIMEOUT_MS}ms`);
      resolve({ stdout: null, isLockError: false });
    }, JJ_TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (killed) return;
      if (code !== 0) {
        const isLockError =
          stderr.includes("locked") ||
          stderr.includes("lock") ||
          stderr.includes("packed-refs");
        if (!isLockError) {
          log(`jj ${args.join(" ")} failed (code ${code}): ${stderr.trim()}`);
        }
        resolve({ stdout: null, isLockError });
      } else {
        resolve({ stdout, isLockError: false });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      log(`jj ${args[0]} error: ${err.message}`);
      resolve({ stdout: null, isLockError: false });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run jj command with retry logic for lock contention.
 */
async function runJJ(args: string[], cwd: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await runJJOnce(args, cwd);

    if (result.stdout !== null) {
      if (attempt > 0) {
        log(`jj ${args[0]} succeeded after ${attempt} retries`);
      }
      return result.stdout;
    }

    if (!result.isLockError) {
      return null;
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  log(
    `jj ${args.join(" ")} failed after ${MAX_RETRIES} retries (lock contention)`,
  );
  return null;
}

/** Parse .gitignore into a set of ignored names */
async function loadGitignore(repoPath: string): Promise<Set<string>> {
  const ignored = new Set<string>([".jj", ".git", "node_modules", ".DS_Store"]);
  try {
    const content = await readFile(join(repoPath, ".gitignore"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        ignored.add(trimmed.replace(/^\//, "").replace(/\/$/, ""));
      }
    }
  } catch {
    // .gitignore doesn't exist or isn't readable - use defaults only
  }
  return ignored;
}

function shouldIgnore(filename: string, ignored: Set<string>): boolean {
  if (!filename) return true;
  for (const part of filename.split("/")) {
    if (ignored.has(part)) return true;
  }
  return false;
}

// ============================================================================
// State
// ============================================================================

/** Preview subscriptions: repoPath → subscription (watches main repo for edits) */
const previewSubscriptions: Map<string, watcher.AsyncSubscription> = new Map();

/** Workspace subscriptions: repoPath → subscription (watches ~/.twig/workspaces/<repo>/) */
const workspaceSubscriptions: Map<string, watcher.AsyncSubscription> =
  new Map();

/** Repos currently routing edits (to prevent overlap) */
const routingRepos: Set<string> = new Set();

/** Debounce timers for edit routing */
const routeDebounceTimers: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();

/** Debounce timers for agent→preview sync */
const agentSyncDebounceTimers: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();

/** Repos currently syncing agent→preview (to prevent overlap) */
const syncingRepos: Set<string> = new Set();

/** Currently watched repos */
let currentRepos: string[] = [];

// ============================================================================
// Agent→Preview Sync: Watch workspace directories, copy files to main repo WC
// ============================================================================

/**
 * Get files changed in a workspace (via jj diff).
 */
async function getWorkspaceFiles(
  workspace: string,
  repoPath: string,
): Promise<string[]> {
  const wsPath = getWorkspacePath(repoPath, workspace);
  if (!existsSync(wsPath)) return [];

  // Trigger snapshot first
  await runJJ(["status", "--quiet"], wsPath);

  // Get diff summary for workspace
  const result = await runJJ(
    ["diff", "-r", `${workspace}@`, "--summary"],
    repoPath,
  );
  if (!result) return [];

  const entries = parseDiffSummary(result);
  return entries.map((e) => e.path);
}

/**
 * Copy a file from workspace to main repo WC.
 * Returns true only if content was actually different and written.
 */
function copyFileToRepo(
  file: string,
  workspace: string,
  repoPath: string,
): boolean {
  const wsPath = getWorkspacePath(repoPath, workspace);
  const srcPath = join(wsPath, file);
  const destPath = join(repoPath, file);

  try {
    if (existsSync(srcPath)) {
      const content = readFileSync(srcPath);

      // Skip if destination exists and has same content (prevents feedback loop)
      if (existsSync(destPath)) {
        const existingContent = readFileSync(destPath);
        if (content.equals(existingContent)) {
          return false; // No change needed
        }
      }

      // Ensure destination directory exists
      const destDir = join(destPath, "..");
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      // Copy file content
      writeFileSync(destPath, content);
      return true;
    }
  } catch (err) {
    log(`[${repoPath}] Failed to copy ${file} from ${workspace}: ${err}`);
  }
  return false;
}

/**
 * Delete a file from main repo WC.
 */
function _deleteFileFromRepo(file: string, repoPath: string): boolean {
  const destPath = join(repoPath, file);
  try {
    if (existsSync(destPath)) {
      unlinkSync(destPath);
      return true;
    }
  } catch (err) {
    log(`[${repoPath}] Failed to delete ${file}: ${err}`);
  }
  return false;
}

/**
 * Sync files from focused agent workspaces to main repo WC.
 * This replaces the megamerge approach with direct file copying.
 */
async function syncAgentsToPreview(repoPath: string): Promise<void> {
  if (syncingRepos.has(repoPath)) {
    return; // Already syncing
  }

  syncingRepos.add(repoPath);
  const t0 = performance.now();

  try {
    const focusState = readFocusState(repoPath);
    if (focusState.workspaces.length === 0) {
      return; // No workspaces focused
    }

    log(
      `[${repoPath}] Syncing ${focusState.workspaces.length} workspace(s) to preview`,
    );

    // Collect all files from all focused workspaces
    const filesByWorkspace = new Map<string, string[]>();
    for (const ws of focusState.workspaces) {
      const files = await getWorkspaceFiles(ws, repoPath);
      filesByWorkspace.set(ws, files);
    }

    // Copy files from each workspace to main repo
    let copied = 0;
    for (const [ws, files] of filesByWorkspace) {
      for (const file of files) {
        if (copyFileToRepo(file, ws, repoPath)) {
          copied++;
        }
      }
    }

    if (copied > 0) {
      log(
        `[${repoPath}] Synced ${copied} file(s) to preview (${(performance.now() - t0).toFixed(0)}ms)`,
      );
    }
  } finally {
    syncingRepos.delete(repoPath);
  }
}

/**
 * Trigger agent→preview sync with debounce.
 */
function triggerAgentSync(repoPath: string): void {
  const existing = agentSyncDebounceTimers.get(repoPath);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    agentSyncDebounceTimers.delete(repoPath);
    syncAgentsToPreview(repoPath);
  }, DEBOUNCE_MS);

  agentSyncDebounceTimers.set(repoPath, timer);
}

/**
 * Watch workspace directories for changes (agent→preview sync).
 * When an agent workspace changes, we copy files to the main repo WC.
 */
async function watchWorkspaces(repoPath: string): Promise<void> {
  if (workspaceSubscriptions.has(repoPath)) {
    return;
  }

  const workspacesDir = getRepoWorkspacesDir(repoPath);
  if (!existsSync(workspacesDir)) {
    log(`[${repoPath}] No workspaces directory yet`);
    return;
  }

  try {
    const subscription = await watcher.subscribe(
      workspacesDir,
      (err, events) => {
        if (err) {
          log(`[${repoPath}] Workspace watcher error: ${err.message}`);
          return;
        }

        // Filter out .jj and .git directories, and focus.json
        const relevantEvents = events.filter((event) => {
          const path = event.path;
          return (
            !path.includes("/.jj/") &&
            !path.includes("/.git/") &&
            !path.endsWith("focus.json")
          );
        });

        if (relevantEvents.length === 0) return;

        log(
          `[${repoPath}] ${relevantEvents.length} workspace file change(s) detected`,
        );
        triggerAgentSync(repoPath);
      },
    );

    workspaceSubscriptions.set(repoPath, subscription);
    log(`[${repoPath}] Workspace watcher started: ${workspacesDir}`);
  } catch (err) {
    log(`[${repoPath}] Failed to start workspace watcher: ${err}`);
  }
}

/**
 * Stop watching workspaces for a repo.
 */
async function unwatchWorkspaces(repoPath: string): Promise<void> {
  const subscription = workspaceSubscriptions.get(repoPath);
  if (subscription) {
    await subscription.unsubscribe();
    workspaceSubscriptions.delete(repoPath);
    log(`[${repoPath}] Workspace watcher stopped`);
  }

  // Clear any pending debounce timers
  const timer = agentSyncDebounceTimers.get(repoPath);
  if (timer) {
    clearTimeout(timer);
    agentSyncDebounceTimers.delete(repoPath);
  }
}

// ============================================================================
// Preview→Agent Sync: Route user edits to workspaces
// ============================================================================

/**
 * Copy a file from preview to target workspace directory.
 * Returns true only if content was actually different and written.
 */
function copyFileToWorkspace(
  file: string,
  targetWorkspace: string,
  repoPath: string,
): boolean {
  const wsPath = getWorkspacePath(repoPath, targetWorkspace);
  if (!existsSync(wsPath)) return false;

  const srcPath = join(repoPath, file);
  const destPath = join(wsPath, file);

  try {
    if (existsSync(srcPath)) {
      const content = readFileSync(srcPath);

      // Skip if destination exists and has same content (prevents feedback loop)
      if (existsSync(destPath)) {
        const existingContent = readFileSync(destPath);
        if (content.equals(existingContent)) {
          return false; // No change needed
        }
      }

      // Ensure destination directory exists
      const destDir = join(destPath, "..");
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      // Copy file content
      writeFileSync(destPath, content);
      return true;
    }
  } catch (err) {
    log(`[${repoPath}] Failed to copy ${file} to ${targetWorkspace}: ${err}`);
  }
  return false;
}

/**
 * Delete a file from target workspace directory.
 */
function deleteFileFromWorkspace(
  file: string,
  targetWorkspace: string,
  repoPath: string,
): boolean {
  const wsPath = getWorkspacePath(repoPath, targetWorkspace);
  if (!existsSync(wsPath)) return false;

  const destPath = join(wsPath, file);

  try {
    if (existsSync(destPath)) {
      unlinkSync(destPath);
      return true;
    }
  } catch (err) {
    log(
      `[${repoPath}] Failed to delete ${file} from ${targetWorkspace}: ${err}`,
    );
  }
  return false;
}

/**
 * Route a single diff entry to the target workspace.
 * Handles Create (A), Update (M), Delete (D), and Rename (R).
 */
function routeEntryToWorkspace(
  entry: DiffEntry,
  targetWorkspace: string,
  repoPath: string,
): boolean {
  switch (entry.status) {
    case "A": // Added - copy new file
    case "M": // Modified - copy updated file
      return copyFileToWorkspace(entry.path, targetWorkspace, repoPath);

    case "D": // Deleted - delete from workspace
      return deleteFileFromWorkspace(entry.path, targetWorkspace, repoPath);

    case "R": // Renamed - delete old, copy new
      if (entry.oldPath) {
        deleteFileFromWorkspace(entry.oldPath, targetWorkspace, repoPath);
      }
      return copyFileToWorkspace(entry.path, targetWorkspace, repoPath);

    default:
      return false;
  }
}

/**
 * Route user edits from WC to appropriate agent workspaces.
 *
 * Routing rules:
 * - File modified by exactly 1 workspace → route to that workspace
 * - File not modified by any workspace → log warning (new file, user must assign)
 * - File modified by 2+ workspaces → log warning (conflict, shouldn't happen)
 */
async function routePreviewEdits(repoPath: string): Promise<void> {
  if (routingRepos.has(repoPath)) {
    return; // Already routing
  }

  routingRepos.add(repoPath);
  const t0 = performance.now();

  try {
    const focusState = readFocusState(repoPath);
    if (focusState.workspaces.length === 0) {
      return; // No workspaces focused, don't route
    }

    const { workspaces } = focusState;

    // Get changed files in wc commit (current working copy diff)
    const diffResult = await runJJ(["diff", "--summary"], repoPath);
    if (!diffResult) {
      return;
    }

    const entries = parseDiffSummary(diffResult);
    if (entries.length === 0) {
      return;
    }

    log(`[${repoPath}] Routing ${entries.length} change(s)`);

    // Single workspace mode: all edits go to that workspace
    if (workspaces.length === 1) {
      const target = workspaces[0];
      let routed = 0;
      for (const entry of entries) {
        if (routeEntryToWorkspace(entry, target, repoPath)) {
          routed++;
        }
      }
      log(`[${repoPath}] Routed ${routed} change(s) to ${target}`);
      return;
    }

    // Multi-workspace mode: route based on file ownership
    const ownershipResult = await buildFileOwnershipMap(workspaces, repoPath);
    if (!ownershipResult.ok) {
      log(`[${repoPath}] Failed to build ownership map`);
      return;
    }

    const ownership = ownershipResult.value;
    const routed: Map<string, number> = new Map();
    const warnings: string[] = [];

    for (const entry of entries) {
      const owners = ownership.getOwners(entry.path);

      if (owners.length === 0) {
        // New file not owned by any workspace
        warnings.push(`${entry.path}: no owner (use 'arr assign' to assign)`);
      } else if (owners.length === 1) {
        // Route to the single owner
        if (routeEntryToWorkspace(entry, owners[0], repoPath)) {
          routed.set(owners[0], (routed.get(owners[0]) || 0) + 1);
        }
      } else {
        // Multiple owners - conflict
        warnings.push(
          `${entry.path}: conflict (owned by ${owners.join(", ")})`,
        );
      }
    }

    // Log results
    for (const [ws, count] of routed) {
      log(`[${repoPath}] Routed ${count} change(s) to ${ws}`);
    }
    for (const warning of warnings) {
      log(`[${repoPath}] WARNING: ${warning}`);
    }

    log(
      `[${repoPath}] Edit routing complete (${(performance.now() - t0).toFixed(0)}ms)`,
    );
  } finally {
    routingRepos.delete(repoPath);
  }
}

/**
 * Trigger edit routing with debounce.
 */
function triggerRouteEdits(repoPath: string): void {
  const existing = routeDebounceTimers.get(repoPath);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    routeDebounceTimers.delete(repoPath);
    routePreviewEdits(repoPath);
  }, DEBOUNCE_MS);

  routeDebounceTimers.set(repoPath, timer);
}

/**
 * Watch main repo for user edits (preview→agent sync).
 */
async function watchPreview(repoPath: string): Promise<void> {
  if (previewSubscriptions.has(repoPath)) {
    return;
  }

  if (!existsSync(repoPath)) {
    log(`[${repoPath}] Repo path does not exist, skipping`);
    return;
  }

  const ignored = await loadGitignore(repoPath);

  try {
    const subscription = await watcher.subscribe(repoPath, (err, events) => {
      if (err) {
        log(`[${repoPath}] Watcher error: ${err.message}`);
        return;
      }

      const relevantEvents = events.filter((event) => {
        const relativePath = event.path.slice(repoPath.length + 1);
        return !shouldIgnore(relativePath, ignored);
      });

      if (relevantEvents.length === 0) return;

      log(`[${repoPath}] ${relevantEvents.length} file change(s) detected`);
      triggerRouteEdits(repoPath);
    });

    previewSubscriptions.set(repoPath, subscription);
    log(`[${repoPath}] Preview watcher started`);
  } catch (err) {
    log(`[${repoPath}] Failed to start preview watcher: ${err}`);
  }
}

/**
 * Stop watching a repo.
 */
async function unwatchPreview(repoPath: string): Promise<void> {
  const subscription = previewSubscriptions.get(repoPath);
  if (subscription) {
    await subscription.unsubscribe();
    previewSubscriptions.delete(repoPath);
    log(`[${repoPath}] Preview watcher stopped`);
  }

  // Clear any pending debounce timers
  const timer = routeDebounceTimers.get(repoPath);
  if (timer) {
    clearTimeout(timer);
    routeDebounceTimers.delete(repoPath);
  }
}

// ============================================================================
// Repo Management
// ============================================================================

async function watchRepo(repoPath: string): Promise<void> {
  log(`[${repoPath}] Starting to watch`);

  // Watch workspace directories for changes (agent→preview)
  await watchWorkspaces(repoPath);

  // Watch for user edits (preview→agent)
  await watchPreview(repoPath);
}

async function unwatchRepo(repoPath: string): Promise<void> {
  log(`[${repoPath}] Stopping watch`);

  await unwatchWorkspaces(repoPath);
  await unwatchPreview(repoPath);
}

async function reloadRepos(): Promise<void> {
  const newRepos = readRepos();

  // Filter to only repos that exist on disk
  const validRepos = newRepos.filter((repoPath) => {
    if (!existsSync(repoPath)) {
      log(`[${repoPath}] Repo does not exist, removing from registry`);
      return false;
    }
    return true;
  });

  // Update repos.json if we removed any invalid repos
  if (validRepos.length !== newRepos.length) {
    writeRepos(validRepos);
  }

  // Find repos to remove
  for (const oldRepo of currentRepos) {
    if (!validRepos.includes(oldRepo)) {
      await unwatchRepo(oldRepo);
    }
  }

  // Find repos to add
  for (const newRepo of validRepos) {
    if (!currentRepos.includes(newRepo)) {
      await watchRepo(newRepo);
    }
  }

  currentRepos = validRepos;
}

let reposWatcher: watcher.AsyncSubscription | null = null;

async function watchReposFile(): Promise<void> {
  const reposPath = getReposPath();
  const reposDir = join(reposPath, "..");

  if (!existsSync(reposDir)) {
    log("~/.twig/ does not exist yet, will check on file changes");
    return;
  }

  try {
    reposWatcher = await watcher.subscribe(reposDir, async (err, events) => {
      if (err) {
        log(`repos.json watcher error: ${err.message}`);
        return;
      }

      const reposChanged = events.some((e) => e.path.endsWith("repos.json"));
      if (reposChanged) {
        log("repos.json changed, reloading");
        await reloadRepos();
      }
    });

    log("Watching ~/.twig/repos.json for changes");
  } catch (err) {
    log(`Failed to watch repos.json: ${err}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  writePid(process.pid);
  log(`Daemon started (PID: ${process.pid})`);

  const shutdown = async () => {
    log("Daemon shutting down");

    if (reposWatcher) {
      await reposWatcher.unsubscribe();
    }

    // Stop all workspace watchers
    for (const [repoPath, subscription] of workspaceSubscriptions) {
      await subscription.unsubscribe();
      log(`[${repoPath}] Workspace watcher stopped`);
    }
    workspaceSubscriptions.clear();

    // Stop all preview watchers
    for (const [repoPath, subscription] of previewSubscriptions) {
      await subscription.unsubscribe();
      log(`[${repoPath}] Preview watcher stopped`);
    }
    previewSubscriptions.clear();

    // Clear pending timers
    for (const timer of routeDebounceTimers.values()) {
      clearTimeout(timer);
    }
    routeDebounceTimers.clear();

    for (const timer of agentSyncDebounceTimers.values()) {
      clearTimeout(timer);
    }
    agentSyncDebounceTimers.clear();

    cleanup();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Initial load
  await reloadRepos();

  // Watch for repo changes
  await watchReposFile();

  log("Daemon initialization complete");

  // Keep process alive
  await new Promise(() => {});
}

main().catch((e) => {
  log(`Daemon crashed: ${e}`);
  console.error("Daemon crashed:", e);
  process.exit(1);
});
