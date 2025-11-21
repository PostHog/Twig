import { PANEL_SIZES } from "../constants/panelConstants";
import type { GroupPanel } from "../store/panelTypes";

export function calculateDefaultSize(node: GroupPanel, index: number): number {
  return node.sizes?.[index] ?? 100 / node.children.length;
}

export function shouldUpdateSizes(
  currentSizes: number[],
  storeSizes: number[],
): boolean {
  if (currentSizes.length !== storeSizes.length) {
    return false;
  }

  return currentSizes.some(
    (size, i) =>
      Math.abs(size - storeSizes[i]) > PANEL_SIZES.SIZE_DIFF_THRESHOLD,
  );
}
