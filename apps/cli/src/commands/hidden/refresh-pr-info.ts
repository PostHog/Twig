import { syncPRInfo } from "@array/core/commands/sync-pr-info";
import { initContext } from "@array/core/engine";

/**
 * Background PR info refresh command.
 * Called by triggerBackgroundRefresh() as a detached process.
 * Silently syncs PR info and exits.
 */
export async function refreshPRInfo(): Promise<void> {
  try {
    const context = await initContext();
    await syncPRInfo({ engine: context.engine });
    context.engine.persist();
  } catch {
    // Silent failure - background task shouldn't crash
  }
}
