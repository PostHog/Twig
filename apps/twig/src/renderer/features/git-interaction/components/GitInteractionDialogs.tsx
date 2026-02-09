import { Tooltip } from "@components/ui/Tooltip";
import {
  CheckCircle,
  CloudArrowUp,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Sparkle,
} from "@phosphor-icons/react";
import { CheckIcon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  Spinner,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import type { ReactNode } from "react";

const ICON_SIZE = 14;

interface GitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  error: string | null;
  buttonLabel: string;
  buttonDisabled?: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  maxWidth?: string;
  hideCancel?: boolean;
}

function GitDialog({
  open,
  onOpenChange,
  icon,
  title,
  children,
  error,
  buttonLabel,
  buttonDisabled,
  isSubmitting,
  onSubmit,
  maxWidth = "400px",
  hideCancel,
}: GitDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth={maxWidth} size="1">
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            {icon}
            <Text size="2" weight="medium">
              {title}
            </Text>
          </Flex>

          {children}

          {error && (
            <Text size="1" color="red">
              {error}
            </Text>
          )}

          <Flex gap="2" justify="end">
            {!hideCancel && (
              <Dialog.Close>
                <Button size="1" variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
            )}
            <Button
              size="1"
              disabled={buttonDisabled || isSubmitting}
              loading={isSubmitting}
              onClick={onSubmit}
            >
              {buttonLabel}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex align="center" justify="between">
      <Text size="1" color="gray">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

function BranchBadge({ branch }: { branch: string | null }) {
  return (
    <Flex align="center" gap="1">
      <GitBranch size={12} />
      <Text size="1">{branch ?? "Unknown"}</Text>
    </Flex>
  );
}

interface SelectableOptionProps {
  icon: ReactNode;
  label: string;
  selected: boolean;
  disabled: boolean;
  disabledReason: string | null;
  onSelect: () => void;
}

function SelectableOption({
  icon,
  label,
  selected,
  disabled,
  disabledReason,
  onSelect,
}: SelectableOptionProps) {
  const content = (
    <Box
      role="button"
      onClick={() => !disabled && onSelect()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
        border: "1px solid var(--gray-6)",
        background: selected ? "var(--accent-4)" : "var(--gray-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Flex align="center" gap="2">
        {icon}
        <Text size="1" weight="medium">
          {label}
        </Text>
      </Flex>
      {selected && <CheckIcon />}
    </Box>
  );

  if (disabled && disabledReason) {
    return <Tooltip content={disabledReason}>{content}</Tooltip>;
  }
  return content;
}

interface GitCommitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchName: string | null;
  diffStats: { filesChanged: number; linesAdded: number; linesRemoved: number };
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  nextStep: "commit" | "commit-push" | "commit-pr";
  onNextStepChange: (value: "commit" | "commit-push" | "commit-pr") => void;
  createPrDisabledReason: string | null;
  pushDisabledReason: string | null;
  onContinue: () => void;
  isSubmitting: boolean;
  error: string | null;
  onGenerateMessage: () => void;
  isGeneratingMessage: boolean;
}

export function GitCommitDialog({
  open,
  onOpenChange,
  branchName,
  diffStats,
  commitMessage,
  onCommitMessageChange,
  nextStep,
  onNextStepChange,
  createPrDisabledReason,
  pushDisabledReason,
  onContinue,
  isSubmitting,
  error,
  onGenerateMessage,
  isGeneratingMessage,
}: GitCommitDialogProps) {
  const options = [
    {
      id: "commit" as const,
      label: "Commit",
      icon: <GitCommit size={ICON_SIZE} />,
    },
    {
      id: "commit-push" as const,
      label: "Commit and push",
      icon: <CloudArrowUp size={ICON_SIZE} />,
      disabledReason: pushDisabledReason,
    },
    {
      id: "commit-pr" as const,
      label: "Commit and create PR",
      icon: <GitPullRequest size={ICON_SIZE} />,
      disabledReason: createPrDisabledReason,
    },
  ];

  return (
    <GitDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<GitCommit size={ICON_SIZE} />}
      title="Commit"
      error={error}
      buttonLabel="Continue"
      buttonDisabled={isGeneratingMessage}
      isSubmitting={isSubmitting}
      onSubmit={onContinue}
    >
      <Flex direction="column" gap="1">
        <InfoRow label="Branch">
          <BranchBadge branch={branchName} />
        </InfoRow>
        <InfoRow label="Changes">
          <Flex align="center" gap="2">
            <Text size="1" color="gray">
              {diffStats.filesChanged} file
              {diffStats.filesChanged === 1 ? "" : "s"}
            </Text>
            <Text size="1" color="green">
              +{diffStats.linesAdded}
            </Text>
            <Text size="1" color="red">
              -{diffStats.linesRemoved}
            </Text>
          </Flex>
        </InfoRow>
      </Flex>

      <Flex direction="column" gap="1">
        <Flex align="center" justify="between">
          <Text size="1" color="gray">
            Message
          </Text>
          <Tooltip content="Generate commit message with AI">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={onGenerateMessage}
              disabled={isGeneratingMessage || isSubmitting}
            >
              {isGeneratingMessage ? (
                <Spinner size="1" />
              ) : (
                <Sparkle size={14} />
              )}
            </IconButton>
          </Tooltip>
        </Flex>
        <TextArea
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isSubmitting && !isGeneratingMessage) onContinue();
            }
          }}
          placeholder="Leave empty to generate with AI"
          size="1"
          rows={1}
          autoFocus
        />
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Then
        </Text>
        {options.map((opt) => (
          <SelectableOption
            key={opt.id}
            icon={opt.icon}
            label={opt.label}
            selected={nextStep === opt.id}
            disabled={!!opt.disabledReason}
            disabledReason={opt.disabledReason ?? null}
            onSelect={() => onNextStepChange(opt.id)}
          />
        ))}
      </Flex>
    </GitDialog>
  );
}

