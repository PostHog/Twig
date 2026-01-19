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
  return join(getTwigDir(), PID_FILE);
}

/**
 * Get the path to the log file
 */
export function getLogPath(): string {
  return join(getTwigDir(), LOG_FILE);
}

/**
 * Get the path to the repos file
 */
export function getReposPath(): string {
  return join(getTwigDir(), REPOS_FILE);
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
  ensureTwigDir();
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
  ensureTwigDir();
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
 * Returns a simple array of repo paths - focus state is derived from JJ.
 */
export function readRepos(): string[] {
  const reposPath = getReposPath();
  if (!existsSync(reposPath)) return [];

  try {
    const content = readFileSync(reposPath, "utf-8");
    const data = JSON.parse(content);
    // Handle migration from old format { path, workspaces[], gitMode? }[]
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      return data.map((entry: { path: string }) => entry.path);
    }
    return data;
  } catch {
    return [];
  }
}

/**
 * Write the registered repos to repos.json
 */
export function writeRepos(repos: string[]): void {
  ensureTwigDir();
  writeFileSync(getReposPath(), JSON.stringify(repos, null, 2), "utf-8");
}

/**
 * Register a repo for the daemon to watch
 */
export function addRepo(repoPath: string): void {
  const repos = readRepos();
  if (!repos.includes(repoPath)) {
    repos.push(repoPath);
    writeRepos(repos);
    log(`Registered repo: ${repoPath}`);
  }
}

/**
 * Unregister a repo from the daemon
 */
export function removeRepo(repoPath: string): void {
  const repos = readRepos();
  const filtered = repos.filter((r) => r !== repoPath);
  if (filtered.length !== repos.length) {
    writeRepos(filtered);
    log(`Unregistered repo: ${repoPath}`);
  }
}

/**
 * Check if a repo is registered
 */
export function isRepoRegistered(repoPath: string): boolean {
  return readRepos().includes(repoPath);
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
  return join(getTwigDir(), "workspaces", getRepoSlug(repoPath));
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
