import {
  GitCommitDialog,
  GitPrDialog,
  GitPushDialog,
} from "@features/git-interaction/components/GitInteractionDialogs";
import { GitInteractionMenu } from "@features/git-interaction/components/GitInteractionMenu";
import { useGitInteraction } from "@features/git-interaction/hooks/useGitInteraction";
import {
  selectWorkspace,
  useWorkspaceStore,
} from "@features/workspace/stores/workspaceStore";
import { selectIsFocusedOnWorktree, useFocusStore } from "@stores/focusStore";

interface GitInteractionHeaderProps {
  taskId: string;
}

export function GitInteractionHeader({ taskId }: GitInteractionHeaderProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(workspace?.worktreePath ?? ""),
  );
  const repoPath = isFocused
    ? workspace?.folderPath
    : (workspace?.worktreePath ?? workspace?.folderPath);
  const { state, modals, actions } = useGitInteraction(taskId, repoPath);

  return (
    <>
      <div className="no-drag">
        <GitInteractionMenu
          primaryAction={state.primaryAction}
          actions={state.actions}
          isBusy={modals.isSubmitting}
          onPrimary={actions.openAction}
          onSelect={actions.openAction}
        />
      </div>

      <GitCommitDialog
        open={modals.commitOpen}
        onOpenChange={(open) => {
          if (!open) actions.closeCommit();
        }}
        branchName={state.currentBranch}
        diffStats={state.diffStats}
        commitMessage={modals.commitMessage}
        onCommitMessageChange={actions.setCommitMessage}
        nextStep={modals.commitNextStep}
        onNextStepChange={actions.setCommitNextStep}
        prDisabledReason={state.prDisabledReason}
        pushDisabledReason={state.pushDisabledReason}
        onContinue={actions.runCommit}
        isSubmitting={modals.isSubmitting}
        error={modals.commitError}
        onGenerateMessage={actions.generateCommitMessage}
        isGeneratingMessage={modals.isGeneratingCommitMessage}
      />

      <GitPushDialog
        open={modals.pushOpen}
        onOpenChange={(open) => {
          if (!open) actions.closePush();
        }}
        branchName={state.currentBranch}
        mode={modals.pushMode}
        state={modals.pushState}
        error={modals.pushError}
        onConfirm={actions.runPush}
        onClose={actions.closePush}
        isSubmitting={modals.isSubmitting}
      />

      <GitPrDialog
        open={modals.prOpen}
        onOpenChange={(open) => {
          if (!open) actions.closePr();
        }}
        baseBranch={state.prBaseBranch}
        headBranch={state.prHeadBranch}
        title={modals.prTitle}
        onTitleChange={actions.setPrTitle}
        body={modals.prBody}
        onBodyChange={actions.setPrBody}
        onConfirm={actions.runPr}
        isSubmitting={modals.isSubmitting}
        error={modals.prError}
        onGenerate={actions.generatePrTitleAndBody}
        isGenerating={modals.isGeneratingPr}
      />
    </>
  );
}
