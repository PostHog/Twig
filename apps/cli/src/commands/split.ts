import {
  getSplittableFiles,
  split as splitCmd,
} from "@array/core/commands/split";
import type { ArrContext } from "@array/core/engine";
import { cyan, dim, formatSuccess, hint, message, red } from "../utils/output";
import { textInput } from "../utils/prompt";
import { unwrap } from "../utils/run";

export async function split(
  paths: string[],
  options: { message?: string },
  ctx: ArrContext,
): Promise<void> {
  // Get splittable files for validation/preview
  const filesResult = unwrap(await getSplittableFiles());

  if (filesResult.length === 0) {
    message(`${red("error:")} No files in parent change to split`);
    return;
  }

  if (paths.length === 0) {
    message(`${red("error:")} No paths provided to split`);
    hint(`Files in parent: ${filesResult.map((f) => f.path).join(", ")}`);
    return;
  }

  // Show preview of what will be split
  const matchingFiles = filesResult.filter((f) =>
    paths.some((p) => f.path === p || f.path.startsWith(`${p}/`)),
  );

  if (matchingFiles.length === 0) {
    message(
      `${red("error:")} None of the specified paths match files in parent change`,
    );
    hint(`Files in parent: ${filesResult.map((f) => f.path).join(", ")}`);
    return;
  }

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
      message(`${red("error:")} Description is required`);
      return;
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
