import type {
  EnvironmentCapabilities,
  EnvironmentType,
  FilesManager,
  GitManager,
  ShellManager,
  WorkspaceManager,
} from "./types.js";

export abstract class BaseEnvironment {
  abstract readonly type: EnvironmentType;
  abstract readonly capabilities: EnvironmentCapabilities;

  abstract readonly shell: ShellManager;
  abstract readonly workspace: WorkspaceManager;
  abstract readonly files: FilesManager;
  abstract readonly git: GitManager;
}
