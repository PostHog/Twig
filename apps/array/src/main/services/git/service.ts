import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { injectable } from "inversify";
import type { DetectRepoResult } from "./schemas.js";
import { parseGitHubUrl } from "./utils.js";

const execFileAsync = promisify(execFile);

@injectable()
export class GitService {
  public async detectRepo(
    directoryPath: string,
  ): Promise<DetectRepoResult | null> {
    if (!directoryPath) return null;

    const remoteUrl = await this.getRemoteUrl(directoryPath);
    if (!remoteUrl) return null;

    const repo = await parseGitHubUrl(remoteUrl);
    if (!repo) return null;

    const branch = await this.getCurrentBranch(directoryPath);
    if (!branch) return null;

    return {
      organization: repo.organization,
      repository: repo.repository,
      remote: remoteUrl,
      branch,
    };
  }

  public async getRemoteUrl(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git remote get-url origin", {
        cwd: directoryPath,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async getCurrentBranch(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git branch --show-current", {
        cwd: directoryPath,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }
}
