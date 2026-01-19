import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

export interface RepoEntry {
  path: string;
  workspaces: string[];
  /** When true, daemon watches main repo for git→unassigned sync even without focus */
  gitMode?: boolean;
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
 * Read the registered repos from repos.json
 */
export function readRepos(): RepoEntry[] {
  const reposPath = getReposPath();
  if (!existsSync(reposPath)) return [];

  try {
    const content = readFileSync(reposPath, "utf-8");
    return JSON.parse(content);
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
 * Register a repo with workspaces for the daemon to watch.
 * Merges with existing workspaces.
 */
export function registerRepo(repoPath: string, workspaces: string[]): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    // Merge workspaces (avoid duplicates)
    const allWorkspaces = new Set([...existing.workspaces, ...workspaces]);
    existing.workspaces = [...allWorkspaces];
  } else {
    repos.push({ path: repoPath, workspaces });
  }

  writeRepos(repos);
  log(
    `Registered repo: ${repoPath} with workspaces: [${workspaces.join(", ")}]`,
  );
}

/**
 * Set the exact list of workspaces for a repo (replaces existing).
 * Use this when updating focus to ensure repos.json matches exactly.
 */
export function setRepoWorkspaces(
  repoPath: string,
  workspaces: string[],
): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    existing.workspaces = workspaces;
  } else {
    repos.push({ path: repoPath, workspaces });
  }

  writeRepos(repos);
  log(`Set repo workspaces: ${repoPath} -> [${workspaces.join(", ")}]`);
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
 * Enable git mode for a repo (daemon watches main repo for git→unassigned sync)
 */
export function enableGitMode(repoPath: string): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    existing.gitMode = true;
  } else {
    repos.push({ path: repoPath, workspaces: [], gitMode: true });
  }

  writeRepos(repos);
  log(`Enabled git mode for: ${repoPath}`);
}

/**
 * Disable git mode for a repo
 */
export function disableGitMode(repoPath: string): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (existing) {
    existing.gitMode = false;
    // If no workspaces and no git mode, remove the repo
    if (existing.workspaces.length === 0) {
      writeRepos(repos.filter((r) => r.path !== repoPath));
      log(`Disabled git mode and removed repo: ${repoPath}`);
      return;
    }
  }

  writeRepos(repos);
  log(`Disabled git mode for: ${repoPath}`);
}

/**
 * Remove specific workspaces from a repo (unregister repo if no workspaces left)
 */
export function unregisterWorkspaces(
  repoPath: string,
  workspaces: string[],
): void {
  const repos = readRepos();
  const existing = repos.find((r) => r.path === repoPath);

  if (!existing) return;

  existing.workspaces = existing.workspaces.filter(
    (ws) => !workspaces.includes(ws),
  );

  if (existing.workspaces.length === 0) {
    // No workspaces left, remove the repo entirely
    writeRepos(repos.filter((r) => r.path !== repoPath));
    log(`Unregistered repo (no workspaces left): ${repoPath}`);
  } else {
    writeRepos(repos);
    log(`Unregistered workspaces from ${repoPath}: [${workspaces.join(", ")}]`);
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
