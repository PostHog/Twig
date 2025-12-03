import { createIpcHandler } from "../lib/ipcHandler";
import { shellManager } from "../lib/shellManager";
import { foldersStore } from "./store";
import { buildWorkspaceEnv } from "./workspace/workspaceEnv";

const handle = createIpcHandler("shell");

export function registerShellIpc(): void {
  handle(
    "shell:create",
    async (event, sessionId: string, cwd?: string, taskId?: string) => {
      let additionalEnv: Record<string, string> | undefined;

      if (taskId) {
        const associations = foldersStore.get("taskAssociations", []);
        const association = associations.find((a) => a.taskId === taskId);
        if (association && association.mode !== "cloud") {
          additionalEnv = await buildWorkspaceEnv({
            taskId,
            folderPath: association.folderPath,
            worktreePath: association.worktree?.worktreePath ?? null,
            worktreeName: association.worktree?.worktreeName ?? null,
            mode: association.mode,
          });
        }
      }

      shellManager.createSession({
        sessionId,
        webContents: event.sender,
        cwd,
        additionalEnv,
      });
    },
  );

  handle("shell:write", (_event, sessionId: string, data: string) => {
    shellManager.write(sessionId, data);
  });

  handle(
    "shell:resize",
    (_event, sessionId: string, cols: number, rows: number) => {
      shellManager.resize(sessionId, cols, rows);
    },
  );

  handle("shell:check", (_event, sessionId: string) => {
    return shellManager.hasSession(sessionId);
  });

  handle("shell:destroy", (_event, sessionId: string) => {
    shellManager.destroy(sessionId);
  });

  handle("shell:get-process", (_event, sessionId: string) => {
    return shellManager.getProcess(sessionId);
  });
}
