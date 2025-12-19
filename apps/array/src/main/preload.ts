import { ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
import "electron-log/preload";

// No TRPC available, so just use IPC
process.on("uncaughtException", (error) => {
  ipcRenderer.send("preload-error", {
    message: error.message,
    stack: error.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  ipcRenderer.send("preload-error", {
    message: error.message,
    stack: error.stack,
  });
});

process.once("loaded", async () => {
  exposeElectronTRPC();
});
