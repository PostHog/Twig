import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, dialog, shell } from "electron";
import { z } from "zod";
import { getWorktreeLocation } from "../../services/settingsStore.js";
import { getMainWindow } from "../context.js";
import { publicProcedure, router } from "../trpc.js";

const fsPromises = fs.promises;

const IMAGE_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  tif: "image/tiff",
};

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
        title: options?.title || "Twig",
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

  /**
   * Get the application version
   */
  getAppVersion: publicProcedure.query(() => app.getVersion()),

  /**
   * Get the worktree base location (e.g., ~/.twig)
   */
  getWorktreeLocation: publicProcedure.query(() => getWorktreeLocation()),

  /**
   * Read a file and return it as a base64 data URL
   * Used for image thumbnails in the editor
   */
  readFileAsDataUrl: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        maxSizeBytes: z
          .number()
          .optional()
          .default(10 * 1024 * 1024),
      }),
    )
    .query(async ({ input }) => {
      try {
        const stat = await fsPromises.stat(input.filePath);
        if (stat.size > input.maxSizeBytes) return null;

        const ext = path.extname(input.filePath).toLowerCase().slice(1);
        const mime = IMAGE_MIME_MAP[ext] ?? "application/octet-stream";

        const buffer = await fsPromises.readFile(input.filePath);
        return `data:${mime};base64,${buffer.toString("base64")}`;
      } catch {
        return null;
      }
    }),

  /**
   * Save pasted text to a temp file
   * Returns the file path for use as a file attachment
   */
  saveClipboardText: publicProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const filename = `pasted-text-${Date.now()}.txt`;
      const tempDir = path.join(os.tmpdir(), "twig-clipboard");

      await fsPromises.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, filename);

      await fsPromises.writeFile(filePath, input.text, "utf-8");

      return { path: filePath, name: "pasted-text.txt" };
    }),

  /**
   * Save clipboard image data to a temp file
   * Returns the file path for use as a file attachment
   */
  saveClipboardImage: publicProcedure
    .input(
      z.object({
        base64Data: z.string(),
        mimeType: z.string(),
        originalName: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const extension = input.mimeType.split("/")[1] || "png";
      const isGenericName =
        !input.originalName ||
        input.originalName === "image.png" ||
        input.originalName === "image.jpeg" ||
        input.originalName === "image.jpg";
      const displayName = isGenericName
        ? `clipboard.${extension}`
        : input.originalName!;
      // Add timestamp to actual filename to avoid collisions
      const baseName = displayName.replace(/\.[^.]+$/, "");
      const filename = `${baseName}-${Date.now()}.${extension}`;
      const tempDir = path.join(os.tmpdir(), "twig-clipboard");

      await fsPromises.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, filename);

      const buffer = Buffer.from(input.base64Data, "base64");
      await fsPromises.writeFile(filePath, buffer);

      return { path: filePath, name: displayName };
    }),
});
