import * as fs from "node:fs";
import * as os from "node:os";
import { type IpcMainInvokeEvent, ipcMain, type WebContents } from "electron";
import * as pty from "node-pty";
import { logger } from "../lib/logger";

const log = logger.scope("shell");

interface ShellSession {
  pty: pty.IPty;
  webContents: WebContents;
}

const sessions = new Map<string, ShellSession>();

function getDefaultShell(): string {
  const platform = os.platform();

  if (platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

export function registerShellIpc(): void {
  // Create new shell session
  ipcMain.handle(
    "shell:create",
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      cwd?: string,
    ): Promise<void> => {
      try {
        const existing = sessions.get(sessionId);
        if (existing) {
          return;
        }

        const shell = getDefaultShell();
        const homeDir = os.homedir();
        let workingDir = cwd || homeDir;

        // Validate that the directory exists
        if (!fs.existsSync(workingDir)) {
          log.warn(
            `Shell session ${sessionId}: cwd "${workingDir}" does not exist, falling back to home directory`,
          );
          workingDir = homeDir;
        }

        // Build environment with proper locale settings for macOS
        const env = { ...process.env } as Record<string, string>;

        // On macOS, ensure locale is properly set for shell compatibility
        if (os.platform() === "darwin" && !process.env.LC_ALL) {
          const locale = process.env.LC_CTYPE || "en_US.UTF-8";
          env.LANG = locale;
          env.LC_ALL = locale;
          env.LC_MESSAGES = locale;
          env.LC_NUMERIC = locale;
          env.LC_COLLATE = locale;
          env.LC_MONETARY = locale;
        }

        env.TERM_PROGRAM = "Array";
        env.TERM_PROGRAM_VERSION = "0.4.0";
        env.COLORTERM = "truecolor";
        env.FORCE_COLOR = "3"; // truecolor

        // Spawn as login shell to properly load PATH and environment
        const shellArgs = ["-l"];

        const ptyProcess = pty.spawn(shell, shellArgs, {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: workingDir,
          env,
          encoding: null,
        });

        // Send data to renderer
        ptyProcess.onData((data: string) => {
          event.sender.send(`shell:data:${sessionId}`, data);
        });

        // Handle exit
        ptyProcess.onExit(({ exitCode, signal }) => {
          log.info(
            `Shell session ${sessionId} exited with code ${exitCode}, signal ${signal}`,
          );
          event.sender.send(`shell:exit:${sessionId}`);
          sessions.delete(sessionId);
        });

        sessions.set(sessionId, {
          pty: ptyProcess,
          webContents: event.sender,
        });
      } catch (error) {
        log.error(`Failed to create shell session ${sessionId}:`, error);
        throw error;
      }
    },
  );

  // Write data to shell
  ipcMain.handle(
    "shell:write",
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
      data: string,
    ): Promise<void> => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Shell session ${sessionId} not found`);
      }

      session.pty.write(data);
    },
  );

  // Resize shell
  ipcMain.handle(
    "shell:resize",
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
      cols: number,
      rows: number,
    ): Promise<void> => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Shell session ${sessionId} not found`);
      }

      session.pty.resize(cols, rows);
    },
  );

  // Check if shell session exists
  ipcMain.handle(
    "shell:check",
    async (_event: IpcMainInvokeEvent, sessionId: string): Promise<boolean> => {
      return sessions.has(sessionId);
    },
  );

  // Destroy shell session
  ipcMain.handle(
    "shell:destroy",
    async (_event: IpcMainInvokeEvent, sessionId: string): Promise<void> => {
      const session = sessions.get(sessionId);
      if (!session) {
        return; // Already destroyed
      }

      session.pty.kill();
      sessions.delete(sessionId);
    },
  );

  // Get foreground process name
  ipcMain.handle(
    "shell:get-process",
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
    ): Promise<string | null> => {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      return session.pty.process;
    },
  );
}
