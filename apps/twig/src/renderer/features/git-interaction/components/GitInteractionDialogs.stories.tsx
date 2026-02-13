import { Flex } from "@radix-ui/themes";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  GitCommitDialog,
  GitPrDialog,
  GitPushDialog,
} from "./GitInteractionDialogs";

function DialogShowcase() {
  return <Flex direction="column" gap="4" />;
}

const meta: Meta<typeof DialogShowcase> = {
  title: "Git/Dialogs",
  component: DialogShowcase,
  parameters: { layout: "centered" },
};

export default meta;

export const CommitDefault: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      diffStats={{ filesChanged: 3, linesAdded: 42, linesRemoved: 12 }}
      commitMessage=""
      onCommitMessageChange={() => {}}
      nextStep="commit"
      onNextStepChange={() => {}}
      prDisabledReason={null}
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={false}
      error={null}
      onGenerateMessage={() => {}}
      isGeneratingMessage={false}
    />
  ),
};

export const CommitWithMessage: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      diffStats={{ filesChanged: 3, linesAdded: 42, linesRemoved: 12 }}
      commitMessage="Add user authentication flow"
      onCommitMessageChange={() => {}}
      nextStep="commit-push"
      onNextStepChange={() => {}}
      prDisabledReason={null}
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={false}
      error={null}
      onGenerateMessage={() => {}}
      isGeneratingMessage={false}
    />
  ),
};

export const CommitPrDisabled: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="main"
      diffStats={{ filesChanged: 1, linesAdded: 10, linesRemoved: 2 }}
      commitMessage="Fix typo"
      onCommitMessageChange={() => {}}
      nextStep="commit"
      onNextStepChange={() => {}}
      prDisabledReason="Checkout a feature branch to create PRs."
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={false}
      error={null}
      onGenerateMessage={() => {}}
      isGeneratingMessage={false}
    />
  ),
};

export const CommitSubmitting: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      diffStats={{ filesChanged: 3, linesAdded: 42, linesRemoved: 12 }}
      commitMessage="Add feature"
      onCommitMessageChange={() => {}}
      nextStep="commit"
      onNextStepChange={() => {}}
      prDisabledReason={null}
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={true}
      error={null}
      onGenerateMessage={() => {}}
      isGeneratingMessage={false}
    />
  ),
};

export const CommitWithError: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      diffStats={{ filesChanged: 3, linesAdded: 42, linesRemoved: 12 }}
      commitMessage="Add feature"
      onCommitMessageChange={() => {}}
      nextStep="commit"
      onNextStepChange={() => {}}
      prDisabledReason={null}
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={false}
      error="Failed to commit: pre-commit hook failed"
      onGenerateMessage={() => {}}
      isGeneratingMessage={false}
    />
  ),
};

export const CommitGenerating: StoryObj<typeof GitCommitDialog> = {
  render: () => (
    <GitCommitDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      diffStats={{ filesChanged: 3, linesAdded: 42, linesRemoved: 12 }}
      commitMessage=""
      onCommitMessageChange={() => {}}
      nextStep="commit"
      onNextStepChange={() => {}}
      prDisabledReason={null}
      pushDisabledReason={null}
      onContinue={() => {}}
      isSubmitting={false}
      error={null}
      onGenerateMessage={() => {}}
      isGeneratingMessage={true}
    />
  ),
};

export const PushIdle: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="push"
      state="idle"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const PushSubmitting: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="push"
      state="idle"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={true}
    />
  ),
};

export const PushSuccess: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="push"
      state="success"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const PushError: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="push"
      state="error"
      error="Failed to push: remote rejected (permission denied)"
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const SyncIdle: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="sync"
      state="idle"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const SyncSuccess: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="sync"
      state="success"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const PublishIdle: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="publish"
      state="idle"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const PublishSuccess: StoryObj<typeof GitPushDialog> = {
  render: () => (
    <GitPushDialog
      open={true}
      onOpenChange={() => {}}
      branchName="feature/add-auth"
      mode="publish"
      state="success"
      error={null}
      onConfirm={() => {}}
      onClose={() => {}}
      isSubmitting={false}
    />
  ),
};

export const PrCreate: StoryObj<typeof GitPrDialog> = {
  render: () => (
    <GitPrDialog
      open={true}
      onOpenChange={() => {}}
      baseBranch="main"
      headBranch="feature/add-auth"
      title="Add user authentication"
      onTitleChange={() => {}}
      body="Closes #123\n\nAdded login and signup flows."
      onBodyChange={() => {}}
      onConfirm={() => {}}
      isSubmitting={false}
      error={null}
      onGenerate={() => {}}
      isGenerating={false}
    />
  ),
};

export const PrCreateEmpty: StoryObj<typeof GitPrDialog> = {
  render: () => (
    <GitPrDialog
      open={true}
      onOpenChange={() => {}}
      baseBranch="main"
      headBranch="feature/add-auth"
      title=""
      onTitleChange={() => {}}
      body=""
      onBodyChange={() => {}}
      onConfirm={() => {}}
      isSubmitting={false}
      error={null}
      onGenerate={() => {}}
      isGenerating={false}
    />
  ),
};

export const PrGenerating: StoryObj<typeof GitPrDialog> = {
  render: () => (
    <GitPrDialog
      open={true}
      onOpenChange={() => {}}
      baseBranch="main"
      headBranch="feature/add-auth"
      title=""
      onTitleChange={() => {}}
      body=""
      onBodyChange={() => {}}
      onConfirm={() => {}}
      isSubmitting={false}
      error={null}
      onGenerate={() => {}}
      isGenerating={true}
    />
  ),
};

export const PrSubmitting: StoryObj<typeof GitPrDialog> = {
  render: () => (
    <GitPrDialog
      open={true}
      onOpenChange={() => {}}
      baseBranch="main"
      headBranch="feature/add-auth"
      title="Add user authentication"
      onTitleChange={() => {}}
      body="Added login flow"
      onBodyChange={() => {}}
      onConfirm={() => {}}
      isSubmitting={true}
      error={null}
      onGenerate={() => {}}
      isGenerating={false}
    />
  ),
};

export const PrWithError: StoryObj<typeof GitPrDialog> = {
  render: () => (
    <GitPrDialog
      open={true}
      onOpenChange={() => {}}
      baseBranch="main"
      headBranch="feature/add-auth"
      title="Add user authentication"
      onTitleChange={() => {}}
      body="Added login flow"
      onBodyChange={() => {}}
      onConfirm={() => {}}
      isSubmitting={false}
      error="Failed to create PR: no commits between main and feature/add-auth"
      onGenerate={() => {}}
      isGenerating={false}
    />
  ),
};
