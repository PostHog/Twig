import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface ApplyPatchInput {
  baseDir: string;
  patch: string;
  cached?: boolean;
  signal?: AbortSignal;
}

export interface ApplyPatchOutput {
  applied: boolean;
}

export class ApplyPatchSaga extends Saga<ApplyPatchInput, ApplyPatchOutput> {
  private tempFile: string | null = null;
  private cached = false;

  protected async execute(input: ApplyPatchInput): Promise<ApplyPatchOutput> {
    const { baseDir, patch, cached = false, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });
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
      execute: () => git.applyPatch([this.tempFile!], options),
      rollback: async () => {
        const reverseOptions = this.cached
          ? ["--reverse", "--cached"]
          : ["--reverse"];
        await git.applyPatch([this.tempFile!], reverseOptions).catch(() => {});
      },
    });

    await fs.rm(this.tempFile, { force: true });

    return { applied: true };
  }
}
