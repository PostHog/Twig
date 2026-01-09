import { upsertStackComment } from "../github/comments";
import { updatePR } from "../github/pr-actions";
import { batchGetPRsForBranches } from "../github/pr-status";
import { getStack, getTrunk } from "../jj";
import { ok, type Result } from "../result";
import {
  generateStackComment,
  mapReviewDecisionToStatus,
  type StackEntry,
} from "../stack-comment";

export async function updateStackComments(): Promise<
  Result<{ updated: number }>
> {
  const trunk = await getTrunk();
  const stackResult = await getStack();
  if (!stackResult.ok) return stackResult;
  if (stackResult.value.length === 0) {
    return ok({ updated: 0 });
  }

  const stack = [...stackResult.value].reverse();

  const bookmarkMap = new Map<
    string,
    { change: (typeof stack)[0]; bookmark: string }
  >();
  const allBookmarks: string[] = [];
  for (const change of stack) {
    const bookmark = change.bookmarks[0];
    if (!bookmark) continue;
    bookmarkMap.set(change.changeId, { change, bookmark });
    allBookmarks.push(bookmark);
  }

  const prsResult = await batchGetPRsForBranches(allBookmarks);
  const prCache = prsResult.ok ? prsResult.value : new Map();

  const prInfos: Array<{
    changeId: string;
    prNumber: number;
    change: (typeof stack)[0];
    bookmark: string;
    currentBase: string;
  }> = [];

  for (const change of stack) {
    const entry = bookmarkMap.get(change.changeId);
    if (!entry) continue;
    const { bookmark } = entry;
    const prItem = prCache.get(bookmark);
    if (prItem) {
      prInfos.push({
        changeId: change.changeId,
        prNumber: prItem.number,
        change,
        bookmark,
        currentBase: prItem.baseRefName,
      });
    }
  }

  if (prInfos.length === 0) {
    return ok({ updated: 0 });
  }

  const statuses = new Map<
    number,
    {
      reviewDecision:
        | "APPROVED"
        | "CHANGES_REQUESTED"
        | "REVIEW_REQUIRED"
        | null;
      state: "OPEN" | "CLOSED" | "MERGED";
    }
  >();
  for (const [, prItem] of prCache) {
    statuses.set(prItem.number, {
      reviewDecision: prItem.reviewDecision ?? null,
      state: prItem.state,
    });
  }

  for (let i = 0; i < prInfos.length; i++) {
    const prInfo = prInfos[i];
    const expectedBase = i === 0 ? trunk : prInfos[i - 1].bookmark;
    if (prInfo.currentBase !== expectedBase) {
      await updatePR(prInfo.prNumber, { base: expectedBase });
    }
  }

  const commentUpserts = prInfos.map((prInfo, i) => {
    const stackEntries: StackEntry[] = prInfos.map((p, idx) => {
      const prStatus = statuses.get(p.prNumber);
      let entryStatus: StackEntry["status"] = "waiting";

      if (idx === i) {
        entryStatus = "this";
      } else if (prStatus) {
        entryStatus = mapReviewDecisionToStatus(
          prStatus.reviewDecision,
          prStatus.state,
        );
      }

      return {
        prNumber: p.prNumber,
        title: p.change.description || `Change ${p.changeId.slice(0, 8)}`,
        status: entryStatus,
      };
    });

    const comment = generateStackComment({ stack: stackEntries });
    return upsertStackComment(prInfo.prNumber, comment);
  });

  await Promise.all(commentUpserts);

  return ok({ updated: prInfos.length });
}
