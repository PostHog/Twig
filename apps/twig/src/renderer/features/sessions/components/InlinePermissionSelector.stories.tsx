import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  InlinePermissionSelector,
  type PermissionOption,
} from "./InlinePermissionSelector";

const meta: Meta<typeof InlinePermissionSelector> = {
  title: "Sessions/InlinePermissionSelector",
  component: InlinePermissionSelector,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    onSelect: { action: "selected" },
    onCancel: { action: "cancelled" },
  },
};

export default meta;
type Story = StoryObj<typeof InlinePermissionSelector>;

const defaultOptions: PermissionOption[] = [
  {
    optionId: "allow_always",
    name: "Accept All",
    description: "Allow this action for all similar requests",
    kind: "allow_always",
  },
  {
    optionId: "allow_once",
    name: "Accept",
    description: "Allow this action once",
    kind: "allow_once",
  },
  {
    optionId: "reject_once",
    name: "Reject",
    description: "Reject this action",
    kind: "reject_once",
  },
];

export const Default: Story = {
  args: {
    title: "Allow running: npm install lodash",
    options: defaultOptions,
  },
};

export const BashCommand: Story = {
  args: {
    title: "Allow running: rm -rf node_modules",
    options: defaultOptions,
  },
};

export const FileEdit: Story = {
  args: {
    title: "Allow editing: src/components/Button.tsx",
    options: [
      {
        optionId: "allow_always",
        name: "Accept All",
        description: "Allow edits to this file",
        kind: "allow_always",
      },
      {
        optionId: "allow_once",
        name: "Accept",
        description: "Allow this edit once",
        kind: "allow_once",
      },
      {
        optionId: "reject_once",
        name: "Reject",
        description: "Reject this edit",
        kind: "reject_once",
      },
    ],
  },
};

export const Disabled: Story = {
  args: {
    title: "Allow running: npm install lodash",
    options: defaultOptions,
    disabled: true,
  },
};
