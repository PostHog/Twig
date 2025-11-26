import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const fsPromises = fs.promises;

let dataDir: string | null = null;

function isFileNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function logAndThrowError(message: string, error: unknown): never {
  console.error(message, error);
  throw error;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

export function getDataDirectory(): string {
  if (!dataDir) {
    const userDataPath = app.getPath("userData");
    dataDir = path.join(userDataPath, "data");
  }
  return dataDir;
}

export async function ensureDataDirectory(): Promise<void> {
  const dir = getDataDirectory();
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (error) {
    logAndThrowError("Failed to create data directory:", error);
  }
}

export function getDataFilePath(filename: string): string {
  return path.join(getDataDirectory(), filename);
}

export async function readDataFile<T>(filename: string): Promise<T | null> {
  const filePath = getDataFilePath(filename);
  try {
    const content = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    logAndThrowError(`Failed to read data file ${filename}:`, error);
  }
}

export async function writeDataFile<T>(
  filename: string,
  data: T,
): Promise<void> {
  await ensureDataDirectory();
  const filePath = getDataFilePath(filename);
  const tempPath = `${filePath}.tmp`;

  try {
    await fsPromises.writeFile(
      tempPath,
      JSON.stringify(data, null, 2),
      "utf-8",
    );
    await fsPromises.rename(tempPath, filePath);
  } catch (error) {
    await cleanupTempFile(tempPath);
    logAndThrowError(`Failed to write data file ${filename}:`, error);
  }
}

export async function deleteDataFile(filename: string): Promise<void> {
  const filePath = getDataFilePath(filename);
  try {
    await fsPromises.unlink(filePath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      logAndThrowError(`Failed to delete data file ${filename}:`, error);
    }
  }
}

export async function clearDataDirectory(): Promise<void> {
  const dir = getDataDirectory();
  try {
    const files = await fsPromises.readdir(dir);
    await Promise.all(
      files.map((file) => fsPromises.unlink(path.join(dir, file))),
    );
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      logAndThrowError("Failed to clear data directory:", error);
    }
  }
}
