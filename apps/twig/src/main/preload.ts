import { exposeElectronTRPC } from "@posthog/electron-trpc/main";
import "electron-log/preload";

process.once("loaded", async () => {
  exposeElectronTRPC();
});
