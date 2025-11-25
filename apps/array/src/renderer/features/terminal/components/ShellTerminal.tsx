import { Box } from "@radix-ui/themes";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useTerminalStore } from "../stores/terminalStore";

interface ShellTerminalProps {
  cwd?: string;
  stateKey?: string;
}

function secureRandomString(length: number): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, length);
}

function loadAddons(term: Terminal) {
  const fit = new FitAddon();
  const serialize = new SerializeAddon();

  // Configure WebLinksAddon with CMD+Click (Mac) or CTRL+Click handler
  const activateLink = (event: MouseEvent, uri: string) => {
    const isMac = /Mac/.test(navigator.platform);
    const hasModifier = isMac ? event.metaKey : event.ctrlKey;

    if (hasModifier) {
      window.electronAPI?.openExternal(uri).catch((error: Error) => {
        console.error("Failed to open link:", uri, error);
      });
    }
  };

  const webLinks = new WebLinksAddon(activateLink);

  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.loadAddon(webLinks);
  return { fit, serialize };
}

export function ShellTerminal({ cwd, stateKey }: ShellTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const serializeAddon = useRef<SerializeAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const isShellReadyRef = useRef<boolean>(false);
  const hasReceivedDataRef = useRef<boolean>(false);
  const restoredStateLengthRef = useRef<number>(0);

  const terminalStore = useTerminalStore();
  const persistenceKey = stateKey || cwd || "default";

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    if (terminal.current) {
      return;
    }

    let isMounted = true;

    const savedState = terminalStore.getTerminalState(persistenceKey);
    let sessionId = savedState?.sessionId || null;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "monospace",
      theme: {
        background: "transparent",
        foreground: "#ffffff",
        cursor: "#BD6C3A",
        cursorAccent: "#ffffff",
        selectionBackground: "#532601",
        selectionForeground: "#ffffff",
      },
      cursorStyle: "block",
      cursorWidth: 8,
      allowProposedApi: true,
    });

    const { fit, serialize } = loadAddons(term);

    // Open terminal
    term.open(terminalRef.current);

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const isMac = /Mac/.test(navigator.platform);
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      if (event.key === "k" && cmdOrCtrl && event.type === "keydown") {
        event.preventDefault();
        term.clear();
        return false;
      }

      if (event.key === "w" && cmdOrCtrl) {
        return false;
      }

      if (cmdOrCtrl && event.key >= "1" && event.key <= "9") {
        return false;
      }

      return true;
    });

    terminal.current = term;
    fitAddon.current = fit;
    serializeAddon.current = serialize;

    console.log(
      `[ShellTerminal] Restoring state for key: ${persistenceKey}`,
      savedState,
    );
    if (savedState?.serializedState) {
      console.log(
        `[ShellTerminal] Writing ${savedState.serializedState.length} chars to terminal`,
      );
      term.write(savedState.serializedState);
      restoredStateLengthRef.current = savedState.serializedState.length;
    } else {
      restoredStateLengthRef.current = 0;
    }

    const initializeShell = async () => {
      try {
        if (sessionId) {
          const sessionExists = await window.electronAPI?.shellCheck(sessionId);
          if (sessionExists) {
            console.log(
              `[ShellTerminal] Reconnecting to existing session ${sessionId}`,
            );
          } else {
            console.log(
              `[ShellTerminal] Saved session ${sessionId} no longer exists, creating new one`,
            );
            sessionId = null;
          }
        }

        if (!sessionId) {
          sessionId = `shell-${Date.now()}-${secureRandomString(7)}`;
          console.log(`[ShellTerminal] Creating new session ${sessionId}`);
          terminalStore.setSessionId(persistenceKey, sessionId);
        }

        const finalSessionId = sessionId;
        sessionIdRef.current = finalSessionId;

        // Create or reconnect to PTY session
        await window.electronAPI?.shellCreate(finalSessionId, cwd);

        if (!isMounted) return;
        isShellReadyRef.current = true;

        // Now that shell is ready, fit the terminal
        setTimeout(() => {
          if (isMounted) {
            fit.fit();
          }
        }, 0);
      } catch (error) {
        console.error("Failed to initialize shell session:", error);
        term.writeln(
          `\r\n\x1b[31mFailed to create shell: ${(error as Error).message}\x1b[0m\r\n`,
        );
      }
    };

    const saveTerminalState = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const serialized = serialize.serialize();
        console.log(
          `[ShellTerminal] Saving state for key: ${persistenceKey}, ${serialized.length} chars`,
        );
        terminalStore.setSerializedState(persistenceKey, serialized);
      }, 500); // 500ms debounce
    };

    // Listen for data from PTY
    // Use a temporary ID first, will be replaced after initializeShell completes
    let unsubscribeData: (() => void) | undefined;
    let unsubscribeExit: (() => void) | undefined;

    // Wait for initializeShell to complete before setting up listeners
    initializeShell().then(() => {
      if (!isMounted || !sessionIdRef.current) return;

      const currentSessionId = sessionIdRef.current;

      unsubscribeData = window.electronAPI?.onShellData(
        currentSessionId,
        (data: string) => {
          term.write(data);
          hasReceivedDataRef.current = true;
          saveTerminalState();
        },
      );

      unsubscribeExit = window.electronAPI?.onShellExit(
        currentSessionId,
        () => {
          term.writeln("\r\n\x1b[33mShell process exited\x1b[0m\r\n");
        },
      );
    });

    // Send user input to PTY
    const disposable = term.onData((data: string) => {
      if (!sessionIdRef.current) return;
      window.electronAPI
        ?.shellWrite(sessionIdRef.current, data)
        .catch((error: Error) => {
          console.error("Failed to write to shell:", error);
        });
      saveTerminalState();
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        fitAddon.current.fit();

        if (isShellReadyRef.current && sessionIdRef.current) {
          window.electronAPI
            ?.shellResize(
              sessionIdRef.current,
              terminal.current.cols,
              terminal.current.rows,
            )
            .catch((error: Error) => {
              console.error("Failed to resize shell:", error);
            });
        }
      }
    };

    // Listen for window resize
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Cleanup
    return () => {
      isMounted = false;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const serialized = serialize.serialize();
      const shouldSave =
        hasReceivedDataRef.current ||
        (serialized.length > 0 &&
          serialized.length >= restoredStateLengthRef.current);

      if (shouldSave) {
        console.log(
          `[ShellTerminal] Cleanup: Saving final state for key: ${persistenceKey}, ${serialized.length} chars (hasReceivedData: ${hasReceivedDataRef.current}, restored: ${restoredStateLengthRef.current})`,
        );
        terminalStore.setSerializedState(persistenceKey, serialized);
      } else {
        console.log(
          `[ShellTerminal] Cleanup: Not saving for key: ${persistenceKey}, ${serialized.length} chars (would lose data - hasReceivedData: ${hasReceivedDataRef.current}, restored: ${restoredStateLengthRef.current})`,
        );
      }

      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      disposable.dispose();
      unsubscribeData?.();
      unsubscribeExit?.();
      term.dispose();
      terminal.current = null;
      fitAddon.current = null;
      serializeAddon.current = null;
      isShellReadyRef.current = false;
      hasReceivedDataRef.current = false;
      restoredStateLengthRef.current = 0;
    };
  }, [
    cwd,
    persistenceKey,
    terminalStore.getTerminalState,
    terminalStore.setSerializedState,
    terminalStore.setSessionId,
  ]);

  return (
    <Box
      style={{
        height: "100%",
        padding: "var(--space-3)",
        position: "relative",
      }}
    >
      <div
        ref={terminalRef}
        style={{
          height: "100%",
          width: "100%",
        }}
      />
      <style>
        {`
          .xterm {
            background-color: transparent !important;
          }
          .xterm .xterm-viewport {
            background-color: transparent !important;
          }
          .xterm .xterm-viewport::-webkit-scrollbar {
            display: none;
          }
          .xterm .xterm-viewport {
            scrollbar-width: none;
          }
        `}
      </style>
    </Box>
  );
}
