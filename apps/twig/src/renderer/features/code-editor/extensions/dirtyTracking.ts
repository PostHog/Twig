import type { Extension } from "@codemirror/state";
import { Annotation, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Annotation to mark programmatic updates (load, revert) vs user edits.
 * User edits don't have this annotation, so we can distinguish them.
 */
export const programmaticUpdate = Annotation.define<boolean>();

/**
 * Effect to reset the baseline (e.g., after save or initial load).
 */
export const setBaselineEffect = StateEffect.define<string>();

/**
 * StateField that tracks if the document is dirty relative to a baseline.
 *
 * - Stores the baseline content as a string
 * - Marks dirty if user makes changes (transactions without programmaticUpdate annotation)
 * - Can be reset via setBaselineEffect
 */
const dirtyStateField = StateField.define<{
  baseline: string;
  isDirty: boolean;
}>({
  create: (state) => ({
    baseline: state.doc.toString(),
    isDirty: false,
  }),

  update: (value, tr) => {
    // Handle baseline reset
    for (const effect of tr.effects) {
      if (effect.is(setBaselineEffect)) {
        return {
          baseline: effect.value,
          isDirty: false,
        };
      }
    }

    // If no doc changes, keep current state
    if (!tr.docChanged) {
      return value;
    }

    // If this is a programmatic update, don't mark as dirty
    if (tr.annotation(programmaticUpdate)) {
      return value;
    }

    // User edit detected - check if we're now dirty
    const currentContent = tr.newDoc.toString();
    const isDirty = currentContent !== value.baseline;

    return {
      ...value,
      isDirty,
    };
  },
});

/**
 * Extension that provides dirty tracking with optional change callback.
 *
 * Usage:
 * ```ts
 * const extensions = [
 *   dirtyTracking((isDirty) => console.log('Dirty state:', isDirty)),
 *   // ... other extensions
 * ];
 *
 * // Check if dirty
 * const isDirty = view.state.field(dirtyStateField).isDirty;
 *
 * // Reset baseline after save
 * view.dispatch({
 *   effects: setBaselineEffect.of(view.state.doc.toString())
 * });
 *
 * // Load new content without marking dirty
 * view.dispatch({
 *   changes: { from: 0, to: view.state.doc.length, insert: newContent },
 *   annotations: programmaticUpdate.of(true)
 * });
 * ```
 */
export function dirtyTracking(
  onChange?: (isDirty: boolean) => void,
): Extension {
  const extensions: Extension[] = [dirtyStateField];

  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (
          update.docChanged ||
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(setBaselineEffect)),
          )
        ) {
          const dirty = update.state.field(dirtyStateField).isDirty;
          onChange(dirty);
        }
      }),
    );
  }

  return extensions;
}

/**
 * Get dirty state from an EditorView.
 */
export function isDirty(view: EditorView): boolean {
  return view.state.field(dirtyStateField).isDirty;
}

/**
 * Reset the baseline to current content (call after save or initial load).
 */
export function resetBaseline(view: EditorView): void {
  view.dispatch({
    effects: setBaselineEffect.of(view.state.doc.toString()),
  });
}
