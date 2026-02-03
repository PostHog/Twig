import type { FileWatcherService } from "../file-watcher/service.js";
import type { FsService } from "../fs/service.js";
import type { GitService } from "../git/service.js";
import type { ShellService } from "../shell/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { BaseEnvironment } from "./base.js";
import { LocalFilesManager } from "./managers/files.js";
import { LocalGitManager } from "./managers/git.js";
import { LocalShellManager } from "./managers/shell.js";
import { LocalWorkspaceManager } from "./managers/workspace.js";
import {
  type EnvironmentCapabilities,
  type EnvironmentType,
  type FilesManager,
  type GitManager,
  LOCAL_CAPABILITIES,
  type ShellManager,
  type WorkspaceManager,
} from "./types.js";

export interface LocalEnvironmentDependencies {
  shellService: ShellService;
  workspaceService: WorkspaceService;
  fileWatcherService: FileWatcherService;
  fsService: FsService;
  gitService: GitService;
}

export class LocalEnvironment extends BaseEnvironment {
  readonly type: EnvironmentType = "local";
  readonly capabilities: EnvironmentCapabilities = LOCAL_CAPABILITIES;

  readonly shell: ShellManager;
  readonly workspace: WorkspaceManager;
  readonly files: FilesManager;
  readonly git: GitManager;

  constructor(deps: LocalEnvironmentDependencies) {
    super();
    this.shell = new LocalShellManager(deps.shellService);
    this.workspace = new LocalWorkspaceManager(deps.workspaceService);
    this.files = new LocalFilesManager(deps.fileWatcherService, deps.fsService);
    this.git = new LocalGitManager(deps.gitService);
  }
}
