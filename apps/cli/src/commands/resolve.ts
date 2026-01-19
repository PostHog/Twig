import { resolve as coreResolve } from "@twig/core/commands/resolve";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  cyan,
  formatSuccess,
  hint,
  indent,
  message,
  red,
  warning,
} from "../utils/output";
import { unwrap } from "../utils/run";

export async function resolve(): Promise<void> {
  const result = unwrap(await coreResolve());

  // Show what was resolved
  const resolvedLabel = result.resolved.description || result.resolved.changeId;
  message(formatSuccess(`Applied resolution to "${resolvedLabel}"`));

  // Check if there are more conflicts
  if (result.nextConflict) {
    blank();
    warning(`More conflicts at "${result.nextConflict.description}"`);
    blank();
    for (const file of result.nextConflict.conflictedFiles) {
      indent(`${red("C")} ${file}`);
    }
    blank();
    hint(
      `Resolve the conflicts, then run ${arr(COMMANDS.resolve)} to continue`,
    );
    return;
  }

  // All done
  if (result.returnedTo) {
    blank();
    message(formatSuccess("All conflicts resolved"));
    blank();
    message(`Returned to ${cyan(result.returnedTo)}`);
  } else {
    message(formatSuccess("Conflict resolved"));
  }
}
