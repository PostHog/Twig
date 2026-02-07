import { getSessionForTask } from "@features/sessions/stores/sessionStore";
import { track } from "@renderer/lib/analytics";
import { ANALYTICS_EVENTS } from "@/types/analytics";
import { useDraftStore } from "../stores/draftStore";

const CLIENT_COMMAND_NAMES = ["good", "bad"] as const;
type ClientCommandName = (typeof CLIENT_COMMAND_NAMES)[number];

export function isClientCommand(name: string): name is ClientCommandName {
  return CLIENT_COMMAND_NAMES.includes(name as ClientCommandName);
}

export function executeClientCommand(
  commandName: string,
  sessionId: string,
): void {
  if (commandName === "good" || commandName === "bad") {
    trackSessionFeedback(sessionId, commandName);
  }
}

function trackSessionFeedback(
  sessionId: string,
  feedbackType: "good" | "bad",
): void {
  const taskId = useDraftStore.getState().contexts[sessionId]?.taskId;
  const session = getSessionForTask(taskId);

  if (!session) return;

  track(ANALYTICS_EVENTS.SESSION_FEEDBACK, {
    task_id: session.taskId,
    session_id: session.taskRunId,
    execution_type: session.isCloud ? "cloud" : "local",
    model: session.model,
    feedback_type: feedbackType,
  });
}
