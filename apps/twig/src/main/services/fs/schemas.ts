import { z } from "zod";

export const listRepoFilesInput = z.object({
  repoPath: z.string(),
  query: z.string().optional(),
  limit: z.number().optional(),
});

export const readRepoFileInput = z.object({
  repoPath: z.string(),
  filePath: z.string(),
});

export const readAbsoluteFileInput = z.object({
  filePath: z.string(),
});

export const writeRepoFileInput = z.object({
  repoPath: z.string(),
  filePath: z.string(),
  content: z.string(),
});

export const getFileStatsInput = z.object({
  repoPath: z.string(),
  filePath: z.string(),
});

const fileEntry = z.object({
  path: z.string(),
  name: z.string(),
  changed: z.boolean().optional(),
});

export const listRepoFilesOutput = z.array(fileEntry);
export const readRepoFileOutput = z.string().nullable();
export const getFileStatsOutput = z.object({ mtime: z.number() }).nullable();

export type ListRepoFilesInput = z.infer<typeof listRepoFilesInput>;
export type ReadRepoFileInput = z.infer<typeof readRepoFileInput>;
export type WriteRepoFileInput = z.infer<typeof writeRepoFileInput>;
export type GetFileStatsInput = z.infer<typeof getFileStatsInput>;
export type FileEntry = z.infer<typeof fileEntry>;
