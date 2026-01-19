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
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as watcher from "@parcel/watcher";
import { parseDiffPaths } from "../jj/diff";
import { UNASSIGNED_WORKSPACE, workspaceRef } from "../jj/workspace";
import {
  cleanup,
  discoverWorkspaces,
  getReposPath,
  getWorkspacePath,
  log,
  type RepoEntry,
  type RepoMode,
  readRepos,
  writePid,
  writeRepos,
} from "./pid";

const JJ_TIMEOUT_MS = 10000;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 20;
const DEBOUNCE_MS = 100;

/**
 * Internal daemon representation of a repo.
 * Combines repos.json config with filesystem-discovered workspaces.
 */
interface DaemonRepo {
  path: string;
  mode: RepoMode;
  /** All workspaces discovered from filesystem (always synced) */
  allWorkspaces: string[];
  /** Workspaces in the focus commit (jj mode only) */
  focusedWorkspaces: string[];
}

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
const _dirtyPreviews: Set<string> = new Set();

/** Debounce timers for workspace syncs */
const wsDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function wsKey(repoPath: string, wsName: string): string {
  return `${repoPath}:${wsName}`;
}

/**
 * Mark workspace sync as complete and re-queue if dirty.
 */
function finishWorkspaceSync(
  key: string,
  repoPath: string,
  wsName: string,
  wsPath: string,
): void {
  syncingWorkspaces.delete(key);

  if (dirtyWorkspaces.has(key)) {
    log(`[${key}] Changes during sync, re-queuing`);
    dirtyWorkspaces.delete(key);
    const queue = repoSyncQueue.get(repoPath) || [];
    if (!queue.some((item) => item.wsName === wsName)) {
      queue.push({ wsName, wsPath });
      repoSyncQueue.set(repoPath, queue);
    }
  }
}

/**
 * Get the first parent of the current commit (the remote baseline).
 */
async function getFirstParent(cwd: string): Promise<string | null> {
  const result = await runJJ(
    ["log", "-r", "@-", "--no-graph", "-T", "commit_id"],
    cwd,
  );
  if (result === null) return null;
  return result.trim() || null;
}

/**
 * Rebase focus commit onto remote baseline + all workspace tips.
 * First parent is remote baseline (for git_head), rest are workspace tips (for content).
 * Rebase updates content without replacing file inodes, so editors don't see delete/recreate.
 */
async function rebaseFocusCommit(
  repoPath: string,
  workspaces: string[],
): Promise<boolean> {
  // Get the current first parent (remote baseline) to preserve it
  const baseline = await getFirstParent(repoPath);
  if (baseline === null) {
    log(`[rebase] Failed to get first parent`);
    return false;
  }

  // Build destinations: baseline (first) + unassigned + all focused workspaces
  const destinations = [
    "-d",
    baseline,
    "-d",
    workspaceRef(UNASSIGNED_WORKSPACE),
    ...workspaces.flatMap((ws) => ["-d", workspaceRef(ws)]),
  ];
  const result = await runJJ(["rebase", "-r", "@", ...destinations], repoPath);
  return result !== null;
}

/**
 * Snapshot a workspace and update focus (jj mode only).
 */
