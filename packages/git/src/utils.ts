import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface GitHubRepo {
  organization: string;
  repository: string;
}

export async function safeSymlink(
  source: string,
  target: string,
  type: "file" | "dir",
): Promise<boolean> {
  if (path.resolve(source) === path.resolve(target)) {
    return false;
  }

  const sourceDir = path.dirname(path.resolve(source));
  const targetDir = path.dirname(path.resolve(target));
  if (
    sourceDir === targetDir &&
    path.basename(source) === path.basename(target)
  ) {
    return false;
  }

  try {
    await fs.access(source);
  } catch {
    return false;
  }

  try {
    await fs.symlink(source, target, type);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

export function parseGitHubUrl(url: string): GitHubRepo | null {
  // Trim whitespace/newlines that git commands may include
  const trimmedUrl = url.trim();

  const match =
    trimmedUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) ||
    trimmedUrl.match(/git@github\.com:(.+?)\/(.+?)(\.git)?$/);

  if (!match) return null;

  return { organization: match[1], repository: match[2].replace(/\.git$/, "") };
}
