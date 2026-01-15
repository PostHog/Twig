import {
  daemonRestart,
  daemonStart,
  daemonStatus,
  daemonStop,
} from "@array/core/commands/daemon";
import { cyan, dim, formatSuccess, green, message, red } from "../utils/output";
import { unwrap } from "../utils/run";

export async function daemon(subcommand: string): Promise<void> {
  switch (subcommand) {
    case "start": {
      unwrap(await daemonStart());
      message(formatSuccess("Daemon started"));
      message(dim("  Watching workspaces for file changes"));
      message(dim("  Stop with: arr daemon stop"));
      break;
    }

    case "stop": {
      unwrap(await daemonStop());
      message(formatSuccess("Daemon stopped"));
      break;
    }

    case "restart": {
      unwrap(await daemonRestart());
      message(formatSuccess("Daemon restarted"));
      break;
    }

    case "status": {
      const status = unwrap(await daemonStatus());
      if (status.running) {
        message(
          `${green("●")} Daemon is ${green("running")} (PID: ${status.pid})`,
        );
        if (status.repos.length > 0) {
          message("");
          message("Watching repos:");
          for (const repo of status.repos) {
            message(`  ${dim(repo.path)}`);
            for (const ws of repo.workspaces) {
              message(`    └─ ${ws}`);
            }
          }
        } else {
          message("");
          message(
            dim("No repos registered. Use arr preview to register workspaces."),
          );
        }
        message("");
        message(`Logs: ${dim(status.logPath)}`);
      } else {
        message(`${red("○")} Daemon is ${dim("not running")}`);
        message("");
        message(`Start with: ${cyan("arr daemon start")}`);
      }
      break;
    }

    default:
      message("Usage: arr daemon <start|stop|restart|status>");
      message("");
      message("Subcommands:");
      message("  start    Start the workspace sync daemon");
      message("  stop     Stop the daemon");
      message("  restart  Restart the daemon");
      message("  status   Check if daemon is running");
  }
}
