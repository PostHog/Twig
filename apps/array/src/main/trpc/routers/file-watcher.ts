import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  type DirectoryChangedPayload,
  type FileChangedPayload,
  type FileDeletedPayload,
  FileWatcherEvent,
  type GitStateChangedPayload,
  listDirectoryInput,
  listDirectoryOutput,
  watcherInput,
} from "../../services/file-watcher/schemas.js";
import type { FileWatcherService } from "../../services/file-watcher/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<FileWatcherService>(MAIN_TOKENS.FileWatcherService);

function subscribe<T>(event: string) {
  return publicProcedure.subscription(async function* (opts): AsyncGenerator<
    T,
    void,
    unknown
  > {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(service, event, options)) {
      yield payload as T;
    }
  });
}

export const fileWatcherRouter = router({
  listDirectory: publicProcedure
    .input(listDirectoryInput)
    .output(listDirectoryOutput)
    .query(({ input }) => getService().listDirectory(input.dirPath)),

  start: publicProcedure
    .input(watcherInput)
    .mutation(({ input }) => getService().startWatching(input.repoPath)),

  stop: publicProcedure
    .input(watcherInput)
    .mutation(({ input }) => getService().stopWatching(input.repoPath)),

  onDirectoryChanged: subscribe<DirectoryChangedPayload>(
    FileWatcherEvent.DirectoryChanged,
  ),
  onFileChanged: subscribe<FileChangedPayload>(FileWatcherEvent.FileChanged),
  onFileDeleted: subscribe<FileDeletedPayload>(FileWatcherEvent.FileDeleted),
  onGitStateChanged: subscribe<GitStateChangedPayload>(
    FileWatcherEvent.GitStateChanged,
  ),
});
