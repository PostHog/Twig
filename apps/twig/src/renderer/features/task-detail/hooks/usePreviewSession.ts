import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
  getSessionService,
  PREVIEW_TASK_ID,
} from "@features/sessions/service/service";
import {
  useModeConfigOptionForTask,
  useModelConfigOptionForTask,
  useSessionForTask,
  useThoughtLevelConfigOptionForTask,
} from "@features/sessions/stores/sessionStore";
import { useEffect } from "react";

interface PreviewSessionResult {
  modeOption: SessionConfigOption | undefined;
  modelOption: SessionConfigOption | undefined;
  thoughtOption: SessionConfigOption | undefined;
  previewTaskId: string;
  /** True while the preview session is connecting (no config options yet) */
  isConnecting: boolean;
}

/**
 * Manages a lightweight preview session that provides adapter-specific
 * config options (models, modes, reasoning levels) for the task input page.
 *
 * Starts a new preview session when adapter changes,
 * and cleans up on unmount or when inputs change.
 */
export function usePreviewSession(
  adapter: "claude" | "codex",
): PreviewSessionResult {
  useEffect(() => {
    const service = getSessionService();
    service.startPreviewSession({ adapter });

    return () => {
      service.cancelPreviewSession();
    };
  }, [adapter]);

  const session = useSessionForTask(PREVIEW_TASK_ID);
  const modeOption = useModeConfigOptionForTask(PREVIEW_TASK_ID);
  const modelOption = useModelConfigOptionForTask(PREVIEW_TASK_ID);
  const thoughtOption = useThoughtLevelConfigOptionForTask(PREVIEW_TASK_ID);

  // Connecting if we have a session but it's not connected yet,
  // or if we don't have a session at all (start hasn't created one yet)
  const isConnecting = !session || session.status === "connecting";

  return {
    modeOption,
    modelOption,
    thoughtOption,
    previewTaskId: PREVIEW_TASK_ID,
    isConnecting,
  };
}
