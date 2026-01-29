import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  CliInstallerEvent,
  type CliInstallerService,
  type PendingCliPath,
} from "../../services/cli-installer/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<CliInstallerService>(MAIN_TOKENS.CliInstallerService);

export const cliRouter = router({
  /**
   * Check if the CLI is installed
   */
  isInstalled: publicProcedure.query(() => {
    return getService().isInstalled();
  }),

  /**
   * Install the CLI command
   */
  install: publicProcedure.mutation(() => {
    return getService().install();
  }),

  /**
   * Uninstall the CLI command
   */
  uninstall: publicProcedure.mutation(() => {
    return getService().uninstall();
  }),

  /**
   * Subscribe to open-path events from CLI.
   * Emits path when `twig /path/to/repo` is called.
   */
  onOpenPath: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(CliInstallerEvent.OpenPath, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any pending path that arrived before renderer was ready.
   * This handles the case where the app is launched via CLI with a path.
   */
  getPendingPath: publicProcedure.query((): PendingCliPath | null => {
    return getService().consumePendingPath();
  }),
});
