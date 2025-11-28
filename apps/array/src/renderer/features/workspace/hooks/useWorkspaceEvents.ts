import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { toast } from "@utils/toast";
import { useEffect } from "react";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

export function useWorkspaceEvents(taskId: string) {
  const addWorkspaceTerminalTab = usePanelLayoutStore(
    (s) => s.addWorkspaceTerminalTab,
  );
  const registerTerminal = useWorkspaceTerminalStore((s) => s.registerTerminal);

  useEffect(() => {
    const unsubscribeTerminal = window.electronAPI?.workspace.onTerminalCreated(
      (data) => {
        if (data.taskId !== taskId) return;

        registerTerminal(taskId, {
          sessionId: data.sessionId,
          scriptType: data.scriptType,
          command: data.command,
          label: data.label,
          status: data.status,
        });

        addWorkspaceTerminalTab(
          taskId,
          data.sessionId,
          data.command,
          data.scriptType,
        );
      },
    );

    const unsubscribeError = window.electronAPI?.workspace.onError((data) => {
      if (data.taskId !== taskId) return;
      toast.error("Workspace error", { description: data.message });
    });

    const unsubscribeWarning = window.electronAPI?.workspace.onWarning(
      (data) => {
        if (data.taskId !== taskId) return;
        toast.warning(data.title, {
          description: data.message,
          duration: 10000,
        });
      },
    );

    return () => {
      unsubscribeTerminal?.();
      unsubscribeError?.();
      unsubscribeWarning?.();
    };
  }, [taskId, addWorkspaceTerminalTab, registerTerminal]);
}
