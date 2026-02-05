import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionSelector } from "./ActionSelector";

const meta: Meta<typeof ActionSelector> = {
  title: "Components/ActionSelector",
  component: ActionSelector,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    onSelect: { action: "selected" },
    onMultiSelect: { action: "multiSelected" },
    onCancel: { action: "cancelled" },
    onStepAnswer: { action: "stepAnswered" },
    onStepChange: { action: "stepChanged" },
  },
};

export default meta;
type Story = StoryObj<typeof ActionSelector>;

export const SingleSelect: Story = {
  args: {
    title: "Single Select",
    question: "Choose one option:",
    options: [
      { id: "a", label: "Option A", description: "First option" },
      { id: "b", label: "Option B", description: "Second option" },
      { id: "c", label: "Option C", description: "Third option" },
    ],
  },
};

export const WithCustomInput: Story = {
  args: {
    title: "With Custom Input",
    question: "Choose an option or provide your own:",
    options: [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
    ],
    allowCustomInput: true,
    customInputPlaceholder: "Type your answer...",
  },
};

export const MultiSelect: Story = {
  args: {
    title: "Multi Select",
    question: "Select all that apply:",
    options: [
      { id: "react", label: "React", description: "UI library" },
      { id: "vue", label: "Vue", description: "Progressive framework" },
      { id: "svelte", label: "Svelte", description: "Compiler-based" },
      { id: "angular", label: "Angular", description: "Full framework" },
    ],
    multiSelect: true,
  },
};

export const MultiSelectWithOther: Story = {
  args: {
    title: "Multi Select with Other",
    question: "Which features do you want?",
    options: [
      { id: "auth", label: "Authentication" },
      { id: "db", label: "Database" },
      { id: "api", label: "REST API" },
    ],
    multiSelect: true,
    allowCustomInput: true,
    customInputPlaceholder: "Describe additional features...",
  },
};

export const WithSteps: Story = {
  args: {
    title: "Frontend",
    question: "Which frontend framework do you prefer?",
    options: [
      {
        id: "react",
        label: "React",
        description: "Component-based UI library",
      },
      { id: "vue", label: "Vue", description: "Progressive framework" },
      { id: "svelte", label: "Svelte", description: "Compiler-based" },
    ],
    multiSelect: true,
    allowCustomInput: true,
    customInputPlaceholder: "Type something",
    currentStep: 0,
    steps: [
      { label: "Frontend" },
      { label: "Backend" },
      { label: "Databases" },
      { label: "Submit" },
    ],
  },
};
