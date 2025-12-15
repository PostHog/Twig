import type { CurrentModeUpdate } from "@features/sessions/types";
import { Badge } from "@radix-ui/themes";

interface CurrentModeViewProps {
  update: CurrentModeUpdate;
}

export function CurrentModeView({ update }: CurrentModeViewProps) {
  return (
    <Badge size="1" color="gray" variant="surface">
      Mode: {update.currentModeId}
    </Badge>
  );
}