async function snapshotAndSync(
  repoPath: string,
  wsName: string,
  wsPath: string,
): Promise<void> {
  const key = wsKey(repoPath, wsName);
  const t0 = performance.now();

  syncingWorkspaces.add(key);
  dirtyWorkspaces.delete(key);
  log(`[${key}] Starting sync`);

  const repo = currentDaemonRepos.find((r) => r.path === repoPath);
  if (!repo) {
    log(`[${key}] Repo not registered, skipping`);
    finishWorkspaceSync(key, repoPath, wsName, wsPath);
    return;
  }

  // Step 1: Snapshot the workspace (always do this)
  const t1 = performance.now();
  const snapResult = await runJJ(["status", "--quiet"], wsPath);
  if (snapResult === null) {
    log(`[${key}] Snapshot failed, aborting sync`);
    finishWorkspaceSync(key, repoPath, wsName, wsPath);
    return;
  }
  log(`[${key}] Snapshot complete (${(performance.now() - t1).toFixed(0)}ms)`);

  // Step 2: Rebase focus commit onto workspace tips (jj mode only)
  if (repo.mode === "jj" && repo.focusedWorkspaces.length > 0) {
    const t2 = performance.now();
    const rebaseOk = await rebaseFocusCommit(repoPath, repo.focusedWorkspaces);
    if (!rebaseOk) {
      log(`[${key}] Rebase failed`);
      finishWorkspaceSync(key, repoPath, wsName, wsPath);
      return;
    }
    log(`[${key}] Rebase complete (${(performance.now() - t2).toFixed(0)}ms)`);
    // No rewriteFilesInPlace needed - rebase updates files in-place without changing inodes
  }

  log(
    `[${key}] Sync complete (total: ${(performance.now() - t0).toFixed(0)}ms)`,
  );
  finishWorkspaceSync(key, repoPath, wsName, wsPath);
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

      // Filter out ignored files
      let relevantEvents = events.filter((event) => {
        const relativePath = event.path.slice(wsPath.length + 1);
        return !shouldIgnore(relativePath, ignored);
      });

      // Filter out files that were recently synced TO this workspace (prevents loop)
      const recentlySynced = recentlySyncedToWorkspace.get(key);
      if (recentlySynced && recentlySynced.size > 0) {
        const beforeCount = relevantEvents.length;
        relevantEvents = relevantEvents.filter((event) => {
          const relativePath = event.path.slice(wsPath.length + 1);
          return !recentlySynced.has(relativePath);
        });
        if (relevantEvents.length !== beforeCount) {
          log(
            `[${key}] Filtered ${beforeCount - relevantEvents.length} recently synced file(s)`,
          );
        }
      }

      if (relevantEvents.length === 0) return;

      // Check watcher latency by comparing file mtime to now
      // File may be deleted between event and stat - safe to ignore
      let maxLatency = 0;
      for (const event of relevantEvents) {
        try {
          const mtime = statSync(event.path).mtimeMs;
          const latency = tEvent - mtime;
          if (latency > maxLatency) maxLatency = latency;
        } catch {
          // File was deleted or inaccessible - skip latency calculation
        }
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

/**
 * Build ownership map: file → workspaces that modified it.
 */
async function buildOwnershipMap(
  workspaces: string[],
  cwd: string,
): Promise<Map<string, string[]>> {
  const ownership = new Map<string, string[]>();

  for (const ws of workspaces) {
    const result = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      cwd,
    );
    if (result === null) continue;

    const files = parseDiffPaths(result);
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
 * Sync a file from preview to target workspace.
 *
 * For deletions, we check if the owner workspace is focused:
 * - Owner IS focused → user deleted it, sync deletion
 * - Owner NOT focused → file disappeared due to unfocus, ignore
 */
function syncFileToWorkspace(
  file: string,
  targetWorkspace: string,
  repoPath: string,
  focusedWorkspaces: string[],
): boolean {
  const wsPath = getWorkspacePath(repoPath, targetWorkspace);
  if (!existsSync(wsPath)) return false;

  const srcPath = join(repoPath, file);
  const destPath = join(wsPath, file);
  const wsKey = `${repoPath}:${targetWorkspace}`;

  try {
    let synced = false;

    if (existsSync(srcPath)) {
      // Create or update: always sync
      const destDir = join(destPath, "..");
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
      synced = true;
    } else {
      // Delete: only sync if the owner workspace is focused
      // If not focused, the file disappeared due to unfocus, not user deletion
      if (!focusedWorkspaces.includes(targetWorkspace)) {
        log(
          `[focus:${repoPath}] Ignoring deletion of ${file} - workspace ${targetWorkspace} not focused`,
        );
        return false;
      }
      if (existsSync(destPath)) {
        unlinkSync(destPath);
        synced = true;
      }
    }

    // Track recently synced files to prevent feedback loop
    if (synced) {
      let recent = recentlySyncedToWorkspace.get(wsKey);
      if (!recent) {
        recent = new Set();
        recentlySyncedToWorkspace.set(wsKey, recent);
      }
      recent.add(file);

      // Clear after cooldown
      setTimeout(() => {
        const set = recentlySyncedToWorkspace.get(wsKey);
        if (set) {
          set.delete(file);
          if (set.size === 0) {
            recentlySyncedToWorkspace.delete(wsKey);
          }
        }
      }, SYNC_COOLDOWN_MS);
    }

    return synced;
  } catch (err) {
    log(`[focus:${repoPath}] Failed to sync ${file}: ${err}`);
  }
  return false;
}

/**
 * Route edits from preview to appropriate workspaces.
 *
 * Routing rules:
 * - File modified by exactly 1 workspace → route to that workspace
 * - File not modified by any workspace → route to unassigned
 * - File modified by 2+ workspaces → conflict (shouldn't happen)
 *
 * For deletions, only syncs if the owner workspace is currently focused.
 * This prevents unfocus operations from deleting workspace files.
 */
async function routePreviewEdits(
  repoPath: string,
  changedFiles: string[],
): Promise<void> {
  const t0 = performance.now();
  log(
    `[focus:${repoPath}] Starting edit routing for ${changedFiles.length} file(s)`,
  );

  const repo = currentDaemonRepos.find((r) => r.path === repoPath);
  if (!repo) {
    log(`[focus:${repoPath}] Repo not registered, skipping`);
    return;
  }

  if (changedFiles.length === 0) {
    log(`[focus:${repoPath}] No files to route`);
    return;
  }

  // Build ownership map across ALL workspaces
  const ownership = await buildOwnershipMap(repo.allWorkspaces, repoPath);

  // Route each file to its owner
  for (const file of changedFiles) {
    const owners = ownership.get(file) || [];
    let target: string;

    if (owners.length === 0) {
      target = UNASSIGNED_WORKSPACE;
    } else if (owners.length === 1) {
      target = owners[0];
    } else {
      log(
        `[focus:${repoPath}] WARNING: ${file} has multiple owners: ${owners.join(", ")}`,
      );
      continue;
    }

    const synced = syncFileToWorkspace(
      file,
      target,
      repoPath,
      repo.focusedWorkspaces,
    );
    if (synced) {
      log(`[focus:${repoPath}] Synced ${file} to ${target}`);
    }
  }

  log(
    `[focus:${repoPath}] Edit routing complete (${(performance.now() - t0).toFixed(0)}ms)`,
  );
}

/** Accumulated changed files per repo during debounce */
const pendingChangedFiles: Map<string, Set<string>> = new Map();

/** Recently synced files per workspace - ignore changes from these to prevent loops */
const recentlySyncedToWorkspace: Map<string, Set<string>> = new Map();
const SYNC_COOLDOWN_MS = 500;

/**
 * Trigger preview edit routing with debounce.
 */
function triggerPreviewRoute(repoPath: string, changedFiles: string[]): void {
  let pending = pendingChangedFiles.get(repoPath);
  if (!pending) {
    pending = new Set();
    pendingChangedFiles.set(repoPath, pending);
  }
  for (const file of changedFiles) {
    pending.add(file);
  }

  routePreviewEditsDebounced(repoPath);
}

const previewDebounceTimers: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();

function routePreviewEditsDebounced(repoPath: string): void {
  const existing = previewDebounceTimers.get(repoPath);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    previewDebounceTimers.delete(repoPath);

    const files = pendingChangedFiles.get(repoPath);
    pendingChangedFiles.delete(repoPath);

    if (files && files.size > 0) {
      await routePreviewEdits(repoPath, [...files]);
    }
  }, DEBOUNCE_MS);

  previewDebounceTimers.set(repoPath, timer);
}

/**
 * Watch the main repo for user edits and route to workspaces.
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

      const changedFiles = relevantEvents.map((event) =>
        event.path.slice(repoPath.length + 1),
      );

      log(
        `[focus:${repoPath}] ${relevantEvents.length} file change(s) detected`,
      );
      triggerPreviewRoute(repoPath, changedFiles);
    });

    focusSubscriptions.set(repoPath, subscription);
    log(`[focus:${repoPath}] Preview watcher started`);
  } catch (err) {
    log(`[focus:${repoPath}] Failed to start preview watcher: ${err}`);
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
  const timer = previewDebounceTimers.get(repoPath);
  if (timer) {
    clearTimeout(timer);
    previewDebounceTimers.delete(repoPath);
  }
}

async function watchRepo(repo: DaemonRepo): Promise<void> {
  log(
    `Watching repo: ${repo.path} (mode: ${repo.mode}, workspaces: ${repo.allWorkspaces.length})`,
  );

  // Watch ALL workspaces for changes (discovered from filesystem)
  for (const wsName of repo.allWorkspaces) {
    const wsPath = getWorkspacePath(repo.path, wsName);
    await watchWorkspace(repo.path, wsName, wsPath);
  }

  // Always watch main repo for bidirectional sync
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
let currentDaemonRepos: DaemonRepo[] = [];

/**
 * Build DaemonRepo from RepoEntry by discovering workspaces from filesystem.
 */
function buildDaemonRepo(entry: RepoEntry): DaemonRepo {
  // Discover all workspaces from filesystem
  const allWorkspaces = discoverWorkspaces(entry.path);

  // Filter focused workspaces to only those that exist
  let focusedWorkspaces = (entry.focusedWorkspaces ?? []).filter((ws) =>
    allWorkspaces.includes(ws),
  );

  // In jj mode, unassigned is always in focus (so unowned files are always visible)
  if (
    entry.mode === "jj" &&
    allWorkspaces.includes(UNASSIGNED_WORKSPACE) &&
    !focusedWorkspaces.includes(UNASSIGNED_WORKSPACE)
  ) {
    focusedWorkspaces = [UNASSIGNED_WORKSPACE, ...focusedWorkspaces];
  }

  return {
    path: entry.path,
    mode: entry.mode,
    allWorkspaces,
    focusedWorkspaces,
  };
}

async function reloadRepos(): Promise<void> {
  const rawRepos = readRepos();

  // Build daemon repos from config + filesystem discovery
  const newRepos: DaemonRepo[] = [];
  let needsWrite = false;

  for (const entry of rawRepos) {
    const daemonRepo = buildDaemonRepo(entry);

    // Clean up stale focused workspaces in repos.json
    const originalFocused = entry.focusedWorkspaces ?? [];
    if (daemonRepo.focusedWorkspaces.length !== originalFocused.length) {
      needsWrite = true;
      const removed = originalFocused.filter(
        (ws) => !daemonRepo.focusedWorkspaces.includes(ws),
      );
      log(
        `Cleaning stale focused workspaces from ${entry.path}: [${removed.join(", ")}]`,
      );
    }

    // Only include repos that have workspaces
    if (daemonRepo.allWorkspaces.length > 0) {
      newRepos.push(daemonRepo);
    } else {
      needsWrite = true;
      log(`Removing repo with no workspaces: ${entry.path}`);
    }
  }

  // Update repos.json if we cleaned anything
  if (needsWrite) {
    const cleanedEntries: RepoEntry[] = newRepos.map((r) => ({
      path: r.path,
      mode: r.mode,
      focusedWorkspaces:
        r.focusedWorkspaces.length > 0 ? r.focusedWorkspaces : undefined,
    }));
    writeRepos(cleanedEntries);
  }

  // Find repos to remove
  for (const oldRepo of currentDaemonRepos) {
    const stillExists = newRepos.find((r) => r.path === oldRepo.path);
    if (!stillExists) {
      await unwatchRepo(oldRepo.path);
    }
  }

  // Find repos to add or update
  for (const newRepo of newRepos) {
    const oldRepo = currentDaemonRepos.find((r) => r.path === newRepo.path);
    if (!oldRepo) {
      // New repo
      await watchRepo(newRepo);
    } else {
      // Check for workspace changes (based on filesystem discovery)
      const oldWs = new Set(oldRepo.allWorkspaces);
      const newWs = new Set(newRepo.allWorkspaces);

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

      // Check if focused workspaces changed - sync newly focused workspaces to preview
      const oldFocused = new Set(oldRepo.focusedWorkspaces);
      const addedToFocus = newRepo.focusedWorkspaces.filter(
        (ws) => !oldFocused.has(ws),
      );

      if (addedToFocus.length > 0) {
        log(`[${newRepo.path}] Focus changed: +[${addedToFocus.join(", ")}]`);

        // Sync workspaces added to focus (workspace→preview direction only)
        for (const ws of addedToFocus) {
          const wsPath = getWorkspacePath(newRepo.path, ws);
          if (existsSync(wsPath)) {
            triggerSync(newRepo.path, ws, wsPath);
          }
        }
      }
    }
  }

  currentDaemonRepos = newRepos;
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
    for (const timer of previewDebounceTimers.values()) {
      clearTimeout(timer);
    }
    previewDebounceTimers.clear();

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
