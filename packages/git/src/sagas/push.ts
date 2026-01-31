import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface PushInput {
  baseDir: string;
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  signal?: AbortSignal;
}

export interface PushOutput {
  branch: string;
  remote: string;
}

export class PushSaga extends Saga<PushInput, PushOutput> {
  protected async execute(input: PushInput): Promise<PushOutput> {
    const {
      baseDir,
      remote = "origin",
      branch,
      setUpstream = false,
      signal,
    } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const targetBranch =
      branch ?? (await git.revparse(["--abbrev-ref", "HEAD"]));
    if (targetBranch === "HEAD") {
      throw new Error("Cannot push: HEAD is detached");
    }

    const args = setUpstream
      ? ["-u", remote, targetBranch]
      : [remote, targetBranch];

    await this.step({
      name: "push",
      execute: () => git.push(args),
      rollback: async () => {},
    });

    return { branch: targetBranch, remote };
  }
}
