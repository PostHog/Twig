import { Box } from "@radix-ui/themes";
import { DeleteToolView } from "./DeleteToolView";
import { EditToolView } from "./EditToolView";
import { ExecuteToolView } from "./ExecuteToolView";
import { FetchToolView } from "./FetchToolView";
import { MoveToolView } from "./MoveToolView";
import { PlanApprovalView } from "./PlanApprovalView";
import { QuestionToolView } from "./QuestionToolView";
import { ReadToolView } from "./ReadToolView";
import { SearchToolView } from "./SearchToolView";
import { ThinkToolView } from "./ThinkToolView";
import { ToolCallView } from "./ToolCallView";
import type { ToolViewProps } from "./toolCallUtils";

export function ToolCallBlock({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const meta = toolCall._meta as
    | { claudeCode?: { toolName?: string } }
    | undefined;
  const toolName = meta?.claudeCode?.toolName;

  if (toolName === "EnterPlanMode" || toolName === "ExitPlanMode") {
    return null;
  }

  const props = { toolCall, turnCancelled, turnComplete };

  const content = (() => {
    switch (toolCall.kind) {
      case "switch_mode":
        return <PlanApprovalView {...props} />;
      case "execute":
        return <ExecuteToolView {...props} />;
      case "read":
        return <ReadToolView {...props} />;
      case "edit":
        return <EditToolView {...props} />;
      case "delete":
        return <DeleteToolView {...props} />;
      case "move":
        return <MoveToolView {...props} />;
      case "search":
        return <SearchToolView {...props} />;
      case "think":
        return <ThinkToolView {...props} />;
      case "fetch":
        return <FetchToolView {...props} />;
      case "question":
        return <QuestionToolView {...props} />;
      default:
        return <ToolCallView {...props} />;
    }
  })();

  return <Box className="pl-3">{content}</Box>;
}
