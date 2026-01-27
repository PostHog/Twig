import { previewSplit, split as splitCmd } from "@twig/core/commands/split";
import type { ArrContext } from "@twig/core/engine";
import {
  cyan,
  dim,
  formatError,
  formatSuccess,
  hint,
  message,
} from "../utils/output";
import { textInput } from "../utils/prompt";
import { unwrap } from "../utils/run";

export async function split(
  paths: string[],
  options: { message?: string },
  ctx: ArrContext,
): Promise<void> {
  // Get preview from core
  const previewResult = await previewSplit(paths);

  if (!previewResult.ok) {
    console.error(formatError(previewResult.error.message));
    if (
      previewResult.error.code === "INVALID_STATE" &&
      previewResult.error.message.includes("No paths provided")
    ) {
      // Fetch files to show hint
      const { getSplittableFiles } = await import("@twig/core/commands/split");
      const filesResult = await getSplittableFiles();
      if (filesResult.ok && filesResult.value.length > 0) {
        hint(
          `Files in parent: ${filesResult.value.map((f) => f.path).join(", ")}`,
        );
      }
    }
    process.exit(1);
  }

  const { matchingFiles } = previewResult.value;

  // Show preview
  message(
    `Splitting ${cyan(String(matchingFiles.length))} file${matchingFiles.length === 1 ? "" : "s"} into new change:`,
  );
  for (const file of matchingFiles) {
    console.log(`  ${dim(file.status)} ${file.path}`);
  }
  console.log();

  // Get description - from option or prompt
  let description = options.message;
  if (!description) {
    const input = await textInput("Description for new change");
    if (!input) {
      console.error(formatError("Description is required"));
      process.exit(1);
    }
    description = input;
  }

  const result = unwrap(
    await splitCmd({
      paths,
      description,
      engine: ctx.engine,
    }),
  );

  message(
    formatSuccess(
      `Split ${cyan(String(result.fileCount))} file${result.fileCount === 1 ? "" : "s"} into "${result.description}"`,
    ),
  );
  hint(`Tracking: ${cyan(result.bookmarkName)}`);
}
