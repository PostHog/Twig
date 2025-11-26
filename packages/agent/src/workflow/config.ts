import { buildStep } from "./steps/build.js";
import { finalizeStep } from "./steps/finalize.js";
import { planStep } from "./steps/plan.js";
import { researchStep } from "./steps/research.js";
import type { WorkflowDefinition } from "./types.js";

const MODELS = {
  SONNET: "claude-sonnet-4-5",
  HAIKU: "claude-haiku-4-5",
};

export const TASK_WORKFLOW: WorkflowDefinition = [
  {
    id: "research",
    name: "Research",
    agent: "research",
    model: MODELS.HAIKU,
    permissionMode: "plan",
    commit: true,
    push: true,
    run: researchStep,
  },
  {
    id: "plan",
    name: "Plan",
    agent: "planning",
    model: MODELS.SONNET,
    permissionMode: "plan",
    commit: true,
    push: true,
    run: planStep,
  },
  {
    id: "build",
    name: "Build",
    agent: "execution",
    model: MODELS.SONNET,
    permissionMode: "acceptEdits",
    commit: true,
    push: true,
    run: buildStep,
  },
  {
    id: "finalize",
    name: "Finalize",
    agent: "system", // not used
    model: MODELS.HAIKU, // not used
    permissionMode: "plan", // not used
    commit: true,
    push: true,
    run: finalizeStep,
  },
];
