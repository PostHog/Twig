import { isGhInstalled } from "@twig/core/auth";
import { submit as submitCmd } from "@twig/core/commands/submit";
import { submitWorkspace } from "@twig/core/commands/workspace-submit";
import type { ArrContext } from "@twig/core/engine";
import { checkPrerequisites } from "@twig/core/init";
import { listWorkspaces } from "@twig/core/jj/workspace";
import {
  blank,
  cyan,
  dim,
  formatSuccess,
  green,
  indent,
  message,
  printInstallInstructions,
  status,
  yellow,
} from "../utils/output";
import { confirm, textInput } from "../utils/prompt";
import { unwrap } from "../utils/run";

export async function submit(
  args: string[],
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

  // Check if first arg is a workspace name - if so, route to workspace submit
  const workspaceName = args[0];
  if (workspaceName) {
    const workspaces = await listWorkspaces();
    if (workspaces.ok) {
      const ws = workspaces.value.find((w) => w.name === workspaceName);
      if (ws) {
        // Route to workspace submit
        const draft = Boolean(flags.draft || flags.d);
        let msg = (flags.message ?? flags.m) as string | undefined;

        let result = await submitWorkspace(workspaceName, {
          draft,
          message: msg,
        });

        // If missing message, prompt for it
        if (!result.ok && result.error.code === "MISSING_MESSAGE") {
          const prompted = await textInput("Commit message");
          if (!prompted) {
            message(dim("Cancelled"));
            return;
          }
          msg = prompted;
          result = await submitWorkspace(workspaceName, {
            draft,
            message: msg,
          });
        }

        const value = unwrap(result);

        if (value.status === "created") {
          message(formatSuccess(`Created PR for ${cyan(value.workspace)}`));
        } else {
          message(formatSuccess(`Updated PR for ${cyan(value.workspace)}`));
        }
        message(`  ${dim("PR:")} ${value.prUrl}`);
        message(`  ${dim("Branch:")} ${value.bookmark}`);
        return;
      }
    }
  }

  const skipConfirm = Boolean(flags.yes || flags.y || flags["no-dry-run"]);
  const dryRunOnly = Boolean(flags["dry-run"]);
  const isTTY = process.stdin.isTTY;

  // First, do a dry run to show what would happen
  status("Planning submit...");
  blank();

  const plan = unwrap(
    await submitCmd({
      draft: Boolean(flags.draft),
      engine: ctx.engine,
      dryRun: true,
    }),
  );

  // Only show PRs that would be created or updated
  const actionablePrs = plan.prs.filter(
    (pr) => pr.status !== "synced" && pr.status !== "untracked",
  );

  if (actionablePrs.length === 0) {
    message(dim("Nothing to submit"));
    return;
  }

  // Show the plan
  for (const pr of actionablePrs) {
    const action = pr.status === "created" ? green("Create") : yellow("Update");
    message(`${action} PR: ${cyan(pr.bookmarkName)}`);
    indent(`base: ${dim(pr.base)}`);
  }

  // Summary
  const parts: string[] = [];
  if (plan.created > 0) parts.push(`${green("Create:")} ${plan.created}`);
  if (plan.updated > 0) parts.push(`${yellow("Update:")} ${plan.updated}`);
  if (plan.synced > 0) parts.push(`${dim(`(${plan.synced} unchanged)`)}`);

  if (parts.length > 0) {
    blank();
    message(parts.join("  "));
  }

  // Dry run only - exit without executing
  if (dryRunOnly) {
    return;
  }

  // Non-TTY without confirmation flag - exit with hint
  if (!isTTY && !skipConfirm) {
    blank();
    message(
      dim("Run with -y or --no-dry-run to execute in non-interactive mode"),
    );
    return;
  }

  // Ask for confirmation (unless skipping)
  if (!skipConfirm) {
    blank();
    const confirmed = await confirm("Proceed?", { autoYes: false });
    if (!confirmed) {
      message(dim("Cancelled"));
      return;
    }
  }

  // Execute the actual submit
  blank();
  status("Submitting...");
  blank();

  const result = unwrap(
    await submitCmd({
      draft: Boolean(flags.draft),
      engine: ctx.engine,
      dryRun: false,
    }),
  );

  // Show results
  const completedPrs = result.prs.filter(
    (pr) => pr.status !== "synced" && pr.status !== "untracked",
  );

  for (const pr of completedPrs) {
    const label =
      pr.status === "created" ? green("Created") : yellow("Updated");
    message(`${label} PR #${pr.prNumber}: ${cyan(pr.bookmarkName)}`);
    indent(cyan(pr.prUrl));
  }

  // Final summary
  const finalParts: string[] = [];
  if (result.created > 0)
    finalParts.push(`${green("Created:")} ${result.created}`);
  if (result.updated > 0)
    finalParts.push(`${yellow("Updated:")} ${result.updated}`);

  if (finalParts.length > 0) {
    blank();
    message(finalParts.join("  "));
  }
}
