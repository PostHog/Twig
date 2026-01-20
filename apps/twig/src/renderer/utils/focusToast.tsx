import { Text } from "@radix-ui/themes";
import type { EnableFocusResult } from "@stores/focusStore";
import { toast } from "@utils/toast";

export function showFocusSuccessToast(
  branchName: string,
  result: EnableFocusResult,
): void {
  // Only show stash message if we actually stashed from original branch (not a swap)
  const showStashMessage = !!result.mainStashRef && !result.wasSwap;
  toast.success(
    <>
      Now editing{" "}
      <Text style={{ color: "var(--accent-11)" }}>{branchName}</Text>
    </>,
    {
      description: showStashMessage
        ? "Your changes were stashed and will be restored when you return."
        : undefined,
    },
  );
}
