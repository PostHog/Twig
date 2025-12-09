import { Octokit } from "@octokit/rest";

export class GitHubAPIClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(accessToken: string, owner: string, repo: string) {
    this.octokit = new Octokit({
      auth: accessToken,
    });
    this.owner = owner;
    this.repo = repo;
  }

  async createComment(issueNumber: number, body: string) {
    try {
      const response = await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create comment: ${error}`);
    }
  }

  async getCurrentUser() {
    try {
      const response = await this.octokit.rest.users.getAuthenticated();
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error}`);
    }
  }

  async getPullRequest(pullNumber: number) {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: pullNumber,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get pull request: ${error}`);
    }
  }
}
