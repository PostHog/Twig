import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const LEGACY_DIR = ".array";
const TWIG_DIR = ".twig";
const PID_FILE = "daemon.pid";
const LOG_FILE = "daemon.log";
const REPOS_FILE = "repos.json";

export type RepoMode = "git" | "jj";

export interface RepoEntry {
  path: string;
  /** Explicit mode: "git" = on a branch, "jj" = focus commit */
  mode: RepoMode;
  /** Workspaces included in the focus commit (jj mode only) */
  focusedWorkspaces?: string[];
}

/**
 * Get the path to the global ~/.twig directory (migrated from ~/.array)
 */
export function getTwigDir(): string {
  return join(homedir(), TWIG_DIR);
}

/**
 * @deprecated Use getTwigDir() instead
 */
export function getArrayDir(): string {
  return getTwigDir();
}

function getLegacyDir(): string {
  return join(homedir(), LEGACY_DIR);
}

/**
 * Migrate ~/.array to ~/.twig if needed
 */
function migrateLegacyDir(): void {
  const legacyPath = getLegacyDir();
  const newPath = getTwigDir();

  if (existsSync(legacyPath) && !existsSync(newPath)) {
    try {
      renameSync(legacyPath, newPath);
    } catch {
      // If rename fails, continue using legacy location
    }
  }
}

/**
 * Get the path to the PID file
 */
export function getPidPath(): string {
  return join(getArrayDir(), PID_FILE);
}

/**
 * Get the path to the log file
 */
export function getLogPath(): string {
  return join(getArrayDir(), LOG_FILE);
}

/**
 * Get the path to the repos file
 */
export function getReposPath(): string {
  return join(getArrayDir(), REPOS_FILE);
}

/**
 * Ensure the ~/.twig directory exists (migrates from ~/.array if needed)
 */
export function ensureTwigDir(): void {
  migrateLegacyDir();
  const twigDir = getTwigDir();
  if (!existsSync(twigDir)) {
    mkdirSync(twigDir, { recursive: true });
  }
}

/**
 * @deprecated Use ensureTwigDir() instead
 */
export function ensureArrayDir(): void {
  ensureTwigDir();
}

/**
 * Write the daemon PID to the PID file
 */
export function writePid(pid: number): void {
  ensureArrayDir();
  writeFileSync(getPidPath(), pid.toString(), "utf-8");
}

/**
 * Read the daemon PID from the PID file
 */
export function readPid(): number | null {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) return null;

  try {
    const pidStr = readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Check if the daemon is running by checking if the PID exists and the process is alive
 */
export function isRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;

  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist - clean up stale PID file
    cleanup();
    return false;
  }
}

/**
 * Clean up the PID file
 */
