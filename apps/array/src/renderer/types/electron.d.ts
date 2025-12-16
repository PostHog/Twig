import type { ContentBlock } from "@agentclientprotocol/sdk";
import type {
  ChangedFile,
  CreateWorkspaceOptions,
  RegisteredFolder,
  ScriptExecutionResult,
  TaskArtifact,
  Workspace,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
} from "@shared/types";
import "@main/services/types";
import type { CloudRegion, OAuthTokenResponse } from "@shared/types/oauth";

declare global {
  interface IElectronAPI {
    // OAuth API
    oauthStartFlow: (region: CloudRegion) => Promise<{
      success: boolean;
      data?: OAuthTokenResponse;
      error?: string;
    }>;
    oauthRefreshToken: (
      refreshToken: string,
      region: CloudRegion,
    ) => Promise<{
      success: boolean;
      data?: OAuthTokenResponse;
      error?: string;
    }>;
    oauthCancelFlow: () => Promise<{ success: boolean; error?: string }>;
    validateRepo: (directoryPath: string) => Promise<boolean>;
    cloneRepository: (
      repoUrl: string,
      targetPath: string,
      cloneId: string,
    ) => Promise<{ cloneId: string }>;
    onCloneProgress: (
      cloneId: string,
      listener: (event: {
        status: "cloning" | "complete" | "error";
        message: string;
      }) => void,
    ) => () => void;
    listRepoFiles: (
      repoPath: string,
      query?: string,
      limit?: number,
    ) => Promise<Array<{ path: string; name: string }>>;
    agentStart: (params: {
      taskId: string;
      taskRunId: string;
      repoPath: string;
      apiKey: string;
      apiHost: string;
      projectId: number;
      permissionMode?: string;
      autoProgress?: boolean;
      model?: string;
      executionMode?: "plan";
      runMode?: "local" | "cloud";
      createPR?: boolean;
    }) => Promise<{ sessionId: string; channel: string }>;
    agentPrompt: (
      sessionId: string,
      prompt: ContentBlock[],
    ) => Promise<{ stopReason: string }>;
    agentCancel: (sessionId: string) => Promise<boolean>;
    agentCancelPrompt: (sessionId: string) => Promise<boolean>;
    agentReconnect: (params: {
      taskId: string;
      taskRunId: string;
      repoPath: string;
      apiKey: string;
      apiHost: string;
      projectId: number;
      logUrl?: string;
      sdkSessionId?: string;
    }) => Promise<{ sessionId: string; channel: string } | null>;
    agentTokenRefresh: (taskRunId: string, newToken: string) => Promise<void>;
    agentSetModel: (sessionId: string, modelId: string) => Promise<void>;
    onAgentEvent: (
      channel: string,
      listener: (event: unknown) => void,
    ) => () => void;
    // Task artifact operations
    ensurePosthogFolder: (repoPath: string, taskId: string) => Promise<string>;
    listTaskArtifacts: (
      repoPath: string,
      taskId: string,
    ) => Promise<TaskArtifact[]>;
    readTaskArtifact: (
      repoPath: string,
      taskId: string,
      fileName: string,
    ) => Promise<string | null>;
    appendToArtifact: (
      repoPath: string,
      taskId: string,
      fileName: string,
      content: string,
    ) => Promise<void>;
    saveQuestionAnswers: (
      repoPath: string,
      taskId: string,
      answers: Array<{
        questionId: string;
        selectedOption: string;
        customInput?: string;
      }>,
    ) => Promise<void>;
    readRepoFile: (
      repoPath: string,
      filePath: string,
    ) => Promise<string | null>;
    writeRepoFile: (
      repoPath: string,
      filePath: string,
      content: string,
    ) => Promise<void>;
    getChangedFilesHead: (repoPath: string) => Promise<ChangedFile[]>;
    getFileAtHead: (
      repoPath: string,
      filePath: string,
    ) => Promise<string | null>;
    getDiffStats: (repoPath: string) => Promise<{
      filesChanged: number;
      linesAdded: number;
      linesRemoved: number;
    }>;
    getCurrentBranch: (repoPath: string) => Promise<string | undefined>;
    getDefaultBranch: (repoPath: string) => Promise<string>;
    getAllBranches: (repoPath: string) => Promise<string[]>;
    createBranch: (repoPath: string, branchName: string) => Promise<void>;
    discardFileChanges: (
      repoPath: string,
      filePath: string,
      fileStatus: string,
    ) => Promise<void>;
    getGitSyncStatus: (repoPath: string) => Promise<{
      ahead: number;
      behind: number;
      hasRemote: boolean;
      currentBranch: string | null;
      isFeatureBranch: boolean;
    }>;
    getLatestCommit: (repoPath: string) => Promise<{
      sha: string;
      shortSha: string;
      message: string;
      author: string;
      date: string;
    } | null>;
    getGitRepoInfo: (repoPath: string) => Promise<{
      organization: string;
      repository: string;
      currentBranch: string | null;
      defaultBranch: string;
      compareUrl: string | null;
    } | null>;
    listDirectory: (
      dirPath: string,
    ) => Promise<
      Array<{ name: string; path: string; type: "file" | "directory" }>
    >;
    watcherStart: (repoPath: string) => Promise<void>;
    watcherStop: (repoPath: string) => Promise<void>;
    onDirectoryChanged: (
      listener: (data: { repoPath: string; dirPath: string }) => void,
    ) => () => void;
    onFileChanged: (
      listener: (data: { repoPath: string; filePath: string }) => void,
    ) => () => void;
    onFileDeleted: (
      listener: (data: { repoPath: string; filePath: string }) => void,
    ) => () => void;
    onGitStateChanged: (
      listener: (data: { repoPath: string }) => void,
    ) => () => void;
    onOpenSettings: (listener: () => void) => () => void;
    onNewTask: (listener: () => void) => () => void;
    onResetLayout: (listener: () => void) => () => void;
    onClearStorage: (listener: () => void) => () => void;
    getAppVersion: () => Promise<string>;
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
    onUpdateStatus: (
      listener: (status: { checking: boolean; upToDate?: boolean }) => void,
    ) => () => void;
    onCheckForUpdatesMenu: (listener: () => void) => () => void;
    onUpdateReady: (listener: () => void) => () => void;
    installUpdate: () => Promise<{ installed: boolean }>;
    // Shell API
    shellCreate: (
      sessionId: string,
      cwd?: string,
      taskId?: string,
    ) => Promise<void>;
    shellWrite: (sessionId: string, data: string) => Promise<void>;
    shellResize: (
      sessionId: string,
      cols: number,
      rows: number,
    ) => Promise<void>;
    shellCheck: (sessionId: string) => Promise<boolean>;
    shellDestroy: (sessionId: string) => Promise<void>;
    shellGetProcess: (sessionId: string) => Promise<string | null>;
    onShellData: (
      sessionId: string,
      listener: (data: string) => void,
    ) => () => void;
    onShellExit: (sessionId: string, listener: () => void) => () => void;
    folders: {
      getFolders: () => Promise<RegisteredFolder[]>;
      addFolder: (folderPath: string) => Promise<RegisteredFolder>;
      removeFolder: (folderId: string) => Promise<void>;
      updateFolderAccessed: (folderId: string) => Promise<void>;
      clearAllData: () => Promise<void>;
      cleanupOrphanedWorktrees: (mainRepoPath: string) => Promise<{
        deleted: string[];
        errors: Array<{ path: string; error: string }>;
      }>;
    };
    workspace: {
      create: (options: CreateWorkspaceOptions) => Promise<WorkspaceInfo>;
      delete: (taskId: string, mainRepoPath: string) => Promise<void>;
      verify: (taskId: string) => Promise<boolean>;
      getInfo: (taskId: string) => Promise<WorkspaceInfo | null>;
      getAll: () => Promise<Record<string, Workspace>>;
      runStart: (
        taskId: string,
        worktreePath: string,
        worktreeName: string,
      ) => Promise<ScriptExecutionResult>;
      isRunning: (taskId: string) => Promise<boolean>;
      getTerminals: (taskId: string) => Promise<WorkspaceTerminalInfo[]>;
      onTerminalCreated: (
        listener: (data: WorkspaceTerminalInfo & { taskId: string }) => void,
      ) => () => void;
      onError: (
        listener: (data: { taskId: string; message: string }) => void,
      ) => () => void;
      onWarning: (
        listener: (data: {
          taskId: string;
          title: string;
          message: string;
        }) => void,
      ) => () => void;
    };
    shellExecute: (
      cwd: string,
      command: string,
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  }

  interface Window {
    electronAPI: IElectronAPI;
  }
}
