import type { Plan } from "@features/sessions/types";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlanStatusBar } from "./PlanStatusBar";

const meta: Meta<typeof PlanStatusBar> = {
  title: "Sessions/PlanStatusBar",
  component: PlanStatusBar,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof PlanStatusBar>;

const createPlan = (
  entries: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed" | "failed";
  }>,
): Plan =>
  ({
    sessionUpdate: "plan",
    entries: entries.map((e) => ({
      content: e.content,
      activeForm: e.content,
      status: e.status,
    })),
  }) as unknown as Plan;

export const InProgress: Story = {
  args: {
    plan: createPlan([
      { content: "Create database schema", status: "completed" },
      { content: "Implement authentication endpoints", status: "completed" },
      { content: "Add middleware for protected routes", status: "in_progress" },
      { content: "Write unit tests", status: "pending" },
      { content: "Write integration tests", status: "pending" },
    ]),
  },
};

export const JustStarted: Story = {
  args: {
    plan: createPlan([
      { content: "Analyze codebase structure", status: "in_progress" },
      { content: "Identify files to modify", status: "pending" },
      { content: "Implement changes", status: "pending" },
      { content: "Run tests", status: "pending" },
    ]),
  },
};

export const NearlyComplete: Story = {
  args: {
    plan: createPlan([
      { content: "Create database schema", status: "completed" },
      { content: "Implement authentication endpoints", status: "completed" },
      { content: "Add middleware for protected routes", status: "completed" },
      { content: "Write unit tests", status: "completed" },
      { content: "Write integration tests", status: "in_progress" },
    ]),
  },
};

export const WithFailure: Story = {
  args: {
    plan: createPlan([
      { content: "Create database schema", status: "completed" },
      { content: "Implement authentication endpoints", status: "failed" },
      { content: "Add middleware for protected routes", status: "pending" },
      { content: "Write unit tests", status: "pending" },
    ]),
  },
};

export const AllComplete: Story = {
  args: {
    plan: createPlan([
      { content: "Create database schema", status: "completed" },
      { content: "Implement authentication endpoints", status: "completed" },
      { content: "Add middleware for protected routes", status: "completed" },
    ]),
  },
  parameters: {
    docs: {
      description: {
        story: "When all tasks are complete, the status bar is hidden.",
      },
    },
  },
};

export const NoPlan: Story = {
  args: {
    plan: null,
  },
  parameters: {
    docs: {
      description: {
        story: "When there is no plan, the status bar is hidden.",
      },
    },
  },
};
