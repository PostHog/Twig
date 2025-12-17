import { exec, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { injectable } from "inversify";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { CloneProgressPayload, DetectRepoResult } from "./schemas.js";
import { parseGitHubUrl } from "./utils.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export const GitServiceEvent = {
  CloneProgress: "cloneProgress",
} as const;

export interface GitServiceEvents {
  [GitServiceEvent.CloneProgress]: CloneProgressPayload;
}

@injectable()
export class GitService extends TypedEventEmitter<GitServiceEvents> {
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

  public async validateRepo(directoryPath: string): Promise<boolean> {
    if (!directoryPath) return false;

    try {
      await execAsync("git rev-parse --is-inside-work-tree", {
        cwd: directoryPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async cloneRepository(
    repoUrl: string,
    targetPath: string,
    cloneId: string,
  ): Promise<{ cloneId: string }> {
    const emitProgress = (
      status: CloneProgressPayload["status"],
      message: string,
    ) => {
      this.emit(GitServiceEvent.CloneProgress, { cloneId, status, message });
    };

    emitProgress("cloning", `Starting clone of ${repoUrl}...`);

    const gitProcess = spawn(
      "git",
      ["clone", "--progress", repoUrl, targetPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    gitProcess.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      emitProgress("cloning", output.trim());
    });

    gitProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      emitProgress("cloning", output.trim());
    });

    return new Promise((resolve, reject) => {
      gitProcess.on("close", (code) => {
        if (code === 0) {
          emitProgress("complete", "Clone completed successfully");
          resolve({ cloneId });
        } else {
          const errorMsg = `Clone failed with exit code ${code}`;
          emitProgress("error", errorMsg);
          reject(new Error(errorMsg));
        }
      });

      gitProcess.on("error", (err) => {
        const errorMsg = `Clone failed: ${err.message}`;
        emitProgress("error", errorMsg);
        reject(err);
      });
    });
  }

  public async getRemoteUrl(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["remote", "get-url", "origin"],
        {
          cwd: directoryPath,
        },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async getCurrentBranch(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["branch", "--show-current"],
        {
          cwd: directoryPath,
        },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  }
}
