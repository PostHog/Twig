import type { Result } from "../result";
import type { NavigationResult } from "../types";
import { newOnTrunk } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to trunk and create a fresh change for new work.
 */
export async function trunk(): Promise<Result<NavigationResult>> {
  return newOnTrunk();
}

export const trunkCommand: Command<NavigationResult> = {
  meta: {
    name: "trunk",
    description: "Go directly to trunk, starting a fresh change",
    category: "navigation",
  },
  run: trunk,
};
