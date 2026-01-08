import { $ } from "bun";

/**
 * Hidden debug command to dump all arr refs metadata.
 * Usage: arr __dump-refs
 *
 * Shows the contents of all refs/arr/* blobs, which store
 * metadata about changes (PR info, etc.).
 */
export async function dumpRefs(): Promise<void> {
  const result =
    await $`git for-each-ref refs/arr --format='%(refname:short)'`.quiet();
  const refs = result.stdout.toString().trim().split("\n").filter(Boolean);

  if (refs.length === 0) {
    console.log("No arr refs found.");
    return;
  }

  for (const ref of refs) {
    console.log(`=== ${ref} ===`);
    const blob = await $`git cat-file blob refs/${ref}`.quiet();
    const content = blob.stdout.toString().trim();
    try {
      console.log(JSON.stringify(JSON.parse(content), null, 2));
    } catch {
      console.log(content);
    }
    console.log();
  }
}
