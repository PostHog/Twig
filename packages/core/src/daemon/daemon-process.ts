#!/usr/bin/env bun

/**
 * Global daemon process that watches workspaces across all registered repos.
 *
 * Architecture:
 * 1. Reads ~/.array/repos.json for list of repos to watch
 * 2. Watches repos.json for changes (repos added/removed)
 * 3. For each repo, watches its workspaces for file changes
 * 4. On file change: snapshot workspace → update focus
 *
 * All jj operations use retry logic for lock contention.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as watcher from "@parcel/watcher";
import {
  cleanup,
  getReposPath,
  getWorkspacePath,
  log,
  type RepoEntry,
  readRepos,
  writePid,
  writeRepos,
} from "./pid";

const JJ_TIMEOUT_MS = 10000;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 20;
const DEBOUNCE_MS = 100;

interface JJResult {
  stdout: string | null;
  isLockError: boolean;
}

/**
 * Run jj command with timeout.
 */
function runJJOnce(args: string[], cwd: string): Promise<JJResult> {
  return new Promise((resolve) => {
    const _tSpawn = performance.now();
    const proc = spawn("jj", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    let tFirstData = 0;

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      log(`jj ${args[0]} timed out after ${JJ_TIMEOUT_MS}ms`);
      resolve({ stdout: null, isLockError: false });
    }, JJ_TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      if (!tFirstData) tFirstData = performance.now();
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const _tClose = performance.now();
      clearTimeout(timeout);
      if (killed) return;
      // log(`jj ${args[0]}: spawn→firstData=${tFirstData ? (tFirstData - tSpawn).toFixed(0) : 'n/a'}ms, spawn→close=${(tClose - tSpawn).toFixed(0)}ms`);
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
async function loadGitignore(workspacePath: string): Promise<Set<string>> {
  const ignored = new Set<string>([".jj", ".git", "node_modules", ".DS_Store"]);
  try {
    const content = await readFile(join(workspacePath, ".gitignore"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        ignored.add(trimmed.replace(/^\//, "").replace(/\/$/, ""));
      }
    }
  } catch {
    // No .gitignore
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

/**
 * Get list of tracked (non-gitignored) files via jj file list
 */
async function getTrackedFiles(cwd: string): Promise<string[]> {
  const result = await runJJ(["file", "list"], cwd);
  if (result === null) return [];
  return result.trim().split("\n").filter(Boolean);
}

/**
 * Rewrite files in-place to trigger file watchers.
 * jj rebase replaces files (new inode), but VSCode watches the old inode.
 * Rewriting the file content triggers watchers on the new inode.
 */
async function rewriteFilesInPlace(cwd: string): Promise<void> {
  const files = await getTrackedFiles(cwd);
  for (const file of files) {
    const filePath = join(cwd, file);
    if (existsSync(filePath)) {
      try {
        const stats = statSync(filePath);
        if (stats.isFile()) {
          const content = readFileSync(filePath);
          writeFileSync(filePath, content);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  }
}

/** Active subscriptions: "repoPath:wsName" → subscription */
const subscriptions: Map<string, watcher.AsyncSubscription> = new Map();

/** Preview subscriptions: repoPath → subscription (watches main repo for edits) */
const focusSubscriptions: Map<string, watcher.AsyncSubscription> = new Map();

/** Workspaces currently syncing */
const syncingWorkspaces: Set<string> = new Set();

/** Workspaces that changed during sync (need re-sync) */
const dirtyWorkspaces: Set<string> = new Set();

/** Queue of pending syncs per repo (to serialize syncs to same focus) */
const repoSyncQueue: Map<
  string,
  Array<{ wsName: string; wsPath: string }>
> = new Map();

/** Repos currently processing their sync queue */
const repoSyncing: Set<string> = new Set();

/** Preview repos with dirty edits that need routing */
const dirtyPreviews: Set<string> = new Set();

/** Debounce timers for workspace syncs */
const wsDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function wsKey(repoPath: string, wsName: string): string {
  return `${repoPath}:${wsName}`;
}

/**
 * Snapshot a workspace and update focus.
 */
async function snapshotAndSync(
  repoPath: string,
  wsName: string,
  wsPath: string,
): Promise<void> {
  const key = wsKey(repoPath, wsName);
  const t0 = performance.now();

  // Mark as syncing
  syncingWorkspaces.add(key);
  dirtyWorkspaces.delete(key);

  log(`[${key}] Starting sync`);

  const finishSync = () => {
    syncingWorkspaces.delete(key);

    // If workspace was marked dirty during sync, re-queue it
    if (dirtyWorkspaces.has(key)) {
      log(`[${key}] Changes during sync, re-queuing`);
      dirtyWorkspaces.delete(key);
      const queue = repoSyncQueue.get(repoPath) || [];
      if (!queue.some((item) => item.wsName === wsName)) {
        queue.push({ wsName, wsPath });
        repoSyncQueue.set(repoPath, queue);
      }
    }
  };

  // Get registered workspaces for this repo
  const repo = currentRepos.find((r) => r.path === repoPath);
  if (!repo || repo.workspaces.length === 0) {
    log(`[${key}] No registered workspaces, skipping`);
    finishSync();
    return;
  }

  // Step 1: Snapshot the workspace
  const t1 = performance.now();
  const snapResult = await runJJ(["status", "--quiet"], wsPath);
  if (snapResult === null) {
    log(`[${key}] Snapshot failed, aborting sync`);
    finishSync();
    return;
  }
  const t2 = performance.now();
  log(`[${key}] Snapshot complete (${(t2 - t1).toFixed(0)}ms)`);

  // Step 2: Rebase focus commit onto all workspace tips
  // jj rebase -r @ -d unassigned@ -d agent-a@ -d agent-b@ ...
  const destinations = [
    "-d",
    "unassigned@",
    ...repo.workspaces.flatMap((ws) => ["-d", `${ws}@`]),
  ];
  const t3 = performance.now();
  const rebaseResult = await runJJ(
    ["rebase", "-r", "@", ...destinations],
    repoPath,
  );
  if (rebaseResult === null) {
    log(`[${key}] Rebase failed`);
    finishSync();
    return;
  }
  const t4 = performance.now();
  log(`[${key}] Rebase complete (${(t4 - t3).toFixed(0)}ms)`);

  // Step 3: Rewrite files in-place to trigger VSCode's file watcher
  // (jj rebase replaces files with new inodes, VSCode watches old inodes)
  const t5 = performance.now();
  await rewriteFilesInPlace(repoPath);
  const t6 = performance.now();
  log(`[${key}] Rewrote files in-place (${(t6 - t5).toFixed(0)}ms)`);

  log(
    `[${key}] Sync complete (total: ${(performance.now() - t0).toFixed(0)}ms)`,
  );
  finishSync();
}

function triggerSync(repoPath: string, wsName: string, wsPath: string): void {
  const key = wsKey(repoPath, wsName);

  // If this specific workspace is already syncing, mark dirty for re-sync
  if (syncingWorkspaces.has(key)) {
    dirtyWorkspaces.add(key);
    return;
  }

  // Debounce: reset timer on each trigger
  const existing = wsDebounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    wsDebounceTimers.delete(key);

    // Add to repo's sync queue
    const queue = repoSyncQueue.get(repoPath) || [];
    if (!queue.some((item) => item.wsName === wsName)) {
      queue.push({ wsName, wsPath });
      repoSyncQueue.set(repoPath, queue);
    }

    // Process queue if not already processing
    processRepoSyncQueue(repoPath);
  }, DEBOUNCE_MS);

  wsDebounceTimers.set(key, timer);
}

/**
 * Process sync queue for a repo serially.
 * Only one workspace syncs to focus at a time to prevent overwrites.
 */
async function processRepoSyncQueue(repoPath: string): Promise<void> {
  // If already processing this repo's queue, let it continue
  if (repoSyncing.has(repoPath)) {
    return;
  }

  repoSyncing.add(repoPath);

  while (true) {
    const queue = repoSyncQueue.get(repoPath) || [];
    if (queue.length === 0) {
      break;
    }

    // Take the first item from queue
    const { wsName, wsPath } = queue.shift()!;
    repoSyncQueue.set(repoPath, queue);

    // Sync this workspace (await completion before next)
    await snapshotAndSync(repoPath, wsName, wsPath);
  }

  repoSyncing.delete(repoPath);
}

async function watchWorkspace(
  repoPath: string,
  wsName: string,
  wsPath: string,
): Promise<void> {
  const key = wsKey(repoPath, wsName);

  if (subscriptions.has(key)) {
    return;
  }

  if (!existsSync(wsPath)) {
    log(`[${key}] Workspace path does not exist, skipping`);
    return;
  }

  const ignored = await loadGitignore(wsPath);

  try {
    const subscription = await watcher.subscribe(wsPath, (err, events) => {
      const tEvent = Date.now();
      if (err) {
        log(`[${key}] Watcher error: ${err.message}`);
        return;
      }

      const relevantEvents = events.filter((event) => {
        const relativePath = event.path.slice(wsPath.length + 1);
        return !shouldIgnore(relativePath, ignored);
      });

      if (relevantEvents.length === 0) return;

      // Check watcher latency by comparing file mtime to now
      let maxLatency = 0;
      for (const event of relevantEvents) {
        try {
          const mtime = statSync(event.path).mtimeMs;
          const latency = tEvent - mtime;
          if (latency > maxLatency) maxLatency = latency;
        } catch {}
      }

      log(
        `[${key}] ${relevantEvents.length} file change(s) (watcher latency: ${maxLatency.toFixed(0)}ms)`,
      );
      triggerSync(repoPath, wsName, wsPath);
    });

    subscriptions.set(key, subscription);
    log(`[${key}] Watching started`);
  } catch (err) {
    log(`[${key}] Failed to start watcher: ${err}`);
  }
}

async function unwatchWorkspace(
  repoPath: string,
  wsName: string,
): Promise<void> {
  const key = wsKey(repoPath, wsName);
  const subscription = subscriptions.get(key);
  if (subscription) {
    await subscription.unsubscribe();
    subscriptions.delete(key);
    log(`[${key}] Watcher stopped`);
  }
}

// ============================================================================
// Preview Watcher: Routes edits from main repo to appropriate workspace
// ============================================================================

const UNASSIGNED_WORKSPACE = "unassigned";

/**
 * Parse jj diff --summary output to extract file paths.
 */
function parseDiffSummary(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const simpleMatch = trimmed.match(/^[MAD]\s+(.+)$/);
    if (simpleMatch) {
      files.push(simpleMatch[1].trim());
      continue;
    }

    const renameMatch = trimmed.match(/^R\s+\{(.+)\s+=>\s+(.+)\}$/);
    if (renameMatch) {
      files.push(renameMatch[1].trim());
      files.push(renameMatch[2].trim());
    }
  }
  return files;
}

/**
 * Build ownership map: file → workspaces that modified it.
 */
async function buildOwnershipMap(
  workspaces: string[],
  cwd: string,
): Promise<Map<string, string[]>> {
  const ownership = new Map<string, string[]>();

  for (const ws of workspaces) {
    const result = await runJJ(["diff", "-r", `${ws}@`, "--summary"], cwd);
    if (result === null) continue;

    const files = parseDiffSummary(result);
    for (const file of files) {
      const owners = ownership.get(file) || [];
      if (!owners.includes(ws)) {
        owners.push(ws);
      }
      ownership.set(file, owners);
    }
  }

  return ownership;
}

/**
 * Copy files from focus to target workspace directory.
 * Instead of using jj squash (which creates divergent commits),
 * we copy the file content directly and let the workspace watcher
 * pick up the changes naturally.
 *
 * NOTE: We intentionally do NOT run `jj restore` here. The workspace watcher
 * will trigger snapshotAndSync, which runs `jj restore` right before rebase.
 * This eliminates the visible flash where content disappears then reappears.
 */
function copyFilesToWorkspace(
  files: string[],
  targetWorkspace: string,
  repoPath: string,
): boolean {
  if (files.length === 0) return true;

  const wsPath = getWorkspacePath(repoPath, targetWorkspace);
  if (!existsSync(wsPath)) return false;

  for (const file of files) {
    const srcPath = join(repoPath, file);
    const destPath = join(wsPath, file);

    try {
      if (existsSync(srcPath)) {
        // Ensure destination directory exists
        const destDir = join(destPath, "..");
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        // Copy file content
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      }
    } catch (err) {
      log(`[focus:${repoPath}] Failed to copy ${file}: ${err}`);
    }
  }

  return true;
}

/**
 * Route focus edits to appropriate workspaces.
 *
 * Routing rules:
 * - File modified by exactly 1 agent → route to that agent
 * - File not modified by any agent → route to unassigned
 * - File modified by 2+ agents → BLOCKED (shouldn't happen, checked at preview add)
 */
async function routePreviewEdits(repoPath: string): Promise<void> {
  const t0 = performance.now();
  log(`[focus:${repoPath}] Starting edit routing`);

  const repo = currentRepos.find((r) => r.path === repoPath);
  if (!repo || repo.workspaces.length === 0) {
    log(`[focus:${repoPath}] No registered workspaces, skipping`);
    return;
  }

  // Single workspace mode: all edits go directly to that workspace
  if (repo.workspaces.length === 1) {
    const ws = repo.workspaces[0];
    // Get files changed in focus working copy (not committed)
    const diffResult = await runJJ(["diff", "--summary"], repoPath);
    if (diffResult) {
      const files = parseDiffSummary(diffResult);
      if (files.length > 0) {
        const success = await copyFilesToWorkspace(files, ws, repoPath);
        if (success) {
          log(`[focus:${repoPath}] Routed ${files.length} file(s) to ${ws}`);
        }
      }
    }
    log(
      `[focus:${repoPath}] Edit routing complete (${(performance.now() - t0).toFixed(0)}ms)`,
    );
    return;
  }

  // Multi-workspace mode: route based on ownership
  // Get files changed in focus working copy (not committed)
  const diffResult = await runJJ(["diff", "--summary"], repoPath);
  if (!diffResult) {
    log(`[focus:${repoPath}] No changes to route`);
    return;
  }

  const changedFiles = parseDiffSummary(diffResult);
  if (changedFiles.length === 0) {
    log(`[focus:${repoPath}] No tracked files changed`);
    return;
  }

  // Build ownership map for current workspaces
  const ownership = await buildOwnershipMap(repo.workspaces, repoPath);

  // Group files by target workspace
  const toRoute = new Map<string, string[]>();

  for (const file of changedFiles) {
    const owners = ownership.get(file) || [];

    if (owners.length === 0) {
      // Not owned by any agent → unassigned
      const files = toRoute.get(UNASSIGNED_WORKSPACE) || [];
      files.push(file);
      toRoute.set(UNASSIGNED_WORKSPACE, files);
    } else if (owners.length === 1) {
      // Owned by exactly one agent → route to that agent
      const files = toRoute.get(owners[0]) || [];
      files.push(file);
      toRoute.set(owners[0], files);
    } else {
      // Multiple owners → conflict, skip (shouldn't happen)
      log(
        `[focus:${repoPath}] WARNING: ${file} has multiple owners: ${owners.join(", ")}`,
      );
    }
  }

  // Copy files to their target workspaces
  for (const [target, files] of toRoute) {
    const success = await copyFilesToWorkspace(files, target, repoPath);
    if (success) {
      log(`[focus:${repoPath}] Routed ${files.length} file(s) to ${target}`);
    } else {
      log(`[focus:${repoPath}] Failed to route files to ${target}`);
    }
  }

  log(
    `[focus:${repoPath}] Edit routing complete (${(performance.now() - t0).toFixed(0)}ms)`,
  );
}

/**
 * Trigger preview edit routing (with dirty flag handling).
 */
function triggerPreviewRoute(repoPath: string): void {
  // Debounce handles batching - just mark dirty and schedule
  if (dirtyPreviews.has(repoPath)) {
    // Already scheduled, debounce will reset timer
    routePreviewEditsDebounced(repoPath);
    return;
  }

  dirtyPreviews.add(repoPath);
  routePreviewEditsDebounced(repoPath);
}

/**
 * Debounced version of routePreviewEdits.
 * Waits for file activity to settle before routing.
 */
const focusDebounceTimers: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();

function routePreviewEditsDebounced(repoPath: string): void {
  const existing = focusDebounceTimers.get(repoPath);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    focusDebounceTimers.delete(repoPath);
    dirtyPreviews.delete(repoPath);
    await routePreviewEdits(repoPath);
  }, DEBOUNCE_MS);

  focusDebounceTimers.set(repoPath, timer);
}

/**
 * Watch the main repo for user edits (bidirectional sync).
 */
async function watchPreview(repoPath: string): Promise<void> {
  if (focusSubscriptions.has(repoPath)) {
    return;
  }

  if (!existsSync(repoPath)) {
    log(`[focus:${repoPath}] Repo path does not exist, skipping`);
    return;
  }

  const ignored = await loadGitignore(repoPath);

  try {
    const subscription = await watcher.subscribe(repoPath, (err, events) => {
      if (err) {
        log(`[focus:${repoPath}] Watcher error: ${err.message}`);
        return;
      }

      const relevantEvents = events.filter((event) => {
        const relativePath = event.path.slice(repoPath.length + 1);
        return !shouldIgnore(relativePath, ignored);
      });

      if (relevantEvents.length === 0) return;

      log(
        `[focus:${repoPath}] ${relevantEvents.length} file change(s) detected`,
      );
      triggerPreviewRoute(repoPath);
    });

    focusSubscriptions.set(repoPath, subscription);
    log(`[focus:${repoPath}] Focus watcher started`);
  } catch (err) {
    log(`[focus:${repoPath}] Failed to start focus watcher: ${err}`);
  }
}

/**
 * Stop watching the main repo for edits.
 */
async function unwatchPreview(repoPath: string): Promise<void> {
  const subscription = focusSubscriptions.get(repoPath);
  if (subscription) {
    await subscription.unsubscribe();
    focusSubscriptions.delete(repoPath);
    log(`[focus:${repoPath}] Focus watcher stopped`);
  }

  // Clear any pending debounce timers
  const timer = focusDebounceTimers.get(repoPath);
  if (timer) {
    clearTimeout(timer);
    focusDebounceTimers.delete(repoPath);
  }
}

async function watchRepo(repo: RepoEntry): Promise<void> {
  log(`Watching repo: ${repo.path}`);

  // Watch agent workspaces for changes
  for (const wsName of repo.workspaces) {
    const wsPath = getWorkspacePath(repo.path, wsName);
    await watchWorkspace(repo.path, wsName, wsPath);
  }

  // Watch main repo for user edits (bidirectional sync)
  await watchPreview(repo.path);
}

async function unwatchRepo(repoPath: string): Promise<void> {
  log(`Unwatching repo: ${repoPath}`);

  // Find all subscriptions for this repo and unwatch them
  for (const key of subscriptions.keys()) {
    if (key.startsWith(`${repoPath}:`)) {
      const wsName = key.slice(repoPath.length + 1);
      await unwatchWorkspace(repoPath, wsName);
    }
  }

  // Stop focus watcher
  await unwatchPreview(repoPath);
}

/** Currently watched repos (for diffing on reload) */
let currentRepos: RepoEntry[] = [];

async function reloadRepos(): Promise<void> {
  const rawRepos = readRepos();

  // Filter to only workspaces that actually exist on disk
  // This cleans up stale entries from manual deletions or crashes
  const newRepos: RepoEntry[] = [];
  let needsWrite = false;

  for (const repo of rawRepos) {
    const validWorkspaces = repo.workspaces.filter((ws) => {
      const wsPath = getWorkspacePath(repo.path, ws);
      return existsSync(wsPath);
    });

    if (validWorkspaces.length !== repo.workspaces.length) {
      needsWrite = true;
      const removed = repo.workspaces.filter(
        (ws) => !validWorkspaces.includes(ws),
      );
      log(
        `Cleaning stale workspaces from ${repo.path}: [${removed.join(", ")}]`,
      );
    }

    if (validWorkspaces.length > 0) {
      newRepos.push({ path: repo.path, workspaces: validWorkspaces });
    } else {
      needsWrite = true;
      log(`Removing repo with no valid workspaces: ${repo.path}`);
    }
  }

  // Update repos.json if we cleaned anything
  if (needsWrite) {
    writeRepos(newRepos);
  }

  // Find repos to remove
  for (const oldRepo of currentRepos) {
    const stillExists = newRepos.find((r) => r.path === oldRepo.path);
    if (!stillExists) {
      await unwatchRepo(oldRepo.path);
    }
  }

  // Find repos to add or update
  for (const newRepo of newRepos) {
    const oldRepo = currentRepos.find((r) => r.path === newRepo.path);
    if (!oldRepo) {
      // New repo
      await watchRepo(newRepo);
    } else {
      // Check for workspace changes
      const oldWs = new Set(oldRepo.workspaces);
      const newWs = new Set(newRepo.workspaces);

      // Removed workspaces
      for (const ws of oldWs) {
        if (!newWs.has(ws)) {
          await unwatchWorkspace(newRepo.path, ws);
        }
      }

      // Added workspaces
      for (const ws of newWs) {
        if (!oldWs.has(ws)) {
          const wsPath = getWorkspacePath(newRepo.path, ws);
          await watchWorkspace(newRepo.path, ws, wsPath);
        }
      }
    }
  }

  currentRepos = newRepos;
}

let reposWatcher: watcher.AsyncSubscription | null = null;

async function watchReposFile(): Promise<void> {
  const reposPath = getReposPath();
  const reposDir = join(reposPath, "..");

  if (!existsSync(reposDir)) {
    log("~/.array/ does not exist yet, will check on file changes");
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

    log("Watching ~/.array/repos.json for changes");
  } catch (err) {
    log(`Failed to watch repos.json: ${err}`);
  }
}

async function main(): Promise<void> {
  writePid(process.pid);
  log(`Daemon started (PID: ${process.pid})`);

  const shutdown = async () => {
    log("Daemon shutting down");

    if (reposWatcher) {
      await reposWatcher.unsubscribe();
    }

    for (const [key, subscription] of subscriptions) {
      await subscription.unsubscribe();
      log(`[${key}] Watcher stopped`);
    }
    subscriptions.clear();

    // Clean up preview subscriptions
    for (const [repoPath, subscription] of focusSubscriptions) {
      await subscription.unsubscribe();
      log(`[focus:${repoPath}] Focus watcher stopped`);
    }
    focusSubscriptions.clear();

    // Clear any pending debounce timers
    for (const timer of focusDebounceTimers.values()) {
      clearTimeout(timer);
    }
    focusDebounceTimers.clear();

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
