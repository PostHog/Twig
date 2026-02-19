import { trpcVanilla } from "@renderer/trpc/client";

type SaveFn = () => Promise<void>;
type DiscardFn = () => void;
type HasUnsavedChangesFn = () => boolean;

interface UnsavedEntry {
  save: SaveFn;
  discard: DiscardFn;
  hasUnsavedChanges: HasUnsavedChangesFn;
}

const registry = new Map<string, UnsavedEntry>();

export function registerUnsavedContent(
  tabId: string,
  entry: UnsavedEntry,
): () => void {
  registry.set(tabId, entry);
  return () => {
    registry.delete(tabId);
  };
}

export function getUnsavedEntry(tabId: string): UnsavedEntry | undefined {
  return registry.get(tabId);
}

export function hasUnsavedChanges(tabId: string): boolean {
  const entry = registry.get(tabId);
  return entry?.hasUnsavedChanges() ?? false;
}

export async function confirmUnsavedChanges(
  tabId: string,
  fileName: string,
): Promise<"save" | "discard" | "cancel"> {
  const entry = registry.get(tabId);
  if (!entry) return "discard";

  const result = await trpcVanilla.os.showMessageBox.mutate({
    options: {
      type: "warning",
      title: "Twig",
      message: `Do you want to save the changes you made to ${fileName}?`,
      detail: "Your changes will be lost if you don't save them.",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
    },
  });

  if (result.response === 0) {
    await entry.save();
    return "save";
  }

  if (result.response === 1) {
    entry.discard();
    return "discard";
  }

  return "cancel";
}
