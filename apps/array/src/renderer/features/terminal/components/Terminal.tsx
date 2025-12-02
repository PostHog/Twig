import { Box } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import { logger } from "@/renderer/lib/logger";

const log = logger.scope("terminal");

export interface TerminalProps {
  sessionId: string;
  cwd?: string;
  createSession?: boolean;
  persistState?: boolean;
  onReady?: () => void;
  onExit?: (exitCode?: number) => void;
  onStateChange?: (serializedState: string) => void;
  initialState?: string;
}

function getTerminalTheme(isDarkMode: boolean) {
  return isDarkMode
    ? {
        background: "transparent",
        foreground: "#eeeeea",
        cursor: "#dc9300",
        cursorAccent: "#eeeeea",
        selectionBackground: "rgba(255, 203, 129, 0.3)",
        selectionForeground: "#eeeeea",
      }
    : {
        background: "transparent",
        foreground: "#1f1f1f",
        cursor: "#dc9300",
        cursorAccent: "#1f1f1f",
        selectionBackground: "rgba(255, 189, 87, 0.4)",
        selectionForeground: "#1f1f1f",
      };
}

function loadAddons(term: XTerm) {
  const fit = new FitAddon();
  const serialize = new SerializeAddon();

  const activateLink = (event: MouseEvent, uri: string) => {
    const isMac = /Mac/.test(navigator.platform);
    const hasModifier = isMac ? event.metaKey : event.ctrlKey;

    if (hasModifier) {
      window.electronAPI?.openExternal(uri).catch((error: Error) => {
        log.error("Failed to open link:", uri, error);
      });
    }
  };

  const webLinks = new WebLinksAddon(activateLink);

  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.loadAddon(webLinks);
  return { fit, serialize };
}

function attachKeyHandlers(term: XTerm) {
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    const isMac = /Mac/.test(navigator.platform);
    const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

    // Cmd+K to clear
    if (event.key === "k" && cmdOrCtrl && event.type === "keydown") {
      event.preventDefault();
      term.clear();
      return false;
    }

    // Let Cmd+W bubble up for tab closing
    if (event.key === "w" && cmdOrCtrl) {
      return false;
    }

    // Let Cmd+1-9 bubble up for tab switching
    if (cmdOrCtrl && event.key >= "1" && event.key <= "9") {
      return false;
    }

    return true;
  });
}

export function Terminal({
  sessionId,
  cwd,
  createSession = false,
  persistState = false,
  onReady,
  onExit,
  onStateChange,
  initialState,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const serializeAddon = useRef<SerializeAddon | null>(null);
  const isReadyRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  useEffect(() => {
    if (!terminalRef.current || terminal.current) {
      return;
    }

    let isMounted = true;
    log.debug(
      "[TERMINAL DEBUG] Creating new XTerm instance for sessionId:",
      sessionId,
    );

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "monospace",
      theme: getTerminalTheme(isDarkMode),
      cursorStyle: "block",
      cursorWidth: 8,
      allowProposedApi: true,
    });

    const { fit, serialize } = loadAddons(term);
    attachKeyHandlers(term);

    term.open(terminalRef.current);

    terminal.current = term;
    fitAddon.current = fit;
    serializeAddon.current = serialize;

    // Restore initial state if provided
    if (initialState) {
      term.write(initialState);
    }

    const saveState = () => {
      if (!persistState || !onStateChange) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        const serialized = serialize.serialize();
        onStateChange(serialized);
      }, 500);
    };

    const initializeSession = async () => {
      try {
        if (createSession) {
          // Check if session already exists
          const sessionExists = await window.electronAPI?.shellCheck(sessionId);
          if (!sessionExists) {
            await window.electronAPI?.shellCreate(sessionId, cwd);
          }
        }

        if (!isMounted) return;
        isReadyRef.current = true;

        // Fit after session is ready
        setTimeout(() => {
          if (isMounted && fitAddon.current) {
            fitAddon.current.fit();
          }
        }, 0);

        onReady?.();
      } catch (error) {
        log.error("Failed to initialize session:", error);
        term.writeln(
          `\r\n\x1b[31mFailed to create shell: ${(error as Error).message}\x1b[0m\r\n`,
        );
      }
    };

    // Set up listeners
    const unsubscribeData = window.electronAPI?.onShellData(
      sessionId,
      (data: string) => {
        term.write(data);
        saveState();
      },
    );

    const unsubscribeExit = window.electronAPI?.onShellExit(sessionId, () => {
      term.writeln("\r\n\x1b[33mProcess exited\x1b[0m\r\n");
      onExit?.();
    });

    // Send user input to PTY
    const disposable = term.onData((data: string) => {
      window.electronAPI?.shellWrite(sessionId, data).catch((error: Error) => {
        log.error("Failed to write to shell:", error);
      });
      saveState();
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        fitAddon.current.fit();

        if (isReadyRef.current) {
          window.electronAPI
            ?.shellResize(
              sessionId,
              terminal.current.cols,
              terminal.current.rows,
            )
            .catch((error: Error) => {
              log.error("Failed to resize shell:", error);
            });
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Initialize
    initializeSession();

    return () => {
      log.debug("[TERMINAL DEBUG] Cleanup running for sessionId:", sessionId);
      isMounted = false;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Save final state
      if (persistState && onStateChange && serializeAddon.current) {
        const serialized = serializeAddon.current.serialize();
        onStateChange(serialized);
      }

      resizeObserver.disconnect();
      disposable.dispose();
      unsubscribeData?.();
      unsubscribeExit?.();
      term.dispose();
      terminal.current = null;
      fitAddon.current = null;
      serializeAddon.current = null;
      isReadyRef.current = false;
    };
  }, [
    sessionId,
    cwd,
    createSession,
    persistState,
    onReady,
    onExit,
    onStateChange,
    isDarkMode,
    initialState,
  ]);

  // Update theme when it changes
  useEffect(() => {
    if (terminal.current) {
      terminal.current.options.theme = getTerminalTheme(isDarkMode);
    }
  }, [isDarkMode]);

  const handleClick = useCallback(() => {
    terminal.current?.focus();
  }, []);

  return (
    <Box
      style={{
        height: "100%",
        padding: "var(--space-3)",
        position: "relative",
      }}
      onClick={handleClick}
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
