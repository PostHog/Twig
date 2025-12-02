import type {
  ExternalAppContextMenuResult,
  FolderContextMenuResult,
  SplitContextMenuResult,
  TabContextMenuResult,
  TaskContextMenuResult,
} from "@main/services/contextMenu.types";
import type { AgentEvent } from "@posthog/agent";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import type {
  ChangedFile,
  CreateWorkspaceOptions,
  DetectedApplication,
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
    storeApiKey: (apiKey: string) => Promise<string>;
    retrieveApiKey: (encryptedKey: string) => Promise<string | null>;
    fetchS3Logs: (logUrl: string) => Promise<AgentEvent[]>;
    rendererStore: {
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: string) => Promise<void>;
      removeItem: (key: string) => Promise<void>;
    };
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
    selectDirectory: () => Promise<string | null>;
    searchDirectories: (
      query: string,
      searchRoot?: string,
    ) => Promise<string[]>;
    findReposDirectory: () => Promise<string | null>;
    validateRepo: (directoryPath: string) => Promise<boolean>;
    checkWriteAccess: (directoryPath: string) => Promise<boolean>;
    detectRepo: (directoryPath: string) => Promise<{
      organization: string;
      repository: string;
      branch?: string;
      remote?: string;
    } | null>;
    validateRepositoryMatch: (
      path: string,
      organization: string,
      repository: string,
    ) => Promise<{
      valid: boolean;
      detected?: { organization: string; repository: string } | null;
      error?: string;
    }>;
    checkSSHAccess: () => Promise<{
      available: boolean;
      error?: string;
    }>;
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
    showMessageBox: (options: {
      type?: "none" | "info" | "error" | "question" | "warning";
      title?: string;
      message?: string;
      detail?: string;
      buttons?: string[];
      defaultId?: number;
      cancelId?: number;
    }) => Promise<{ response: number }>;
    openExternal: (url: string) => Promise<void>;
    listRepoFiles: (
      repoPath: string,
      query?: string,
    ) => Promise<Array<{ path: string; name: string }>>;
    clearRepoFileCache: (repoPath: string) => Promise<void>;
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
    agentListSessions: (taskId?: string) => Promise<
      Array<{
        sessionId: string;
        acpSessionId: string;
        channel: string;
        taskId: string;
      }>
    >;
    agentLoadSession: (sessionId: string, cwd: string) => Promise<boolean>;
    agentReconnect: (params: {
      taskId: string;
      taskRunId: string;
      repoPath: string;
      apiKey: string;
      apiHost: string;
      projectId: number;
      logUrl?: string;
    }) => Promise<{ sessionId: string; channel: string } | null>;
    onAgentEvent: (
      channel: string,
      listener: (event: unknown) => void,
    ) => () => void;
    // Task artifact operations
    readPlanFile: (repoPath: string, taskId: string) => Promise<string | null>;
    writePlanFile: (
      repoPath: string,
      taskId: string,
      content: string,
    ) => Promise<void>;
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
    getAppVersion: () => Promise<string>;
    onUpdateReady: (listener: () => void) => () => void;
    installUpdate: () => Promise<{ installed: boolean }>;
    // Shell API
    shellCreate: (sessionId: string, cwd?: string) => Promise<void>;
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
    showTaskContextMenu: (
      taskId: string,
      taskTitle: string,
      worktreePath?: string,
    ) => Promise<TaskContextMenuResult>;
    showFolderContextMenu: (
      folderId: string,
      folderName: string,
      folderPath?: string,
    ) => Promise<FolderContextMenuResult>;
    showTabContextMenu: (
      canClose: boolean,
      filePath?: string,
    ) => Promise<TabContextMenuResult>;
    showSplitContextMenu: () => Promise<SplitContextMenuResult>;
    showFileContextMenu: (
      filePath: string,
    ) => Promise<ExternalAppContextMenuResult>;
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
    externalApps: {
      getDetectedApps: () => Promise<DetectedApplication[]>;
      openInApp: (
        appId: string,
        path: string,
      ) => Promise<{ success: boolean; error?: string }>;
      setLastUsed: (appId: string) => Promise<void>;
      getLastUsed: () => Promise<{
        lastUsedApp?: string;
      }>;
      copyPath: (path: string) => Promise<void>;
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
    settings: {
      getWorktreeLocation: () => Promise<string>;
      setWorktreeLocation: (location: string) => Promise<void>;
    };
  }

  interface Window {
    electronAPI: IElectronAPI;
  }
}
