import type { CommandMeta } from "@twig/core/commands/types";
import {
  createDefaultUserConfig,
  loadUserConfig,
  saveUserConfig,
} from "@twig/core/config";
import {
  blank,
  bold,
  dim,
  green,
  heading,
  hint,
  message,
  warning,
  yellow,
} from "../utils/output";
import { confirm, select } from "../utils/prompt";

export const meta: CommandMeta = {
  name: "config",
  description: "Configure preferences",
  context: "none",
  category: "setup",
};

type ConfigSection = "tips" | "reset";

export async function config(): Promise<void> {
  heading("Array Configuration");

  const section = await select<ConfigSection>(
    "What would you like to configure?",
    [
      { label: "Tips & hints", value: "tips" },
      { label: "Reset all settings", value: "reset" },
    ],
  );

  if (!section) {
    message(dim("Cancelled."));
    return;
  }

  blank();

  switch (section) {
    case "tips":
      await configureTips();
      break;
    case "reset":
      await resetConfig();
      break;
  }
}

async function configureTips(): Promise<void> {
  const userConfig = await loadUserConfig();

  message(bold("Tips & Hints"));
  blank();
  hint(
    `Current setting: ${userConfig.tipsEnabled ? green("enabled") : yellow("disabled")}`,
  );
  hint(`Tips seen: ${userConfig.tipsSeen.length}`);
  blank();

  const action = await select("What would you like to do?", [
    {
      label: userConfig.tipsEnabled ? "Disable tips" : "Enable tips",
      value: "toggle",
    },
    { label: "Reset tips (show them again)", value: "reset" },
    { label: "Back", value: "back" },
  ]);

  if (!action || action === "back") {
    return;
  }

  if (action === "toggle") {
    userConfig.tipsEnabled = !userConfig.tipsEnabled;
    await saveUserConfig(userConfig);
    blank();
    hint(
      `Tips ${userConfig.tipsEnabled ? green("enabled") : yellow("disabled")}.`,
    );
  } else if (action === "reset") {
    userConfig.tipsSeen = [];
    await saveUserConfig(userConfig);
    blank();
    hint("Tips reset. You'll see them again.");
  }
}

async function resetConfig(): Promise<void> {
  message(bold("Reset Configuration"));
  blank();
  warning("This will reset all user preferences to defaults.");
  blank();

  const confirmed = await confirm("Are you sure?");

  if (confirmed === null) {
    message(dim("Cancelled."));
    return;
  }

  if (confirmed) {
    await saveUserConfig(createDefaultUserConfig());
    blank();
    hint("Configuration reset to defaults.");
  } else {
    blank();
    hint("Cancelled.");
  }
}
