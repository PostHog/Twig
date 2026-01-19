import { getAllBranchMetadata } from "@twig/core/git/metadata";

/**
 * Hidden debug command to dump all arr refs metadata.
 * Usage: arr __dump-refs
 *
 * Shows the contents of all refs/arr/* blobs, which store
 * metadata about changes (PR info, etc.).
 */
export async function dumpRefs(): Promise<void> {
  const branchMetadata = getAllBranchMetadata();

  if (branchMetadata.size === 0) {
    console.log("No arr refs found.");
    return;
  }

  for (const [branchName, meta] of branchMetadata) {
    console.log(`=== arr/${branchName} ===`);
    if (meta) {
      console.log(JSON.stringify(meta, null, 2));
    } else {
      console.log("(failed to read metadata)");
    }
    console.log();
  }
}
