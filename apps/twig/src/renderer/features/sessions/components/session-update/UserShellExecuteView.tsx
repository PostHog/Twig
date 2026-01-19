import { Box } from "@radix-ui/themes";
import type { UserShellExecuteParams } from "@shared/types/session-events";
import { memo } from "react";
import { ExecuteToolView } from "./ExecuteToolView";

export interface UserShellExecute extends UserShellExecuteParams {
  type: "user_shell_execute";
  id: string;
}

interface UserShellExecuteViewProps {
  item: UserShellExecute;
}

export const UserShellExecuteView = memo(function UserShellExecuteView({
  item,
}: UserShellExecuteViewProps) {
  return (
    <Box className="border-accent-9 border-l-2 pl-2">
      <ExecuteToolView
        toolCall={{
          toolCallId: item.id,
          title: item.command,
          kind: "execute",
          status: "completed",
          rawInput: { command: item.command, description: "User command" },
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: item.result.stdout || item.result.stderr || "",
              },
            },
          ],
        }}
      />
    </Box>
  );
});
