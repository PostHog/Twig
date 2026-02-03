import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import type { FsService } from "../fs/service.js";
import type { GitService } from "../git/service.js";
import type { ShellService } from "../shell/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import type { BaseEnvironment } from "./base.js";
import { CloudEnvironment } from "./cloud.js";
import { LocalEnvironment } from "./local.js";
import type { EnvironmentCapabilities, EnvironmentType } from "./types.js";

const log = logger.scope("environment-service");

@injectable()
export class EnvironmentService {
  private environments = new Map<string, BaseEnvironment>();
  private localEnvironment: LocalEnvironment | null = null;
  private cloudEnvironment: CloudEnvironment | null = null;

  constructor(
    @inject(MAIN_TOKENS.ShellService) private shellService: ShellService,
    @inject(MAIN_TOKENS.WorkspaceService)
    private workspaceService: WorkspaceService,
    @inject(MAIN_TOKENS.FileWatcherService)
    private fileWatcherService: FileWatcherService,
    @inject(MAIN_TOKENS.FsService) private fsService: FsService,
    @inject(MAIN_TOKENS.GitService) private gitService: GitService,
  ) {}

  create(taskId: string, type: EnvironmentType): BaseEnvironment {
    const existing = this.environments.get(taskId);
    if (existing) {
      log.warn("Environment already exists for task, returning existing", {
        taskId,
        existingType: existing.type,
        requestedType: type,
      });
      return existing;
    }

    const env =
      type === "local"
        ? this.getOrCreateLocalEnvironment()
        : this.getOrCreateCloudEnvironment();

    this.environments.set(taskId, env);
    log.info("Created environment", { taskId, type });

    return env;
  }

  get(taskId: string): BaseEnvironment | undefined {
    return this.environments.get(taskId);
  }

  getOrCreate(taskId: string, type: EnvironmentType): BaseEnvironment {
    return this.environments.get(taskId) ?? this.create(taskId, type);
  }

  remove(taskId: string): boolean {
    const existed = this.environments.delete(taskId);
    if (existed) {
      log.info("Removed environment", { taskId });
    }
    return existed;
  }

  getCapabilities(taskId: string): EnvironmentCapabilities | null {
    return this.environments.get(taskId)?.capabilities ?? null;
  }

  getType(taskId: string): EnvironmentType | null {
    return this.environments.get(taskId)?.type ?? null;
  }

  getLocalEnvironment(): LocalEnvironment {
    return this.getOrCreateLocalEnvironment();
  }

  getCloudEnvironment(): CloudEnvironment {
    return this.getOrCreateCloudEnvironment();
  }

  private getOrCreateLocalEnvironment(): LocalEnvironment {
    if (!this.localEnvironment) {
      this.localEnvironment = new LocalEnvironment({
        shellService: this.shellService,
        workspaceService: this.workspaceService,
        fileWatcherService: this.fileWatcherService,
        fsService: this.fsService,
        gitService: this.gitService,
      });
    }
    return this.localEnvironment;
  }

  private getOrCreateCloudEnvironment(): CloudEnvironment {
    if (!this.cloudEnvironment) {
      this.cloudEnvironment = new CloudEnvironment();
    }
    return this.cloudEnvironment;
  }
}
