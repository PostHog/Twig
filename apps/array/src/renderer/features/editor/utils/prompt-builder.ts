import { trpcVanilla } from "@renderer/trpc/client";

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    ts: "text/typescript",
    tsx: "text/typescript",
    js: "text/javascript",
    jsx: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    py: "text/x-python",
    css: "text/css",
    html: "text/html",
    yml: "text/yaml",
    yaml: "text/yaml",
  };
  return mimeTypes[ext ?? ""] ?? "text/plain";
}

export async function buildPromptBlocks(
  textContent: string,
  filePaths: string[],
  repoPath: string,
): Promise<
  Array<
    | { type: "text"; text: string }
    | {
        type: "resource";
        resource: { uri: string; mimeType: string; text: string };
      }
  >
> {
  const blocks: Array<
    | { type: "text"; text: string }
    | {
        type: "resource";
        resource: { uri: string; mimeType: string; text: string };
      }
  > = [];

  blocks.push({ type: "text", text: textContent });

  for (const relativePath of filePaths) {
    try {
      const fileContent = await trpcVanilla.fs.readRepoFile.query({
        repoPath,
        filePath: relativePath,
      });
      if (fileContent) {
        blocks.push({
          type: "resource",
          resource: {
            uri: `file://${repoPath}/${relativePath}`,
            mimeType: getMimeType(relativePath),
            text: fileContent,
          },
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return blocks;
}
