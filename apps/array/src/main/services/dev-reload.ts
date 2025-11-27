import path from "node:path";
import { type FSWatcher, watch } from "chokidar";
import { app } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("dev-reload");

let watcher: FSWatcher | null = null;

export function setupAgentHotReload(): void {
  if (watcher) return;

  const monorepoRoot = path.resolve(app.getAppPath(), "../..");
  const agentDistPath = path.join(monorepoRoot, "packages/agent/dist");

  log.info(`Watching agent package: ${agentDistPath}`);

  let debounceTimeout: NodeJS.Timeout | null = null;

  watcher = watch(agentDistPath, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });

  watcher.on("change", (filePath) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      log.info(`Agent rebuilt: ${path.basename(filePath)}`);
      log.info("Exiting for mprocs to restart...");
      process.exit(0);
    }, 1000);
  });
}
