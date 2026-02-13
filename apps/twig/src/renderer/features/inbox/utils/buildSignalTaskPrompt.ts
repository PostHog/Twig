import type { SignalReport, SignalReportArtefact } from "@shared/types";

export interface SignalPromptInput {
  report: SignalReport;
  artefacts: SignalReportArtefact[];
  replayBaseUrl: string | null;
}

export function buildSignalTaskPrompt({
  report,
  artefacts,
  replayBaseUrl,
}: SignalPromptInput): string {
  const title = report.title ?? "Untitled signal";
  const summary = report.summary ?? "No summary available.";

  const lines: string[] = [
    `# Investigate: ${title}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    `**Signal strength:** ${report.signal_count} occurrences, ${report.relevant_user_count ?? 0} affected users`,
  ];

  if (artefacts.length > 0) {
    lines.push("", "## Evidence");

    for (const artefact of artefacts) {
      const timestamp = new Date(artefact.content.start_time).toLocaleString();
      lines.push("", `### Session ${timestamp}`, "", artefact.content.content);
      if (replayBaseUrl) {
        lines.push(
          `[View replay](${replayBaseUrl}/${artefact.content.session_id})`,
        );
      }
    }
  }

  return lines.join("\n");
}
