import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface PublishInput {
  baseDir: string;
  remote?: string;
  signal?: AbortSignal;
}

export interface PublishOutput {
  branch: string;
  remote: string;
}

/** Push current branch with -u to set upstream tracking. */
export class PublishSaga extends Saga<PublishInput, PublishOutput> {
  protected async execute(input: PublishInput): Promise<PublishOutput> {
    const { baseDir, remote = "origin", signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const currentBranch = await this.readOnlyStep("get-current-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    if (currentBranch === "HEAD") {
      throw new Error("Cannot publish: HEAD is detached");
    }

    await this.step({
      name: "push-with-upstream",
      execute: () => git.push(["-u", remote, currentBranch]),
      rollback: async () => {},
    });

    return { branch: currentBranch, remote };
  }
}
