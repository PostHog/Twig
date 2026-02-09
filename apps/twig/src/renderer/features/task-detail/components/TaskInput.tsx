import { TorchGlow } from "@components/TorchGlow";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { ModeIndicatorInput } from "@features/message-editor/components/ModeIndicatorInput";
import { getSessionService } from "@features/sessions/service/service";
import {
  cycleModeOption,
  getCurrentModeFromConfigOptions,
} from "@features/sessions/stores/sessionStore";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePreviewSession } from "../hooks/usePreviewSession";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { AdapterSelect } from "./AdapterSelect";
import { SuggestedTasks } from "./SuggestedTasks";
import { TaskInputEditor } from "./TaskInputEditor";
import { type WorkspaceMode, WorkspaceModeSelect } from "./WorkspaceModeSelect";

const DOT_FILL = "var(--gray-6)";

export function TaskInput() {
  const { view } = useNavigationStore();
  const { lastUsedDirectory, setLastUsedDirectory } = useTaskDirectoryStore();
  const {
    lastUsedLocalWorkspaceMode,
    setLastUsedLocalWorkspaceMode,
    lastUsedAdapter,
    setLastUsedAdapter,
    allowBypassPermissions,
  } = useSettingsStore();

  const editorRef = useRef<MessageEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const runMode = "local";
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);

  const selectedDirectory = lastUsedDirectory || "";
  const workspaceMode = lastUsedLocalWorkspaceMode || "worktree";
  const adapter = lastUsedAdapter;

  const setSelectedDirectory = (path: string) =>
    setLastUsedDirectory(path || null);
  const setWorkspaceMode = (mode: WorkspaceMode) =>
    setLastUsedLocalWorkspaceMode(mode as "worktree" | "local");
  const setAdapter = (newAdapter: AgentAdapter) =>
    setLastUsedAdapter(newAdapter);

  const { githubIntegration } = useRepositoryIntegration();

  // Preview session provides adapter-specific config options
  const {
    modeOption,
    modelOption,
    thoughtOption,
    previewTaskId,
    isConnecting,
  } = usePreviewSession(adapter, selectedDirectory || undefined);

  useEffect(() => {
    if (view.folderId) {
      const currentFolders = useRegisteredFoldersStore.getState().folders;
      const folder = currentFolders.find((f) => f.id === view.folderId);
      if (folder) {
        setLastUsedDirectory(folder.path);
      }
    }
  }, [view.folderId, setLastUsedDirectory]);

  const effectiveWorkspaceMode = workspaceMode;

  // Get current values from preview session config options for task creation
  const currentModel = modelOption?.currentValue;
  const currentExecutionMode = getCurrentModeFromConfigOptions(
    modeOption ? [modeOption] : undefined,
  );
  const currentReasoningLevel = thoughtOption?.currentValue;

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editorRef,
    selectedDirectory,
    githubIntegrationId: githubIntegration?.id,
    workspaceMode: effectiveWorkspaceMode,
    branch: null,
    editorIsEmpty,
    adapter,
    executionMode: currentExecutionMode,
    model: currentModel,
    reasoningLevel: currentReasoningLevel,
  });

  const handleCycleMode = useCallback(() => {
    const nextValue = cycleModeOption(modeOption, allowBypassPermissions);
    if (nextValue && modeOption) {
      getSessionService().setSessionConfigOption(
        previewTaskId,
        modeOption.id,
        nextValue,
      );
    }
  }, [modeOption, allowBypassPermissions, previewTaskId]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <TorchGlow containerRef={containerRef} />
      <Flex
        align="center"
        justify="center"
        height="100%"
        style={{ position: "relative" }}
      >
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100.333%",
            pointerEvents: "none",
            opacity: 0.4,
            maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, transparent 100%)",
          }}
        >
          <defs>
            <pattern
              id="dot-pattern"
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
            >
              <circle cx="0" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="0" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="4" cy="4" r="1" fill={DOT_FILL} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-pattern)" />
        </svg>
        <Flex
          direction="column"
          gap="4"
          style={{
            fontFamily: "monospace",
            width: "100%",
            maxWidth: "600px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Flex gap="2" align="center">
            <FolderPicker
              value={selectedDirectory}
              onChange={setSelectedDirectory}
              placeholder="Select repository..."
              size="1"
            />
            <WorkspaceModeSelect
              value={workspaceMode}
              onChange={(mode) => {
                setWorkspaceMode(mode);
                // Only persist local modes, not cloud
                if (mode !== "cloud") {
                  setLastUsedLocalWorkspaceMode(mode);
                }
              }}
              size="1"
            />
            <AdapterSelect value={adapter} onChange={setAdapter} size="1" />
          </Flex>

          <TaskInputEditor
            ref={editorRef}
            sessionId="task-input"
            repoPath={selectedDirectory}
            isCreatingTask={isCreatingTask}
            runMode={runMode}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            hasDirectory={!!selectedDirectory}
            onEmptyChange={setEditorIsEmpty}
            adapter={adapter}
            previewTaskId={previewTaskId}
            onCycleMode={handleCycleMode}
            isPreviewConnecting={isConnecting}
          />

          <ModeIndicatorInput
            modeOption={modeOption}
            onCycleMode={handleCycleMode}
          />

          <SuggestedTasks editorRef={editorRef} />
        </Flex>
      </Flex>
    </div>
  );
}
