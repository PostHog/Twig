import { Text } from "@radix-ui/themes";
import type { FocusSagaResult } from "@stores/focusStore";
import { toast } from "@utils/toast";

export function showFocusSuccessToast(
  branchName: string,
  result: FocusSagaResult,
): void {
  const showStashMessage = !!result.session?.mainStashRef && !result.wasSwap;
  toast.success(
    <>
      Now editing{" "}
      <Text style={{ color: "var(--accent-11)" }}>{branchName}</Text>
    </>,
    {
      description: showStashMessage
        ? "Your local changes were stashed and will be restored when you return."
        : undefined,
    },
  );
}
