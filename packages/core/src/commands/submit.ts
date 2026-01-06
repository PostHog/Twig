import type { Result } from "../result";
import { submitStack } from "../stacks";
import type { Command } from "./types";

interface SubmitResult {
  prs: Array<{
    bookmarkName: string;
    prNumber: number;
    prUrl: string;
    status: "created" | "pushed" | "synced";
  }>;
  created: number;
  pushed: number;
  synced: number;
}

interface SubmitOptions {
  draft?: boolean;
}

/**
 * Submit the current stack as linked PRs.
 */
export async function submit(
  options: SubmitOptions = {},
): Promise<Result<SubmitResult>> {
  return submitStack({ draft: options.draft });
}

export const submitCommand: Command<SubmitResult, [SubmitOptions?]> = {
  meta: {
    name: "submit",
    description: "Create or update GitHub PRs for the current stack",
    aliases: ["s"],
    category: "workflow",
    core: true,
  },
  run: submit,
};
