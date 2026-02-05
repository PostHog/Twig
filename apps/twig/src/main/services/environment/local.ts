import type { FsService } from "../fs/service.js";
import type { GitService } from "../git/service.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { BaseEnvironment } from "./base.js";
import { LocalFilesManager } from "./managers/files.js";
import { LocalGitManager } from "./managers/git.js";
import { LocalShellManager } from "./managers/shell.js";
import { LocalWorkspaceManager } from "./managers/workspace.js";
import {
  type EnvironmentCapabilities,
  type EnvironmentType,
  type GitManager,
  LOCAL_CAPABILITIES,
  type WorkspaceManager,
} from "./types.js";

export interface LocalEnvironmentDependencies {
  processTrackingService: ProcessTrackingService;
  workspaceService: WorkspaceService;
  fsService: FsService;
  gitService: GitService;
}

export class LocalEnvironment extends BaseEnvironment {
  readonly type: EnvironmentType = "local";
  readonly capabilities: EnvironmentCapabilities = LOCAL_CAPABILITIES;

  readonly shell: LocalShellManager;
  readonly workspace: WorkspaceManager;
  readonly files: LocalFilesManager;
  readonly git: GitManager;

  constructor(deps: LocalEnvironmentDependencies) {
    super();
    this.shell = new LocalShellManager(deps.processTrackingService);
    this.workspace = new LocalWorkspaceManager(deps.workspaceService);
    this.files = new LocalFilesManager(deps.fsService);
    this.git = new LocalGitManager(deps.gitService);
  }
}
