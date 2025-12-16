import type { GitHubRepo } from "./types";

export function parseGitHubUrl(url: string): GitHubRepo | null {
  const match =
    url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) ||
    url.match(/git@github\.com:(.+?)\/(.+?)(\.git)?$/);

  if (!match) return null;

  return { organization: match[1], repository: match[2].replace(/\.git$/, "") };
}
