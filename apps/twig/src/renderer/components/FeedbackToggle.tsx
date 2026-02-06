import { ChatCircle } from "@phosphor-icons/react";
import { DropdownMenu, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { displaySurvey, getPostHog } from "@renderer/lib/analytics";
import { useCallback } from "react";

type FeedbackType = "bug" | "feedback";

const hasBugSurvey = !!import.meta.env.VITE_POSTHOG_BUG_SURVEY_ID;
const hasFeedbackSurvey = !!import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID;

export function FeedbackToggle() {
  const handleFeedback = useCallback((type: FeedbackType) => {
    const surveyId =
      type === "bug"
        ? import.meta.env.VITE_POSTHOG_BUG_SURVEY_ID
        : import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID;

    if (surveyId) {
      displaySurvey(surveyId);
    }

    getPostHog()?.capture("Feedback button clicked", {
      feedback_type: type,
    });
  }, []);

  if (!hasBugSurvey && !hasFeedbackSurvey) return null;

  return (
    <DropdownMenu.Root>
      <Tooltip content="Send Feedback">
        <DropdownMenu.Trigger>
          <IconButton
            size="1"
            variant="ghost"
            style={{ color: "var(--gray-9)" }}
          >
            <ChatCircle size={12} />
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content size="1" align="end">
        <DropdownMenu.Item onClick={() => handleFeedback("bug")}>
          <Text size="1">Report a Bug</Text>
        </DropdownMenu.Item>
        <DropdownMenu.Item onClick={() => handleFeedback("feedback")}>
          <Text size="1">Share Feedback</Text>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
