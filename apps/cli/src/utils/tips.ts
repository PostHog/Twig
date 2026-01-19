import { getTip, markTipSeen, shouldShowTip } from "@twig/core/config";
import { blank, cmd, dim, hint } from "./output";

function formatTip(tip: string): string {
  return tip.replace(/`([^`]+)`/g, (_, command) => cmd(command));
}

export async function showTip(command: string): Promise<void> {
  const tip = getTip(command);
  if (!tip) return;

  const show = await shouldShowTip(command);
  if (!show) return;

  blank();
  hint(`${dim("Tip:")} ${formatTip(tip)}`);

  await markTipSeen(command);
}
