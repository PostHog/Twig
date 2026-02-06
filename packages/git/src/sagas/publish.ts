import { GitSaga, type GitSagaInput } from "../git-saga.js";

export interface PublishInput extends GitSagaInput {
  remote?: string;
}

export interface PublishOutput {
  branch: string;
  remote: string;
}

export class PublishSaga extends GitSaga<PublishInput, PublishOutput> {
  protected async executeGitOperations(
    input: PublishInput,
  ): Promise<PublishOutput> {
    const { remote = "origin" } = input;

    const currentBranch = await this.readOnlyStep("get-current-branch", () =>
      this.git.revparse(["--abbrev-ref", "HEAD"]),
    );

    if (currentBranch === "HEAD") {
      throw new Error("Cannot publish: HEAD is detached");
    }

    await this.step({
      name: "push-with-upstream",
      execute: () => this.git.push(["-u", remote, currentBranch]),
      rollback: async () => {},
    });

    return { branch: currentBranch, remote };
  }
}
