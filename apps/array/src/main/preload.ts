import { exposeElectronTRPC } from "trpc-electron/main";
import "electron-log/preload";

process.once("loaded", async () => {
  exposeElectronTRPC();
});
