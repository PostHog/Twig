import type { PostHogAPIClient } from "@api/posthogClient";

// Lifted from https://github.com/PostHog/wizard/blob/909baaf229a082b9f842fa215a520c87b5b1c359/src/lib/agent-runner.ts#L333
// One difference from the Wizard: Wizard first identifies the relevant framework programatically, while here we have the agent do that
export const SETUP_TASK_PROMPT = `You have access to the PostHog MCP server which provides skills to integrate PostHog into this project.

Instructions (follow these steps IN ORDER - do not skip or reorder):

STEP 1: List available skills from the PostHog MCP server using ListMcpResourcesTool.
   Review the skill descriptions and choose the one that best matches this project's framework and configuration.
   If no suitable skill is found, or you cannot access the MCP server, report: "Could not find a suitable skill for this project."

STEP 2: Fetch the chosen skill resource (e.g., posthog://skills/{skill-id}).
   The resource returns a shell command to install the skill.

STEP 3: Run the installation command using Bash:
   - Execute the EXACT command returned by the resource (do not modify it)
   - This will download and extract the skill to .claude/skills/{skill-id}/

STEP 4: Load the installed skill's SKILL.md file to understand what references are available.

STEP 5: Follow the skill's workflow files in sequence. Look for numbered workflow files in the references (e.g., files with patterns like "1.0-", "1.1-", "1.2-"). Start with the first one and proceed through each step until completion. Each workflow file will tell you what to do and which file comes next.

STEP 6: Set up environment variables for PostHog in a .env file with the API key and host, using the appropriate naming convention for this project. Make sure to use these environment variables in the code files you create instead of hardcoding the API key and host.

Important: Look for lockfiles (pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lockb) to determine the package manager. Do not manually edit package.json. Always install packages as a background task. Don't await completion; proceed with other work immediately after starting the installation.`;

/**
 * Create a task for setting up PostHog using MCP skills.
 * Returns the created task.
 */
export async function createPostHogSetupTask(client: PostHogAPIClient) {
  return client.createTask({
    title: "Set up PostHog for Autonomy",
    description: SETUP_TASK_PROMPT,
    origin_product: "session_summaries",
  });
}
