import { status as statusCmd } from "@array/core/commands/status";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  cmd,
  cyan,
  dim,
  formatChangeId,
  formatDiffStats,
  green,
  hint,
  indent,
  message,
  red,
  warning,
  yellow,
} from "../utils/output";
import { unwrap } from "../utils/run";

export async function status(): Promise<void> {
  const { info, stats } = unwrap(await statusCmd());
  const statsStr = stats ? ` ${formatDiffStats(stats)}` : "";

  // Check if on main with no stack above (fresh start)
  const isOnMainFresh =
    info.isUndescribed &&
    info.stackPath.length === 1 &&
    info.stackPath[0] === "main";

  // Line 1: Current position with change ID (prefix highlighted)
  const changeId = formatChangeId(
    info.changeId.slice(0, 8),
    info.changeIdPrefix,
  );
  if (isOnMainFresh) {
    message(`${green("◉")} On ${cyan("main")} ${changeId}${statsStr}`);
  } else if (info.isUndescribed) {
    const label = info.hasChanges ? "(unsaved)" : "(empty)";
    message(`${green(label)} ${changeId}${statsStr}`);
    message(dim(`  ↳ ${info.stackPath.join(" → ")}`));
  } else {
    message(`${green(info.name)} ${changeId}${statsStr}`);
    message(dim(`  ↳ ${info.stackPath.join(" → ")}`));
  }

  // Conflicts
  if (info.conflicts.length > 0) {
    blank();
    warning("Conflicts:");
    for (const conflict of info.conflicts) {
      indent(`${red("C")} ${conflict.path}`);
    }
  }

  // Modified files
  if (info.modifiedFiles.length > 0) {
    blank();
    message(dim("Modified:"));
    for (const file of info.modifiedFiles) {
      const color =
        file.status === "added"
          ? green
          : file.status === "deleted"
            ? red
            : yellow;
      const statusPrefix =
        file.status === "added" ? "A" : file.status === "deleted" ? "D" : "M";
      indent(`${color(statusPrefix)} ${file.path}`);
    }
  }

  // Guidance
  blank();
  const { action, reason } = info.nextAction;

  if (isOnMainFresh && !info.hasChanges) {
    message(
      `Edit files, then run ${arr(COMMANDS.create)} to start a new stack`,
    );
    hint(`Or run ${arr(COMMANDS.top)} to return to your previous stack`);
  } else {
    switch (action) {
      case "continue":
        message(`Fix conflicts, then run ${cmd("jj squash")}`);
        break;
      case "create":
        if (reason === "unsaved") {
          message(`Run ${arr(COMMANDS.create)} to save as a new change`);
        } else {
          message(`Edit files, then run ${arr(COMMANDS.create)}`);
        }
        break;
      case "submit":
        message(
          `Run ${arr(COMMANDS.submit)} to ${reason === "update_pr" ? "update PR" : "create PR"}`,
        );
        break;
      case "up":
        message(`Run ${arr(COMMANDS.up)} to start a new change`);
        break;
    }
  }
}
