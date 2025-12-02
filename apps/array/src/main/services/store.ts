import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { app, ipcMain } from "electron";
import Store from "electron-store";
import { machineIdSync } from "node-machine-id";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types";
import { deleteWorktreeIfExists } from "./worktreeUtils";

// Key derived from hardware UUID - data only decryptable on this machine
// No keychain prompts, prevents token theft via cloud sync/backups
const APP_SALT = "array-v1";
const ENCRYPTION_VERSION = 1;

function getMachineKey(): Buffer {
  const machineId = machineIdSync();
  const identifier = [machineId, os.platform(), os.arch()].join("|");
  return crypto.scryptSync(identifier, APP_SALT, 32);
}

function encrypt(plaintext: string): string {
  const key = getMachineKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    v: ENCRYPTION_VERSION,
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: authTag.toString("base64"),
  });
}

function decrypt(encryptedJson: string): string | null {
  try {
    const { iv, data, tag } = JSON.parse(encryptedJson);
    const key = getMachineKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    return decipher.update(data, "base64", "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

interface FoldersSchema {
  folders: RegisteredFolder[];
  taskAssociations: TaskFolderAssociation[];
}

interface RendererStoreSchema {
  [key: string]: string;
}

const schema = {
  folders: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const },
        path: { type: "string" as const },
        name: { type: "string" as const },
        lastAccessed: { type: "string" as const },
        createdAt: { type: "string" as const },
      },
      required: ["id", "path", "name", "lastAccessed", "createdAt"],
    },
  },
  taskAssociations: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        folderId: { type: "string" as const },
        folderPath: { type: "string" as const },
        worktree: {
          type: "object" as const,
          properties: {
            worktreePath: { type: "string" as const },
            worktreeName: { type: "string" as const },
            branchName: { type: "string" as const },
            baseBranch: { type: "string" as const },
            createdAt: { type: "string" as const },
          },
        },
      },
      required: ["taskId", "folderId", "folderPath"],
    },
  },
};

function getStorePath(): string {
  const userDataPath = app.getPath("userData");
  if (userDataPath.includes("@posthog")) {
    return path.join(path.dirname(userDataPath), "Array");
  }
  return userDataPath;
}

export const foldersStore = new Store<FoldersSchema>({
  name: "folders",
  schema,
  cwd: getStorePath(),
  defaults: {
    folders: [],
    taskAssociations: [],
  },
});

export async function clearAllStoreData(): Promise<void> {
  // Delete all worktrees before clearing store
  const associations = foldersStore.get("taskAssociations", []);
  for (const assoc of associations) {
    if (assoc.worktree) {
      await deleteWorktreeIfExists(
        assoc.folderPath,
        assoc.worktree.worktreePath,
      );
    }
  }

  foldersStore.clear();
  rendererStore.clear();
}

export const rendererStore = new Store<RendererStoreSchema>({
  name: "renderer-storage",
  cwd: getStorePath(),
});

// IPC handlers for renderer storage with machine-key encryption
ipcMain.handle("renderer-store:get", (_event, key: string): string | null => {
  if (!rendererStore.has(key)) {
    return null;
  }
  const encrypted = rendererStore.get(key) as string;
  return decrypt(encrypted);
});

ipcMain.handle(
  "renderer-store:set",
  (_event, key: string, value: string): void => {
    rendererStore.set(key, encrypt(value));
  },
);

ipcMain.handle("renderer-store:remove", (_event, key: string): void => {
  rendererStore.delete(key);
});
