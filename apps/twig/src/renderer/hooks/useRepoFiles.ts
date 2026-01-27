import { queryClient } from "@renderer/lib/queryClient";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import type { MentionItem } from "@shared/types";
import { byLengthAsc, Fzf } from "fzf";
import { useMemo } from "react";

export interface FileItem {
  path: string;
  name: string;
  dir: string;
}

const FILE_DISPLAY_LIMIT = 20;

export function pathToFileItem(path: string): FileItem {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  const dir = parts.join("/");
  return { path, name, dir };
}

function transformRawFiles(rawFiles: MentionItem[]): FileItem[] {
  return rawFiles
    .filter((file): file is MentionItem & { path: string } => !!file.path)
    .map((file) => pathToFileItem(file.path));
}

function createFzf(files: FileItem[]): Fzf<FileItem[]> {
  return new Fzf(files, {
    selector: (item) => `${item.name} ${item.path}`,
    limit: FILE_DISPLAY_LIMIT,
    tiebreakers: [byLengthAsc],
  });
}

export function useRepoFiles(repoPath: string | undefined, enabled = true) {
  const { data: rawFiles, isLoading } = trpcReact.fs.listRepoFiles.useQuery(
    { repoPath: repoPath ?? "" },
    { enabled: enabled && !!repoPath },
  );

  const files: FileItem[] = useMemo(() => {
    if (!rawFiles) return [];
    return transformRawFiles(rawFiles);
  }, [rawFiles]);

  const fzf = useMemo(() => createFzf(files), [files]);

  return { files, fzf, isLoading };
}

export function searchFiles(
  fzf: Fzf<FileItem[]>,
  files: FileItem[],
  query: string,
): FileItem[] {
  if (!query.trim()) {
    return files.slice(0, FILE_DISPLAY_LIMIT);
  }
  const results = fzf.find(query);
  return results.map((result) => result.item);
}

const fzfCache = new Map<
  string,
  { fzf: Fzf<FileItem[]>; filesLength: number }
>();

export async function fetchRepoFiles(repoPath: string): Promise<{
  files: FileItem[];
  fzf: Fzf<FileItem[]>;
}> {
  const queryKey = [
    ["fs", "listRepoFiles"],
    { input: { repoPath }, type: "query" },
  ];

  const rawFiles = await queryClient.fetchQuery({
    queryKey,
    queryFn: () => trpcVanilla.fs.listRepoFiles.query({ repoPath }),
    staleTime: 1000 * 60 * 5,
  });

  const files = transformRawFiles(rawFiles as MentionItem[]);

  const cached = fzfCache.get(repoPath);
  if (cached && cached.filesLength === files.length) {
    return { files, fzf: cached.fzf };
  }

  const fzf = createFzf(files);
  fzfCache.set(repoPath, { fzf, filesLength: files.length });
  return { files, fzf };
}
