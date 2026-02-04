import { Saga } from "@posthog/shared";
import type { GitClient } from "./client.js";
import { getGitOperationManager } from "./operation-manager.js";

export interface GitSagaInput {
  baseDir: string;
  signal?: AbortSignal;
}

export abstract class GitSaga<
  TInput extends GitSagaInput,
  TOutput,
> extends Saga<TInput, TOutput> {
  private _git: GitClient | null = null;

  protected get git(): GitClient {
    if (!this._git) {
      throw new Error("git client accessed before execute() was called");
    }
    return this._git;
  }

  protected async execute(input: TInput): Promise<TOutput> {
    const manager = getGitOperationManager();

    return manager.executeWrite(
      input.baseDir,
      async (git) => {
        this._git = git;
        return this.executeGitOperations(input);
      },
      { signal: input.signal },
    );
  }

  protected abstract executeGitOperations(input: TInput): Promise<TOutput>;
}
