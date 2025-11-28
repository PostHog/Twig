import { createIpcHandler } from "../lib/ipcHandler";
import { shellManager } from "../lib/shellManager";

const handle = createIpcHandler("shell");

export function registerShellIpc(): void {
  handle("shell:create", (event, sessionId: string, cwd?: string) => {
    shellManager.createSession({
      sessionId,
      webContents: event.sender,
      cwd,
    });
  });

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
