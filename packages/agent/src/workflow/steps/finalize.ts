import type { LocalArtifact } from "../../file-manager.js";
import type { Task, TaskRunArtifact } from "../../types.js";
import type { WorkflowStepRunner } from "../types.js";
import { finalizeStepGitActions } from "../utils.js";

const MAX_SNIPPET_LENGTH = 1200;

export const finalizeStep: WorkflowStepRunner = async ({ step, context }) => {
  const { task, logger, fileManager, gitManager, posthogAPI, runId } = context;

  const stepLogger = logger.child("FinalizeStep");
  const artifacts = await fileManager.collectTaskArtifacts(task.id);
  let uploadedArtifacts: TaskRunArtifact[] | undefined;

  if (artifacts.length && posthogAPI && runId) {
    try {
      const payload = artifacts.map((artifact) => ({
        name: artifact.name,
        type: artifact.type,
        content: artifact.content,
        content_type: artifact.contentType,
      }));
      uploadedArtifacts = await posthogAPI.uploadTaskArtifacts(
        task.id,
        runId,
        payload,
      );
      stepLogger.info("Uploaded task artifacts to PostHog", {
        taskId: task.id,
        uploadedCount: uploadedArtifacts.length,
      });
    } catch (error) {
      stepLogger.warn("Failed to upload task artifacts", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    stepLogger.debug("Skipping artifact upload", {
      hasArtifacts: artifacts.length > 0,
      hasPostHogApi: Boolean(posthogAPI),
      runId,
    });
  }

  const prBody = buildPullRequestBody(task, artifacts, uploadedArtifacts);
  await fileManager.cleanupTaskDirectory(task.id);
  await gitManager.addAllPostHogFiles();

  // Commit the deletion of artifacts
  await finalizeStepGitActions(context, step, {
    commitMessage: `Cleanup task artifacts for ${task.title}`,
    allowEmptyCommit: true,
  });

  context.stepResults[step.id] = {
    prBody,
    uploadedArtifacts,
    artifactCount: artifacts.length,
  };

  return { status: "completed" };
};

function buildPullRequestBody(
  task: Task,
  artifacts: LocalArtifact[],
  uploaded?: TaskRunArtifact[],
): string {
  const lines: string[] = [];
  const taskSlug = (task as unknown as Record<string, unknown>).slug || task.id;

  lines.push("## Task context");
  lines.push(`- **Task**: ${taskSlug}`);
  lines.push(`- **Title**: ${task.title}`);
  lines.push(`- **Origin**: ${task.origin_product}`);

  if (task.description) {
    lines.push("");
    lines.push(`> ${task.description.trim().split("\n").join("\n> ")}`);
  }

  const usedFiles = new Set<string>();

  const contextArtifact = artifacts.find(
    (artifact) => artifact.name === "context.md",
  );
  if (contextArtifact) {
    lines.push("");
    lines.push("### Task prompt");
    lines.push(contextArtifact.content);
    usedFiles.add(contextArtifact.name);
  }

  const researchArtifact = artifacts.find(
    (artifact) => artifact.name === "research.json",
  );
  if (researchArtifact) {
    usedFiles.add(researchArtifact.name);
    const researchSection = formatResearchSection(researchArtifact.content);
    if (researchSection) {
      lines.push("");
      lines.push(researchSection);
    }
  }

  const planArtifact = artifacts.find(
    (artifact) => artifact.name === "plan.md",
  );
  if (planArtifact) {
    lines.push("");
    lines.push("### Implementation plan");
    lines.push(planArtifact.content);
    usedFiles.add(planArtifact.name);
  }

  const todoArtifact = artifacts.find(
    (artifact) => artifact.name === "todos.json",
  );
  if (todoArtifact) {
    const summary = summarizeTodos(todoArtifact.content);
    if (summary) {
      lines.push("");
      lines.push("### Todo list");
      lines.push(summary);
    }
    usedFiles.add(todoArtifact.name);
  }

  const remainingArtifacts = artifacts.filter(
    (artifact) => !usedFiles.has(artifact.name),
  );
  if (remainingArtifacts.length) {
    lines.push("");
    lines.push("### Additional artifacts");
    for (const artifact of remainingArtifacts) {
      lines.push(`#### ${artifact.name}`);
      lines.push(renderCodeFence(artifact.content));
    }
  }

  const artifactList =
    uploaded ??
    artifacts.map((artifact) => ({
      name: artifact.name,
      type: artifact.type,
    }));

  if (artifactList.length) {
    lines.push("");
    lines.push("### Uploaded artifacts");
    for (const artifact of artifactList) {
      const rawStoragePath =
        "storage_path" in artifact
          ? (artifact as Record<string, unknown>).storage_path
          : undefined;
      const storagePath =
        typeof rawStoragePath === "string" ? rawStoragePath : undefined;
      const storage =
        storagePath && storagePath.trim().length > 0
          ? ` – \`${storagePath.trim()}\``
          : "";
      lines.push(`- ${artifact.name} (${artifact.type})${storage}`);
    }
  }

  return lines.join("\n\n");
}

function renderCodeFence(content: string): string {
  const snippet = truncate(content, MAX_SNIPPET_LENGTH);
  return ["```", snippet, "```"].join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n…`;
}

function formatResearchSection(content: string): string | null {
  try {
    const parsed = JSON.parse(content);
    const sections: string[] = [];

    if (parsed.context) {
      sections.push("### Research summary");
      sections.push(parsed.context);
    }

    if (parsed.questions?.length) {
      sections.push("");
      sections.push("### Questions needing answers");
      for (const question of parsed.questions) {
        sections.push(`- ${question.question ?? question}`);
      }
    }

    if (parsed.answers?.length) {
      sections.push("");
      sections.push("### Answers provided");
      for (const answer of parsed.answers) {
        const questionId = answer.questionId
          ? ` (Q: ${answer.questionId})`
          : "";
        sections.push(
          `- ${answer.selectedOption || answer.customInput || "answer"}${questionId}`,
        );
      }
    }

    return sections.length ? sections.join("\n") : null;
  } catch {
    return null;
  }
}

function summarizeTodos(content: string): string | null {
  try {
    const data = JSON.parse(content);
    const total = data?.metadata?.total ?? data?.items?.length;
    const completed =
      data?.metadata?.completed ??
      data?.items?.filter(
        (item: { status?: string }) => item.status === "completed",
      ).length;

    const lines = [`Progress: ${completed}/${total} completed`];

    if (data?.items?.length) {
      for (const item of data.items) {
        lines.push(`- [${item.status}] ${item.content}`);
      }
    }

    return lines.join("\n");
  } catch {
    return null;
  }
}
