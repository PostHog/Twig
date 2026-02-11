export interface SetupPromptInput {
  repository: string;
  missingCapabilities: string[];
}

export function buildSetupTaskPrompt({
  repository,
  missingCapabilities,
}: SetupPromptInput): string {
  const missingText =
    missingCapabilities.length > 0
      ? missingCapabilities.map((item) => `- ${item}`).join("\n")
      : "- Verify full Autonomy readiness";

  return `Set up PostHog Autonomy readiness for repository: ${repository}

Goals:
${missingText}

Instructions:
1. Confirm this repository is correctly instrumented with PostHog.
2. Verify event ingestion is working and that real events are reaching PostHog.
3. Enable/verify Session Replay if required by the missing capabilities.
4. Enable/verify Error Tracking if required by the missing capabilities.
5. Validate in PostHog that data has started arriving for this repository.
6. Return a concise checklist of what changed and what is still pending.

Important:
- Use environment variables and existing project conventions.
- Do not hardcode secrets.
- Prefer minimal, safe changes with clear verification steps.`;
}
