export interface GitHubRepo {
  organization: string;
  repository: string;
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
