import { Box } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { useSettingsStore } from "@stores/settingsStore";
import { useThemeStore } from "@stores/themeStore";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import { terminalManager } from "../services/TerminalManager";

export interface TerminalProps {
  sessionId: string;
  persistenceKey: string;
  cwd?: string;
  initialState?: string;
  taskId?: string;
  onReady?: () => void;
  onExit?: (exitCode?: number) => void;
}

export function Terminal({
  sessionId,
  persistenceKey,
  cwd,
  initialState,
  taskId,
  onReady,
  onExit,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const terminalFontFamily = useSettingsStore(
    (state) => state.terminalFontFamily,
  );
  const terminalFontFamilyLoaded = useSettingsStore(
    (state) => state.terminalFontFamilyLoaded,
  );
  const loadTerminalFontFamily = useSettingsStore(
    (state) => state.loadTerminalFontFamily,
  );

  // Create instance (idempotent)
  useEffect(() => {
    if (!terminalManager.has(sessionId)) {
      terminalManager.create({
        sessionId,
        persistenceKey,
        cwd,
        initialState,
        taskId,
      });
    }
  }, [sessionId, persistenceKey, cwd, initialState, taskId]);

  // Attach/detach from DOM
  useEffect(() => {
    if (!terminalRef.current) return;

    terminalManager.attach(sessionId, terminalRef.current);

    return () => {
      terminalManager.detach(sessionId);
    };
  }, [sessionId]);

  // Theme sync
  useEffect(() => {
    terminalManager.setTheme(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    if (!terminalFontFamilyLoaded) {
      loadTerminalFontFamily();
    }
  }, [terminalFontFamilyLoaded, loadTerminalFontFamily]);

  useEffect(() => {
    terminalManager.setFontFamily(terminalFontFamily);
  }, [terminalFontFamily]);

  // Subscribe to shell data events
  trpcReact.shell.onData.useSubscription(
    { sessionId },
    {
      enabled: !!sessionId,
      onData: (event) => {
        terminalManager.writeData(event.sessionId, event.data);
      },
    },
  );

  // Subscribe to shell exit events
  trpcReact.shell.onExit.useSubscription(
    { sessionId },
    {
      enabled: !!sessionId,
      onData: (event) => {
        terminalManager.handleExit(event.sessionId);
      },
    },
  );

  // Event callbacks
  useEffect(() => {
    const offReady = terminalManager.on("ready", ({ sessionId: id }) => {
      if (id === sessionId) {
        onReady?.();
      }
    });

    const offExit = terminalManager.on(
      "exit",
      ({ sessionId: id, exitCode }) => {
        if (id === sessionId) {
          onExit?.(exitCode);
        }
      },
    );

    return () => {
      offReady();
      offExit();
    };
  }, [sessionId, onReady, onExit]);

  const handleClick = useCallback(() => {
    terminalManager.focus(sessionId);
  }, [sessionId]);

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
