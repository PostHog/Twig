import { BaseEnvironment } from "./base.js";
import { CloudFilesManager } from "./managers/files.js";
import { CloudGitManager } from "./managers/git.js";
import { CloudShellManager } from "./managers/shell.js";
import { CloudWorkspaceManager } from "./managers/workspace.js";
import {
  CLOUD_CAPABILITIES,
  type EnvironmentCapabilities,
  type EnvironmentType,
  type FilesManager,
  type GitManager,
  type ShellManager,
  type WorkspaceManager,
} from "./types.js";

export class CloudEnvironment extends BaseEnvironment {
  readonly type: EnvironmentType = "cloud";
  readonly capabilities: EnvironmentCapabilities = CLOUD_CAPABILITIES;

  readonly shell: ShellManager;
  readonly workspace: WorkspaceManager;
  readonly files: FilesManager;
  readonly git: GitManager;

  private cloudWorkspaceManager: CloudWorkspaceManager;

  constructor() {
    super();
    this.shell = new CloudShellManager();
    this.cloudWorkspaceManager = new CloudWorkspaceManager();
    this.workspace = this.cloudWorkspaceManager;
    this.files = new CloudFilesManager();
    this.git = new CloudGitManager();
  }

  updateProvisioningStatus(
    taskId: string,
    status: "pending" | "provisioning" | "ready" | "error",
    message?: string,
    sandboxUrl?: string,
  ): void {
    this.cloudWorkspaceManager.updateProvisioningStatus(
      taskId,
      status,
      message,
      sandboxUrl,
    );
  }

  getSandboxUrl(taskId: string): string | undefined {
    return this.cloudWorkspaceManager.getSandboxUrl(taskId);
  }
}
