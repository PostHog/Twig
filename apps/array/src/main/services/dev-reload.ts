import path from "node:path";
import { app } from "electron";
import { watch, type FSWatcher } from "chokidar";

let watcher: FSWatcher | null = null;

export function setupAgentHotReload(): void {
  if (watcher) return;

  const monorepoRoot = path.resolve(app.getAppPath(), "../..");
  const agentDistPath = path.join(monorepoRoot, "packages/agent/dist");

  console.log(`[dev] Watching agent package: ${agentDistPath}`);

  let debounceTimeout: NodeJS.Timeout | null = null;

  watcher = watch(agentDistPath, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });

  watcher.on("change", (filePath) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      console.log(`[dev] Agent rebuilt: ${path.basename(filePath)}`);
      console.log("[dev] Exiting for mprocs to restart...");
      process.exit(0);
    }, 1000);
  });
}
