import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@utils/toast";
import { useEffect } from "react";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

export function useWorkspaceEvents(taskId: string) {
  const addWorkspaceTerminalTab = usePanelLayoutStore(
    (s) => s.addWorkspaceTerminalTab,
  );
  const registerTerminal = useWorkspaceTerminalStore((s) => s.registerTerminal);

  useEffect(() => {
    const terminalSubscription =
      trpcVanilla.workspace.onTerminalCreated.subscribe(undefined, {
        onData: (data) => {
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
      });

    // Note: workspace errors are handled globally in App.tsx

    const warningSubscription = trpcVanilla.workspace.onWarning.subscribe(
      undefined,
      {
        onData: (data) => {
          if (data.taskId !== taskId) return;
          toast.warning(data.title, {
            description: data.message,
            duration: 10000,
          });
        },
      },
    );

    return () => {
      terminalSubscription.unsubscribe();
      warningSubscription.unsubscribe();
    };
  }, [taskId, addWorkspaceTerminalTab, registerTerminal]);
}
