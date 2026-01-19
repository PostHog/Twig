import { status as statusCmd } from "@twig/core/commands/status";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
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

export async function status(options: { debug?: boolean } = {}): Promise<void> {
  const debug = options.debug ?? false;
  const {
    info,
    stats,
    hasResolvedConflict: hasResolved,
  } = unwrap(await statusCmd({ debug }));
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
    // Only skip first element if it matches the name (i.e., current change has a bookmark)
    // Otherwise show full path (current change has no bookmark, just a description)
    const hasCurrentBookmark = info.stackPath[0] === info.name;
    const parentPath = hasCurrentBookmark
      ? info.stackPath.slice(1)
      : info.stackPath;
    if (parentPath.length > 0) {
      message(dim(`  ↳ ${parentPath.join(" → ")}`));
    }
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

  // Behind trunk warning
  if (info.isBehindTrunk && !info.hasConflicts) {
    blank();
    warning("Stack is behind trunk");
    hint(`Run ${arr(COMMANDS.restack)} to rebase onto latest trunk`);
    return;
  }

  // Guidance
  blank();
  const { action, reason } = info.nextAction;
  const parentBookmark = info.stackPath.length > 1 ? info.stackPath[0] : null;
  const hasTrackedParent = parentBookmark && parentBookmark !== "main";

  if (isOnMainFresh && !info.hasChanges) {
    message(
      `Edit files, then run ${arr(COMMANDS.create)} to start a new stack`,
    );
    hint(`Or ${arr(COMMANDS.top)} to return to your previous stack`);
  } else if (action === "continue") {
    if (hasResolved) {
      message(`${arr(COMMANDS.resolve)} to apply conflict resolution`);
    } else {
      message(`Fix conflicts, then run ${arr(COMMANDS.resolve)}`);
    }
  } else if (info.hasChanges) {
    // WC has uncommitted changes - show create/modify hints (matching arr log)
    message(
      `${arr(COMMANDS.create)} ${dim('"message"')} ${dim("to save as new change")}`,
    );
    if (hasTrackedParent) {
      message(`${arr(COMMANDS.modify)} ${dim(`to update ${parentBookmark}`)}`);
    }
  } else if (action === "submit") {
    message(
      `${arr(COMMANDS.submit)} to ${reason === "update_pr" ? "update PR" : "create PR"}`,
    );
  } else {
    // No changes yet - prompt to edit files
    message(`${dim("Edit files to get started")}`);
  }
}
