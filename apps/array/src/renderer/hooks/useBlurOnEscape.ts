import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { useHotkeys } from "react-hotkeys-hook";

export function useBlurOnEscape() {
  useHotkeys(
    SHORTCUTS.BLUR,
    () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  useHotkeys(
    SHORTCUTS.SUBMIT_BLUR,
    () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );
}
