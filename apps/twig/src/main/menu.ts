declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  app,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import log from "electron-log/main";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { AgentService } from "./services/agent/service.js";
import type { UIService } from "./services/ui/service.js";
import type { UpdatesService } from "./services/updates/service.js";

function getSystemInfo(): string {
  const commit = __BUILD_COMMIT__ ?? "dev";
  const buildDate = __BUILD_DATE__ ?? "dev";
  return [
    `Version: ${app.getVersion()}`,
    `Commit: ${commit}`,
    `Date: ${buildDate}`,
    `Electron: ${process.versions.electron}`,
    `Chromium: ${process.versions.chrome}`,
    `Node.js: ${process.versions.node}`,
    `V8: ${process.versions.v8}`,
    `OS: ${process.platform} ${process.arch} ${os.release()}`,
  ].join("\n");
}

export function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    buildAppMenu(),
    buildFileMenu(),
    buildEditMenu(),
    buildViewMenu(),
    buildWindowMenu(),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildAppMenu(): MenuItemConstructorOptions {
  return {
    label: "Twig",
    submenu: [
      {
        label: "About Twig",
        click: () => {
          const info = getSystemInfo();

          dialog
            .showMessageBox({
              type: "info",
              title: "About Twig",
              message: "Twig",
              detail: info,
              buttons: ["Copy", "OK"],
              defaultId: 1,
            })
            .then((result) => {
              if (result.response === 0) {
                clipboard.writeText(info);
              }
            });
        },
      },
      { type: "separator" },
      ...(app.isPackaged
        ? [
            {
              label: "Check for Updates...",
              click: () => {
                container
                  .get<UpdatesService>(MAIN_TOKENS.UpdatesService)
                  .triggerMenuCheck();
              },
            },
          ]
        : []),
      { type: "separator" },
      { role: "hide" as const },
      { role: "hideOthers" as const },
      { role: "unhide" as const },
      { type: "separator" as const },
      {
        label: "Settings...",
        accelerator: "CmdOrCtrl+,",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).openSettings();
        },
      },
      { type: "separator" as const },
      { role: "quit" as const },
    ],
  };
}

function buildFileMenu(): MenuItemConstructorOptions {
  return {
    label: "File",
    submenu: [
      {
        label: "New task",
        accelerator: "CmdOrCtrl+N",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).newTask();
        },
      },
      { type: "separator" },
      {
        label: "Developer",
        submenu: [
          {
            label: "Export application logs",
            click: async () => {
              const logPath = log.transports.file.getFile().path;

              try {
                await access(logPath);
              } catch {
                dialog.showMessageBox({
                  type: "warning",
                  title: "No Logs Found",
                  message: "No log file exists yet.",
                  detail: `Expected location: ${logPath}`,
                });
                return;
              }

              const timestamp = new Date()
                .toISOString()
                .replace(/[:.]/g, "-")
                .slice(0, 19);
              const defaultName = `twig-logs-${timestamp}.log`;
              const { filePath, canceled } = await dialog.showSaveDialog({
                title: "Export Logs",
                defaultPath: path.join(app.getPath("desktop"), defaultName),
                filters: [{ name: "Log Files", extensions: ["log"] }],
              });
              if (canceled || !filePath) return;

              const logContent = await readFile(logPath, "utf-8");
              const header = [
                "=".repeat(60),
                "  Twig Log Export",
                "=".repeat(60),
                "",
                getSystemInfo(),
                "",
                `Exported: ${new Date().toISOString()}`,
                "",
                "=".repeat(60),
                "",
              ].join("\n");

              await writeFile(filePath, header + logContent, "utf-8");
            },
          },
          {
            label: "Clear application storage",
            click: () => {
              container.get<UIService>(MAIN_TOKENS.UIService).clearStorage();
            },
          },
          {
            label: "Mark all agent sessions for recreation",
            click: () => {
              const count = container
                .get<AgentService>(MAIN_TOKENS.AgentService)
                .markAllSessionsForRecreation();
              dialog.showMessageBox({
                type: "info",
                title: "Sessions Marked",
                message: `Marked ${count} session(s) for recreation.\n\nThey will be recreated on the next prompt.`,
              });
            },
          },
        ],
      },
    ],
  };
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };
}

function buildViewMenu(): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      {
        label: "Reset layout",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).resetLayout();
        },
      },
    ],
  };
}

function buildWindowMenu(): MenuItemConstructorOptions {
  return {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front" },
    ],
  };
}
