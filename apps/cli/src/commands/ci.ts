import {
  checkRulesetExists,
  enableStackCheckProtection,
  getBranchProtectionUrl,
  getRepoInfo,
  setupCI,
} from "@array/core/ci";
import type { CommandMeta } from "@array/core/commands/types";
import { shellExecutor } from "@array/core/executor";
import { getTrunk } from "@array/core/jj";
import {
  blank,
  cyan,
  formatError,
  formatSuccess,
  hint,
  indent,
  message,
  status,
  warning,
} from "../utils/output";
import { confirm } from "../utils/prompt";

export const meta: CommandMeta = {
  name: "ci",
  description: "Set up GitHub CI for stack checks",
  context: "jj",
  category: "setup",
};

export async function ci(): Promise<void> {
  const cwd = process.cwd();

  // Always write workflow file (create or update)
  const result = setupCI(cwd);
  if (result.created) {
    message(formatSuccess("Created .github/workflows/array-stack-check.yml"));
  } else if (result.updated) {
    message(formatSuccess("Updated .github/workflows/array-stack-check.yml"));
  }

  const repoInfo = await getRepoInfo(cwd, shellExecutor);
  if (!repoInfo) {
    blank();
    warning("Could not determine repository.");
    hint(
      "Manually add 'Stack Check' as a required status check in GitHub settings.",
    );
    return;
  }

  blank();

  // Check if ruleset already exists to show appropriate prompt
  const rulesetExists = await checkRulesetExists(
    repoInfo.owner,
    repoInfo.repo,
    shellExecutor,
    cwd,
  );

  const prompt = rulesetExists
    ? "Update ruleset to latest? (needs admin access)"
    : "Enable 'Stack Check' as required? (needs admin access)";

  const shouldProceed = await confirm(prompt);

  if (shouldProceed) {
    const trunk = await getTrunk(cwd);
    status(
      rulesetExists
        ? "Updating ruleset..."
        : `Creating ruleset for ${trunk}...`,
    );

    const protectionResult = await enableStackCheckProtection(
      { owner: repoInfo.owner, repo: repoInfo.repo, trunk },
      shellExecutor,
      cwd,
    );

    const rulesetsUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/settings/rules`;

    if (protectionResult.success) {
      if (protectionResult.updated) {
        message(formatSuccess("Updated ruleset 'Array Stack Check'"));
      } else if (protectionResult.alreadyEnabled) {
        message(formatSuccess("Ruleset 'Array Stack Check' already exists"));
      } else {
        message(formatSuccess("Created ruleset 'Array Stack Check'"));
      }
      blank();
      message(
        "PRs in a stack will now be blocked until their downstack PRs are merged.",
      );
      blank();
      message("View or edit the ruleset:");
      indent(cyan(rulesetsUrl));
      return;
    }

    message(formatError(protectionResult.error ?? "Failed to create ruleset"));
  }

  // Show manual URL if they declined or API failed
  blank();
  const url = getBranchProtectionUrl(repoInfo.owner, repoInfo.repo);
  message("To enable manually, create a ruleset:");
  indent(cyan(url));
  hint("→ Add 'Require status checks' → Type 'Stack Check' → Create");
}
