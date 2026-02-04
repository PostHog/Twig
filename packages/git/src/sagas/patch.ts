import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitSaga, type GitSagaInput } from "../git-saga.js";

export interface ApplyPatchInput extends GitSagaInput {
  patch: string;
  cached?: boolean;
}

export interface ApplyPatchOutput {
  applied: boolean;
}

export class ApplyPatchSaga extends GitSaga<ApplyPatchInput, ApplyPatchOutput> {
  private tempFile: string | null = null;
  private cached = false;

  protected async executeGitOperations(
    input: ApplyPatchInput,
  ): Promise<ApplyPatchOutput> {
    const { patch, cached = false } = input;
    this.cached = cached;

    this.tempFile = path.join(
      os.tmpdir(),
      `twig-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`,
    );

    await this.step({
      name: "write-patch-file",
      execute: () => fs.writeFile(this.tempFile!, patch, "utf-8"),
      rollback: () => fs.rm(this.tempFile!, { force: true }),
    });

    const options = cached ? ["--cached"] : [];

    await this.step({
      name: "apply-patch",
      execute: () => this.git.applyPatch([this.tempFile!], options),
      rollback: async () => {
        const reverseOptions = this.cached
          ? ["--reverse", "--cached"]
          : ["--reverse"];
        await this.git
          .applyPatch([this.tempFile!], reverseOptions)
          .catch(() => {});
      },
    });

    await fs.rm(this.tempFile, { force: true });

    return { applied: true };
  }
}
