import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface InitRepositoryInput {
  baseDir: string;
  initialCommit?: boolean;
  commitMessage?: string;
  signal?: AbortSignal;
}

export interface InitRepositoryOutput {
  initialized: boolean;
  commitSha?: string;
}

export class InitRepositorySaga extends Saga<
  InitRepositoryInput,
  InitRepositoryOutput
> {
  private wasAlreadyRepo = false;

  protected async execute(
    input: InitRepositoryInput,
  ): Promise<InitRepositoryOutput> {
    const {
      baseDir,
      initialCommit = true,
      commitMessage = "Initial commit",
      signal,
    } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });
    const gitDir = path.join(baseDir, ".git");

    this.wasAlreadyRepo = await this.readOnlyStep(
      "check-existing-repo",
      async () => {
        try {
          const stat = await fs.stat(gitDir);
          return stat.isDirectory();
        } catch {
          return false;
        }
      },
    );

    await this.step({
      name: "init",
      execute: () => git.init(),
      rollback: async () => {
        if (!this.wasAlreadyRepo) {
          await fs.rm(gitDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    });

    if (initialCommit) {
      const result = await this.step({
        name: "initial-commit",
        execute: () =>
          git.commit(commitMessage, undefined, { "--allow-empty": null }),
        rollback: async () => {
          if (!this.wasAlreadyRepo) {
            await fs
              .rm(gitDir, { recursive: true, force: true })
              .catch(() => {});
          }
        },
      });
      return { initialized: true, commitSha: result.commit };
    }

    return { initialized: true };
  }
}
