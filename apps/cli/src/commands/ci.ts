import {
  checkRulesetExists,
  enableStackCheckProtection,
  getBranchProtectionUrl,
  getRepoInfoFromRemote,
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

  const repoInfo = await getRepoInfo(cwd);
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
    const succeeded = await tryEnableProtection(cwd, repoInfo, rulesetExists);
    if (succeeded) return;
  }

  // Show manual URL if they declined or API failed
  blank();
  const url = getBranchProtectionUrl(repoInfo.owner, repoInfo.repo);
  message("To enable manually, create a ruleset:");
  indent(cyan(url));
  hint("→ Add 'Require status checks' → Type 'Stack Check' → Create");
}

async function getRepoInfo(
  cwd: string,
): Promise<{ owner: string; repo: string } | null> {
  const remoteResult = await shellExecutor.execute(
    "git",
    ["config", "--get", "remote.origin.url"],
    { cwd },
  );

  if (remoteResult.exitCode !== 0) return null;

  const repoInfo = getRepoInfoFromRemote(remoteResult.stdout.trim());
  return repoInfo.ok ? repoInfo.value : null;
}

async function tryEnableProtection(
  cwd: string,
  repoInfo: { owner: string; repo: string },
  isUpdate: boolean,
): Promise<boolean> {
  const trunk = await getTrunk(cwd);

  status(isUpdate ? "Updating ruleset..." : `Creating ruleset for ${trunk}...`);

  const result = await enableStackCheckProtection(
    { owner: repoInfo.owner, repo: repoInfo.repo, trunk },
    shellExecutor,
    cwd,
  );

  const rulesetsUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/settings/rules`;

  if (result.success) {
    if (result.updated) {
      message(formatSuccess("Updated ruleset 'Array Stack Check'"));
    } else if (result.alreadyEnabled) {
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
    return true;
  }

  message(formatError(result.error ?? "Failed to create ruleset"));
  return false;
}
