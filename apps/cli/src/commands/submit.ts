import { isGhInstalled } from "@array/core/auth";
import { submit as submitCmd } from "@array/core/commands/submit";
import type { ArrContext } from "@array/core/engine";
import { checkPrerequisites } from "@array/core/init";
import {
  blank,
  cyan,
  dim,
  green,
  indent,
  message,
  printInstallInstructions,
  status,
  yellow,
} from "../utils/output";
import { unwrap } from "../utils/run";

export async function submit(
  flags: Record<string, string | boolean>,
  ctx: ArrContext,
): Promise<void> {
  const [prereqs, ghInstalled] = await Promise.all([
    checkPrerequisites(),
    isGhInstalled(),
  ]);

  const missing: ("jj" | "gh")[] = [];
  if (!prereqs.jj.found) missing.push("jj");
  if (!ghInstalled) missing.push("gh");

  if (missing.length > 0) {
    printInstallInstructions(missing);
    process.exit(1);
  }

  status("Submitting stack as linked PRs...");
  blank();

  const result = unwrap(
    await submitCmd({
      draft: Boolean(flags.draft),
      engine: ctx.engine,
    }),
  );

  // Only show PRs that were created or pushed (not synced)
  const changedPrs = result.prs.filter((pr) => pr.status !== "synced");

  for (const pr of changedPrs) {
    const label = pr.status === "created" ? green("Created") : yellow("Pushed");
    message(`${label} PR #${pr.prNumber}: ${cyan(pr.bookmarkName)}`);
    indent(cyan(pr.prUrl));
  }

  // Summary
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${green("Created:")} ${result.created}`);
  if (result.pushed > 0) parts.push(`${yellow("Pushed:")} ${result.pushed}`);
  if (result.synced > 0) parts.push(`${dim(`(${result.synced} unchanged)`)}`);

  if (parts.length > 0) {
    blank();
    message(parts.join("  "));
  }
}