export function cleanup(): void {
  const pidPath = getPidPath();
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Append a log message to the daemon log file
 */
export function log(message: string): void {
  ensureArrayDir();
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp}: ${message}\n`;
  try {
    writeFileSync(getLogPath(), logLine, { flag: "a" });
  } catch {
    // Ignore log errors
  }
}

/**
 * Read the registered repos from repos.json.
 * Handles migration from old schema (workspaces[]) to new schema (mode, focusedWorkspaces[]).
 */
export function readRepos(): RepoEntry[] {
  const reposPath = getReposPath();
  if (!existsSync(reposPath)) return [];

  try {
    const content = readFileSync(reposPath, "utf-8");
    const raw = JSON.parse(content) as Array<{
      path: string;
      mode?: RepoMode;
      workspaces?: string[]; // Old schema
      focusedWorkspaces?: string[];
    }>;

    // Migrate old schema to new schema
    return raw.map((entry) => ({
      path: entry.path,
      mode: entry.mode ?? "jj", // Default to jj mode if missing
      focusedWorkspaces: entry.focusedWorkspaces ?? entry.workspaces ?? [],
    }));
  } catch {
    return [];
  }
}

/**
 * Write the registered repos to repos.json
 */
export function writeRepos(repos: RepoEntry[]): void {
  ensureArrayDir();
  writeFileSync(getReposPath(), JSON.stringify(repos, null, 2), "utf-8");
}

/**
 * Register a repo with the daemon (defaults to jj mode).
 * Updates the mode if the repo already exists.
 */
export function registerRepo(repoPath: string, mode: RepoMode = "jj"): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    // Update mode if different
    if (existing.mode !== mode) {
      existing.mode = mode;
      writeRepos(repos);
      log(`Updated repo mode: ${repoPath} -> ${mode}`);
    }
  } else {
    repos.push({ path: repoPath, mode });
    writeRepos(repos);
    log(`Registered repo: ${repoPath} in ${mode} mode`);
  }
}

/**
 * Unregister a repo from the daemon
 */
export function unregisterRepo(repoPath: string): void {
  const repos = readRepos();
  const filtered = repos.filter((r) => r.path !== repoPath);
  writeRepos(filtered);
  log(`Unregistered repo: ${repoPath}`);
}

/**
 * Get the mode for a repo (defaults to jj if not registered)
 */
export function getRepoMode(repoPath: string): RepoMode {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);
  return existing?.mode ?? "jj";
}

/**
 * Set the mode for a repo
 */
export function setRepoMode(repoPath: string, mode: RepoMode): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    existing.mode = mode;
    // Clear focused workspaces when switching to git mode
    if (mode === "git") {
      existing.focusedWorkspaces = undefined;
    }
  } else {
    repos.push({ path: repoPath, mode });
  }

  writeRepos(repos);
  log(`Set repo mode: ${repoPath} -> ${mode}`);
}

/**
 * Check if a repo is in git mode
 */
export function isGitMode(repoPath: string): boolean {
  return getRepoMode(repoPath) === "git";
}

/**
 * Get the focused workspaces for a repo (jj mode only)
 */
export function getFocusedWorkspaces(repoPath: string): string[] {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);
  return existing?.focusedWorkspaces ?? [];
}

/**
 * Set the focused workspaces for a repo (jj mode only).
 * This is the list of workspaces included in the focus commit.
 */
export function setFocusedWorkspaces(
  repoPath: string,
  workspaces: string[],
): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    existing.focusedWorkspaces = workspaces;
    // Ensure we're in jj mode when focusing workspaces
    if (workspaces.length > 0) {
      existing.mode = "jj";
    }
  } else {
    repos.push({ path: repoPath, mode: "jj", focusedWorkspaces: workspaces });
  }

  writeRepos(repos);
  log(`Set focused workspaces: ${repoPath} -> [${workspaces.join(", ")}]`);
}

/**
 * Add workspaces to focus (jj mode)
 */
export function addToFocus(repoPath: string, workspaces: string[]): void {
  const current = getFocusedWorkspaces(repoPath);
  const merged = [...new Set([...current, ...workspaces])];
  setFocusedWorkspaces(repoPath, merged);
}

/**
 * Remove workspaces from focus (jj mode)
 */
export function removeFromFocus(repoPath: string, workspaces: string[]): void {
  const current = getFocusedWorkspaces(repoPath);
  const filtered = current.filter((ws) => !workspaces.includes(ws));
  setFocusedWorkspaces(repoPath, filtered);
}

/**
 * Discover all workspaces for a repo from the filesystem.
 * This is the source of truth for what workspaces exist.
 */
export function discoverWorkspaces(repoPath: string): string[] {
  const workspacesDir = getRepoWorkspacesDir(repoPath);
  if (!existsSync(workspacesDir)) return [];

  try {
    const entries = readdirSync(workspacesDir);
    return entries.filter((name) => {
      const fullPath = join(workspacesDir, name);
      try {
        return statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Get a filesystem-safe slug for a repo path.
 * Uses basename for readability (e.g., "/Users/jonathan/dev/posthog" -> "posthog")
 */
export function getRepoSlug(repoPath: string): string {
  return basename(repoPath);
}

/**
 * Get the path to the workspaces directory for a repo
 */
export function getRepoWorkspacesDir(repoPath: string): string {
  return join(getArrayDir(), "workspaces", getRepoSlug(repoPath));
}

/**
 * Get the path to a specific workspace
 */
export function getWorkspacePath(
  repoPath: string,
  workspaceName: string,
): string {
  return join(getRepoWorkspacesDir(repoPath), workspaceName);
}

/**
 * Ensure the workspaces directory for a repo exists
 */
export function ensureRepoWorkspacesDir(repoPath: string): void {
  const dir = getRepoWorkspacesDir(repoPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
