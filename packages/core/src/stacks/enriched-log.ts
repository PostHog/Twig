import { batchGetPRsForBranches } from "../github/pr-status";
import { getDiffStats, getLog } from "../jj";
import type { EnrichedLogEntry, EnrichedLogResult, PRInfo } from "../log";
import { ok, type Result } from "../result";

export async function getEnrichedLog(): Promise<Result<EnrichedLogResult>> {
  const logResult = await getLog();
  if (!logResult.ok) return logResult;

  const {
    entries,
    trunk,
    currentChangeId,
    currentChangeIdPrefix,
    isOnTrunk,
    hasEmptyWorkingCopy,
    uncommittedWork,
  } = logResult.value;

  const bookmarkToChangeId = new Map<string, string>();
  for (const entry of entries) {
    const bookmark = entry.change.bookmarks[0];
    if (bookmark) {
      bookmarkToChangeId.set(bookmark, entry.change.changeId);
    }
  }
  const bookmarksList = Array.from(bookmarkToChangeId.keys());

  const prInfoMap = new Map<string, PRInfo>();
  if (bookmarksList.length > 0) {
    const prsResult = await batchGetPRsForBranches(bookmarksList);
    if (prsResult.ok) {
      for (const [bookmark, prItem] of prsResult.value) {
        const changeId = bookmarkToChangeId.get(bookmark);
        if (changeId) {
          prInfoMap.set(changeId, {
            number: prItem.number,
            state: prItem.state,
            url: prItem.url,
          });
        }
      }
    }
  }

  const MAX_DIFF_STATS_ENTRIES = 20;
  const diffStatsMap = new Map<
    string,
    { filesChanged: number; insertions: number; deletions: number }
  >();
  if (entries.length <= MAX_DIFF_STATS_ENTRIES) {
    const diffStatsPromises = entries.map(async (entry) => {
      const result = await getDiffStats(entry.change.changeId);
      if (result.ok) {
        diffStatsMap.set(entry.change.changeId, result.value);
      }
    });
    await Promise.all(diffStatsPromises);
  }

  let modifiedCount = 0;
  const enrichedEntries: EnrichedLogEntry[] = entries.map((entry) => {
    if (entry.isModified) modifiedCount++;
    return {
      ...entry,
      prInfo: prInfoMap.get(entry.change.changeId) ?? null,
      diffStats: diffStatsMap.get(entry.change.changeId) ?? null,
    };
  });

  return ok({
    entries: enrichedEntries,
    trunk,
    currentChangeId,
    currentChangeIdPrefix,
    isOnTrunk,
    hasEmptyWorkingCopy,
    uncommittedWork,
    modifiedCount,
  });
}
