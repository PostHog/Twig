import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dialog, shell } from "electron";
import { z } from "zod";
import { getMainWindow } from "../context.js";
import { publicProcedure, router } from "../trpc.js";

const fsPromises = fs.promises;

const messageBoxOptionsSchema = z.object({
  type: z.enum(["none", "info", "error", "question", "warning"]).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  detail: z.string().optional(),
  buttons: z.array(z.string()).optional(),
  defaultId: z.number().optional(),
  cancelId: z.number().optional(),
});

const expandHomePath = (searchPath: string): string =>
  searchPath.startsWith("~")
    ? searchPath.replace(/^~/, os.homedir())
    : searchPath;

export const osRouter = router({
  /**
   * Show directory picker dialog
   */
  selectDirectory: publicProcedure.query(async () => {
    const win = getMainWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Select a repository folder",
      properties: [
        "openDirectory",
        "createDirectory",
        "treatPackageAsDirectory",
      ],
    });
    if (result.canceled || !result.filePaths?.length) {
      return null;
    }
    return result.filePaths[0];
  }),

  /**
   * Check if a directory has write access
   */
  checkWriteAccess: publicProcedure
    .input(z.object({ directoryPath: z.string() }))
    .query(async ({ input }) => {
      if (!input.directoryPath) return false;
      try {
        await fsPromises.access(input.directoryPath, fs.constants.W_OK);
        const testFile = path.join(
          input.directoryPath,
          `.agent-write-test-${Date.now()}`,
        );
        await fsPromises.writeFile(testFile, "ok");
        await fsPromises.unlink(testFile).catch(() => {});
        return true;
      } catch {
        return false;
      }
    }),

  /**
   * Show a message box dialog
   */
  showMessageBox: publicProcedure
    .input(z.object({ options: messageBoxOptionsSchema }))
    .mutation(async ({ input }) => {
      const win = getMainWindow();
      if (!win) throw new Error("Main window not available");

      const options = input.options;
      const result = await dialog.showMessageBox(win, {
        type: options?.type || "info",
        title: options?.title || "Array",
        message: options?.message || "",
        detail: options?.detail,
        buttons:
          Array.isArray(options?.buttons) && options.buttons.length > 0
            ? options.buttons
            : ["OK"],
        defaultId: options?.defaultId ?? 0,
        cancelId: options?.cancelId ?? 1,
      });
      return { response: result.response };
    }),

  /**
   * Open URL in external browser
   */
  openExternal: publicProcedure
    .input(z.object({ url: z.string() }))
    .mutation(async ({ input }) => {
      await shell.openExternal(input.url);
    }),

  /**
   * Search for directories matching a query
   */
  searchDirectories: publicProcedure
    .input(z.object({ query: z.string(), searchRoot: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.query?.trim()) return [];

      const searchPath = expandHomePath(input.query.trim());
      const lastSlashIdx = searchPath.lastIndexOf("/");
      const basePath =
        lastSlashIdx === -1 ? "" : searchPath.substring(0, lastSlashIdx + 1);
      const searchTerm =
        lastSlashIdx === -1
          ? searchPath
          : searchPath.substring(lastSlashIdx + 1);
      const pathToRead = basePath || os.homedir();

      try {
        const entries = await fsPromises.readdir(pathToRead, {
          withFileTypes: true,
        });
        const directories = entries.filter((entry) => entry.isDirectory());

        const filtered = searchTerm
          ? directories.filter((dir) =>
              dir.name.toLowerCase().includes(searchTerm.toLowerCase()),
            )
          : directories;

        return filtered
          .map((dir) => path.join(pathToRead, dir.name))
          .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
          .slice(0, 20);
      } catch {
        return [];
      }
    }),
});
