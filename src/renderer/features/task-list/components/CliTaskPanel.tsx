import { AsciiArt } from "@components/AsciiArt";
import { useAuthStore } from "@features/auth/stores/authStore";
import { FilePathHighlight } from "@features/editor/extensions/filePathHighlight";
import { useFileAutocomplete } from "@features/editor/hooks/useFileAutocomplete";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { CliModeHeader } from "@features/task-list/components/CliModeHeader";
import { CliStatusIndicator } from "@features/task-list/components/CliStatusIndicator";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { RepositoryConfig } from "@shared/types";
import { useLayoutStore } from "@stores/layoutStore";
import { useNavigationStore } from "@stores/navigationStore";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";

function EmptyStateMessage({ message }: { message: string }) {
  return (
    <Flex
      align="center"
      justify="center"
      style={{ height: "100%", width: "100%", padding: "var(--space-4)" }}
    >
      <Text size="2" color="gray">
        {message}
      </Text>
    </Flex>
  );
}

export function CliTaskPanel() {
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
  const { navigateToTask } = useNavigationStore();
  const { client, isAuthenticated, defaultWorkspace } = useAuthStore();
  const {
    setRepoPath: saveRepoPath,
    setRunMode,
    runTask,
  } = useTaskExecutionStore();
  const { autoRunTasks, defaultRunMode, lastUsedRunMode } = useSettingsStore();
  const cliMode = useLayoutStore((state) => state.cliMode);
  const setCliMode = useLayoutStore((state) => state.setCliMode);

  // Local directory state
  const [selectedDirectory, setSelectedDirectory] = useState<string>("");
  const [directoryExists, setDirectoryExists] = useState<boolean | null>(null);
  const [detectedRepo, setDetectedRepo] = useState<RepositoryConfig | null>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [isShellFocused, setIsShellFocused] = useState(false);
  const caretRef = useRef<HTMLDivElement>(null);
  const hintsRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "What do you want to work on?",
      }),
      FilePathHighlight.configure({
        className: "cli-file-path",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "cli-editor",
        spellcheck: "false",
      },
      handleKeyDown: (_view, event) => {
        // Handle Shift+Tab for mode switching (needs to be before other handlers)
        // Only respond to actual keydown, not repeat or release events
        if (
          event.type === "keydown" &&
          !event.repeat &&
          event.key === "Tab" &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          setCliMode((current) => (current === "task" ? "shell" : "task"));
          return true;
        }

        // Handle file autocomplete
        if (handleFileAutocompleteKeyDown(event)) {
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          _view.dom.blur();
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          handleSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      updateCaretPosition();
    },
    onSelectionUpdate: () => {
      updateCaretPosition();
    },
    onFocus: () => {
      setIsFocused(true);
      updateCaretPosition();
    },
    onBlur: () => {
      setIsFocused(false);
    },
  });

  // File autocomplete for @ mentions
  const {
    fileHints,
    selectedHintIndex,
    showHints,
    visibleStartIndex,
    handleKeyDown: handleFileAutocompleteKeyDown,
  } = useFileAutocomplete({
    folderPath: selectedDirectory || null,
    editor,
    enabled: cliMode === "task",
  });

  // Handle directory change - validate and detect git repo
  const handleDirectoryChange = useCallback(async (newPath: string) => {
    setSelectedDirectory(newPath);

    // Check if directory exists
    const canAccess = await window.electronAPI?.checkWriteAccess(newPath);
    setDirectoryExists(canAccess || false);

    // Try to detect git repo and extract org/repo
    if (canAccess) {
      try {
        const isRepo = await window.electronAPI?.validateRepo(newPath);
        if (isRepo) {
          const remoteUrl = await window.electronAPI?.getGitRemoteUrl(newPath);
          if (remoteUrl) {
            const parsed = await window.electronAPI?.parseGitHubUrl(remoteUrl);
            if (parsed) {
              setDetectedRepo({
                organization: parsed.organization,
                repository: parsed.repository,
              });
              return;
            }
          }
        }
      } catch (error) {
        console.error("Error detecting git repo:", error);
      }
    }

    // If we get here, it's not a git repo or couldn't detect
    setDetectedRepo(null);
  }, []);

  const updateCaretPosition = useCallback(() => {
    if (!editor || !caretRef.current) return;

    const { view } = editor;
    const { from } = view.state.selection;

    try {
      const coords = view.coordsAtPos(from);
      const editorEl = view.dom.parentElement;
      if (!editorEl) return;

      const editorRect = editorEl.getBoundingClientRect();

      if (coords) {
        caretRef.current.style.left = `${coords.left - editorRect.left}px`;
        caretRef.current.style.top = `${coords.top - editorRect.top}px`;
      }
    } catch (error) {
      console.error("Error updating caret position:", error);
    }
  }, [editor]);

  // Track shell focus
  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    const handleFocusIn = () => setIsShellFocused(true);
    const handleFocusOut = () => setIsShellFocused(false);

    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("focusout", handleFocusOut);

    return () => {
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // Update caret position on mount and when editor changes
  useEffect(() => {
    if (editor) {
      updateCaretPosition();
    }
  }, [editor, updateCaretPosition]);

  // Auto-focus editor when switching to task mode
  useEffect(() => {
    if (cliMode === "task" && editor) {
      requestAnimationFrame(() => {
        editor.commands.focus();
      });
    }
  }, [cliMode, editor]);

  // Update editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isCreatingTask === false);
    }
  }, [editor, isCreatingTask]);

  const handleSubmit = useCallback(() => {
    if (
      !editor ||
      !isAuthenticated ||
      !client ||
      !selectedDirectory ||
      isCreatingTask
    ) {
      return;
    }

    const content = editor.getText().trim();
    if (!content) {
      return;
    }

    // Use detected repo config if available (git repo), otherwise undefined
    const repositoryConfig = detectedRepo || undefined;

    createTask(
      {
        description: content,
        repositoryConfig,
        autoRun: autoRunTasks,
        createdFrom: "cli",
      },
      {
        onSuccess: (newTask) => {
          // Save the selected directory as the repo path
          if (selectedDirectory) {
            saveRepoPath(newTask.id, selectedDirectory);
          }

          navigateToTask(newTask);
          editor.commands.clearContent();

          if (autoRunTasks) {
            let runMode: "local" | "cloud" = "local";

            if (defaultRunMode === "cloud") {
              runMode = "cloud";
            } else if (defaultRunMode === "last_used") {
              runMode = lastUsedRunMode;
            }

            setRunMode(newTask.id, runMode);
            runTask(newTask.id, newTask);
          }
        },
        onError: (error) => {
          console.error("Failed to create task:", error);
        },
      },
    );
  }, [
    editor,
    isAuthenticated,
    client,
    selectedDirectory,
    detectedRepo,
    createTask,
    saveRepoPath,
    navigateToTask,
    autoRunTasks,
    defaultRunMode,
    lastUsedRunMode,
    setRunMode,
    runTask,
    isCreatingTask,
  ]);

  return (
    <Box
      height="100%"
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      {/* Background ASCII Art */}
      <Box
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <AsciiArt scale={0.6} opacity={0.3} />
      </Box>

      <Flex
        direction="column"
        height="100%"
        p="4"
        pl="0"
        gap="4"
        style={{
          fontFamily: "monospace",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Folder Picker */}
        <Box style={{ minWidth: 0 }}>
          <FolderPicker
            value={selectedDirectory}
            onChange={handleDirectoryChange}
            placeholder="Select working directory..."
            size="1"
          />
        </Box>

        {/* CLI Terminal */}
        <Flex
          ref={terminalContainerRef}
          direction="column"
          flexGrow="1"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            borderRadius: "var(--radius-2)",
            border: "1px solid var(--gray-a6)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Mode Header */}
          <CliModeHeader cliMode={cliMode} />

          {/* Terminal Content */}
          <Flex
            direction="column"
            flexGrow="1"
            p={cliMode === "task" ? "3" : "0"}
            style={{
              cursor: cliMode === "task" ? "text" : "default",
              position: "relative",
              overflowX: "hidden",
              overflowY: cliMode === "task" ? "visible" : "hidden",
              minHeight: 0,
            }}
            onClick={() => cliMode === "task" && editor?.commands.focus()}
          >
            {/* Task Mode - TipTap Editor */}
            <Flex
              align="start"
              gap="2"
              style={{
                display: cliMode === "task" ? "flex" : "none",
                height: "100%",
                overflowX: "hidden",
                overflowY: "visible",
                minWidth: 0,
              }}
            >
              {!selectedDirectory ? (
                <EmptyStateMessage message="Select a working directory to start" />
              ) : isCreatingTask ? (
                <EmptyStateMessage message="Creating task..." />
              ) : (
                <>
                  <Text
                    size="2"
                    weight="bold"
                    style={{
                      color: "var(--accent-11)",
                      fontFamily: "monospace",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      bottom: "1px",
                      position: "relative",
                    }}
                  >
                    &gt;
                  </Text>
                  <Box
                    style={{
                      flex: 1,
                      position: "relative",
                      opacity:
                        !isFocused && editor && !editor.isEmpty ? 0.5 : 1,
                      transition: "opacity 0.2s",
                      minWidth: 0,
                    }}
                  >
                    <EditorContent editor={editor} />
                    {editor && (isFocused || !editor.isEmpty) && (
                      <div
                        ref={caretRef}
                        className={isFocused ? "cli-cursor-blink" : ""}
                        style={{
                          top: 0,
                          position: "absolute",
                          width: "8px",
                          height: "16px",
                          backgroundColor: isFocused
                            ? "var(--accent-11)"
                            : "transparent",
                          border: !isFocused
                            ? "1px solid var(--accent-11)"
                            : "none",
                          pointerEvents: "none",
                          transition: "none",
                          mixBlendMode: isFocused ? "color" : "normal",
                        }}
                      />
                    )}
                    {showHints && fileHints.length > 0 && (
                      <Box
                        ref={hintsRef}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 8px)",
                          left: 0,
                          width: "100%",
                          fontFamily: "monospace",
                          fontSize: "var(--font-size-1)",
                          color: "var(--gray-11)",
                          pointerEvents: "none",
                          whiteSpace: "pre",
                        }}
                      >
                        <Box
                          style={{
                            borderTop: "1px solid var(--gray-a6)",
                            paddingTop: "4px",
                          }}
                        >
                          {fileHints
                            .slice(visibleStartIndex, visibleStartIndex + 10)
                            .map((hint, relativeIndex) => {
                              const absoluteIndex =
                                visibleStartIndex + relativeIndex;
                              return (
                                <Box
                                  key={hint}
                                  style={{
                                    backgroundColor:
                                      absoluteIndex === selectedHintIndex
                                        ? "var(--accent-a3)"
                                        : "transparent",
                                    color:
                                      absoluteIndex === selectedHintIndex
                                        ? "var(--accent-11)"
                                        : "var(--gray-11)",
                                    padding: "2px 4px",
                                  }}
                                >
                                  {hint}
                                </Box>
                              );
                            })}
                        </Box>
                      </Box>
                    )}
                    <style>
                      {`
                  .cli-editor {
                    font-family: monospace;
                    background-color: transparent;
                    border: none;
                    outline: none;
                    color: var(--gray-12);
                    font-size: var(--font-size-1);
                    width: 100%;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                    word-break: break-word;
                  }

                  .cli-editor.ProseMirror {
                    caret-color: transparent;
                    overflow-x: hidden;
                  }

                  .cli-editor.ProseMirror p {
                    margin: 0;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                    word-break: break-word;
                  }

                  .cli-editor.ProseMirror.ProseMirror-focused p.is-editor-empty:first-child::before {
                    content: '';
                  }

                  .cli-editor.ProseMirror:not(.ProseMirror-focused) p.is-editor-empty:first-child::before {
                    color: var(--gray-11);
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                  }

                  .cli-editor .cli-file-path {
                    background-color: var(--accent-a3);
                    color: var(--accent-11);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-weight: 500;
                  }
                `}
                    </style>
                  </Box>
                </>
              )}
            </Flex>

            {/* Shell Mode - xterm.js Terminal */}
            <Box
              style={{
                display: cliMode === "shell" ? "flex" : "none",
                flexDirection: "column",
                flex: 1,
                width: "100%",
                overflow: "hidden",
                opacity: !isShellFocused ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {selectedDirectory && directoryExists ? (
                <ShellTerminal cwd={selectedDirectory} />
              ) : (
                <EmptyStateMessage
                  message={
                    selectedDirectory
                      ? "Checking directory..."
                      : "Select a working directory to start"
                  }
                />
              )}
            </Box>

            {/* Key hint or loading indicator (task mode only) */}
            <CliStatusIndicator
              cliMode={cliMode}
              isCreatingTask={isCreatingTask}
            />
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
}