interface GitPushDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchName: string | null;
  mode: "push" | "sync" | "publish";
  state: "idle" | "success" | "error";
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export function GitPushDialog({
  open,
  onOpenChange,
  branchName,
  mode,
  state,
  error,
  onConfirm,
  onClose,
  isSubmitting,
}: GitPushDialogProps) {
  const config = {
    push: {
      title: "Push changes",
      successTitle: "Push complete",
      button: "Push",
      desc: "Push your latest commits to the remote repository.",
    },
    sync: {
      title: "Sync changes",
      successTitle: "Sync complete",
      button: "Sync",
      desc: "Pull remote changes and push your commits.",
    },
    publish: {
      title: "Publish branch",
      successTitle: "Branch published",
      button: "Publish",
      desc: "Push this branch to the remote repository.",
    },
  }[mode];

  const isSuccess = state === "success";
  const icon = isSuccess ? (
    <CheckCircle size={ICON_SIZE} weight="fill" color="var(--green-9)" />
  ) : (
    <CloudArrowUp size={ICON_SIZE} />
  );

  return (
    <GitDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={icon}
      title={isSuccess ? config.successTitle : config.title}
      error={error}
      buttonLabel={isSuccess ? "Close" : config.button}
      isSubmitting={isSubmitting}
      onSubmit={isSuccess ? onClose : onConfirm}
      hideCancel={isSuccess}
    >
      <InfoRow label="Branch">
        <BranchBadge branch={branchName} />
      </InfoRow>
      {!isSuccess && (
        <Text size="1" color="gray">
          {config.desc}
        </Text>
      )}
    </GitDialog>
  );
}

interface GitPrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseBranch: string | null;
  headBranch: string | null;
  title: string;
  onTitleChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function GitPrDialog({
  open,
  onOpenChange,
  baseBranch,
  headBranch,
  title,
  onTitleChange,
  body,
  onBodyChange,
  onConfirm,
  isSubmitting,
  error,
}: GitPrDialogProps) {
  return (
    <GitDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<GitPullRequest size={ICON_SIZE} />}
      title="Create PR"
      error={error}
      buttonLabel="Create PR"
      buttonDisabled={!title.trim()}
      isSubmitting={isSubmitting}
      onSubmit={onConfirm}
      maxWidth="500px"
    >
      <Flex direction="column" gap="1">
        <InfoRow label="Base">
          <BranchBadge branch={baseBranch} />
        </InfoRow>
        <InfoRow label="Head">
          <BranchBadge branch={headBranch} />
        </InfoRow>
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Title
        </Text>
        <TextField.Root
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="PR title"
          size="1"
          autoFocus
        />
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Description
        </Text>
        <TextArea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Describe your changes"
          size="1"
          rows={6}
        />
      </Flex>
    </GitDialog>
  );
}
