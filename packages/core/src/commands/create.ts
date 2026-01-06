import type { Result } from "../result";
import { create as stacksCreate } from "../stacks";
import type { Command } from "./types";

interface CreateResult {
  changeId: string;
  bookmarkName: string;
}

/**
 * Create a new change with the current file modifications.
 * Sets up bookmark and prepares for PR submission.
 */
export async function create(message: string): Promise<Result<CreateResult>> {
  return stacksCreate(message);
}

export const createCommand: Command<CreateResult, [string]> = {
  meta: {
    name: "create",
    args: "[message]",
    description: "Create a new change stacked on the current change",
    aliases: ["c"],
    category: "workflow",
    core: true,
  },
  run: create,
};
