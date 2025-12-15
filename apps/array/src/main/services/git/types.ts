export interface GitHubRepo {
  organization: string;
  repository: string;
}

export interface DetectRepoResult {
  organization: string;
  repository: string;
  remote?: string;
  branch?: string;
}
